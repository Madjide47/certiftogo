// ─────────────────────────────────────────────────────────────
// Service "lot de transmission".
//
// Côté établissement : un clic transmet la promotion entière. Le système
// génère un dossier par étudiant admis, horodate l'envoi et retient
// l'agent émetteur.
//
// Côté ministère : l'instruction porte sur le lot, la décision sur le
// dossier. Un lot peut être partiellement traité — 247 validés, 3
// renvoyés — parce que trois anomalies ne doivent pas bloquer 250
// diplômés.
// ─────────────────────────────────────────────────────────────
import { withTransaction } from '../config/database.js';
import * as lotModel from '../models/lot.model.js';
import * as dossierModel from '../models/dossier.model.js';
import * as promotionModel from '../models/promotion.model.js';
import * as inscriptionModel from '../models/inscription.model.js';
import { controlerLot } from './controle.service.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import { genererReferenceDossier } from '../utils/reference-generator.js';
import { journaliser, journaliserStatutDossier, ACTIONS } from './audit.service.js';
import { nettoyerTexte, estUuidValide, estDansEnum, estDateValide } from '../utils/validators.js';

const STATUTS_LOT = ['transmis', 'en_examen', 'valide', 'partiellement_traite', 'rejete', 'certifie'];
const INSTRUISABLES = ['transmis', 'en_examen'];

/** Référence de lot : LOT-AAAA-XXXXX */
function genererReferenceLot(annee = new Date().getFullYear()) {
  return `LOT-${annee}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
}

// ── Transmission (établissement) ───────────────────────────────────

/**
 * Transmet une promotion entière au ministère.
 * Atomique : soit le lot et tous ses dossiers existent, soit rien.
 */
export async function transmettre(promotion_id, etablissement_id, agent, donnees = {}) {
  if (!estUuidValide(promotion_id)) {
    throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  }

  const promotion = await promotionModel.trouverParId(promotion_id);
  if (!promotion || promotion.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  }
  if (promotion.statut !== 'ouverte') {
    throw new ErreurApp(
      409,
      'PROMOTION_NON_TRANSMISSIBLE',
      `Une promotion « ${promotion.statut} » ne peut pas être transmise. Ouvrez-la d'abord.`
    );
  }

  // La date de délibération fait foi comme date d'obtention des diplômes.
  const dateDeliberation = nettoyerTexte(donnees.date_deliberation) || promotion.date_deliberation;
  if (!dateDeliberation) {
    throw new ErreurApp(
      400,
      'DELIBERATION_REQUISE',
      'La date de délibération est requise : elle fait foi comme date d\'obtention.'
    );
  }
  if (!estDateValide(String(dateDeliberation).slice(0, 10))) {
    throw new ErreurApp(400, 'DATE_INVALIDE', 'Date de délibération invalide (AAAA-MM-JJ).');
  }

  const inscriptions = await inscriptionModel.listerParPromotion(promotion_id);
  // Seuls les admis sont transmis : on ne certifie pas un ajourné.
  const admis = inscriptions.filter((i) => i.statut === 'admis');

  if (inscriptions.length === 0) {
    throw new ErreurApp(
      409,
      'PROMOTION_VIDE',
      'Aucun étudiant inscrit dans cette promotion.'
    );
  }
  if (admis.length === 0) {
    throw new ErreurApp(
      409,
      'AUCUN_ADMIS',
      `Aucun étudiant admis parmi les ${inscriptions.length} inscrits. Saisissez les résultats de la délibération avant de transmettre.`
    );
  }

  return avecErreursSql(() =>
    withTransaction(async (client) => {
      const lot_id = await lotModel.creer(
        {
          reference: genererReferenceLot(),
          promotion_id,
          etablissement_id,
          agent_emetteur_id: agent.utilisateur_id,
          effectif: admis.length,
        },
        client
      );

      for (const inscription of admis) {
        await client.query(
          `INSERT INTO dossiers
             (reference, etablissement_id, candidat_id, filiere, mention,
              date_obtention, type_diplome, annee_academique,
              statut, date_transmission, agent_etablissement_id, lot_id, promotion_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'soumis', now(), $9, $10, $11)`,
          [
            genererReferenceDossier(),
            etablissement_id,
            inscription.candidat_id,
            promotion.filiere_nom,
            inscription.mention,
            dateDeliberation,
            promotion.type_diplome,
            promotion.annee_libelle,
            agent.utilisateur_id,
            lot_id,
            promotion_id,
          ]
        );
      }

      await client.query(
        `UPDATE promotions SET statut = 'transmise', date_deliberation = $2 WHERE id = $1`,
        [promotion_id, dateDeliberation]
      );

      // Chronologie de chaque dossier créé : « soumis » est son premier état.
      const { rows: crees } = await client.query(
        `SELECT id FROM dossiers WHERE lot_id = $1`,
        [lot_id]
      );
      for (const { id } of crees) {
        await journaliserStatutDossier(
          {
            dossier_id: id,
            statut_avant: null,
            statut_apres: 'soumis',
            motif: 'Transmission de la promotion.',
            lot_id,
          },
          client
        );
      }

      await journaliser(
        {
          action: ACTIONS.LOT_TRANSMIS,
          entite: 'lots_transmission',
          entite_id: lot_id,
          etablissement_id,
          apres: { promotion_id, effectif: admis.length, date_deliberation: dateDeliberation },
          message: `${admis.length} dossier(s) transmis pour « ${promotion.libelle} ».`,
        },
        client
      );

      return lot_id;
    })
  ).then(async (lot_id) => ({
    // Relu APRÈS le commit : `trouverParId` passe par le pool, donc par une
    // autre connexion, qui ne verrait pas encore la ligne non validée.
    lot: await lotModel.trouverParId(lot_id),
    transmis: admis.length,
    non_transmis: inscriptions.length - admis.length,
  }));
}

// ── Instruction (ministère) ────────────────────────────────────────

export async function lister({ statut } = {}) {
  if (!estDansEnum(statut, STATUTS_LOT)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de lot inconnu.');
  }
  const lots = await lotModel.lister({ statut: nettoyerTexte(statut) });
  const repartition = await lotModel.compterParStatut();
  return { lots, repartition };
}

export async function recuperer(id) {
  if (!estUuidValide(id)) throw new ErreurApp(404, 'LOT_INTROUVABLE', 'Lot introuvable.');
  const lot = await lotModel.trouverParId(id);
  if (!lot) throw new ErreurApp(404, 'LOT_INTROUVABLE', 'Lot introuvable.');
  return lot;
}

/** Vue d'instruction : le lot, ses dossiers, et le résultat des contrôles. */
export async function detailler(id) {
  const lot = await recuperer(id);
  const dossiers = await lotModel.listerDossiers(id);
  const controles = await controlerLot(lot);
  return { lot, dossiers, controles };
}

export async function examiner(id, agent_ministere_id) {
  const lot = await recuperer(id);
  if (lot.statut !== 'transmis') {
    throw new ErreurApp(
      409,
      'LOT_NON_INSTRUISABLE',
      `Un lot « ${lot.statut} » n'est plus à examiner.`
    );
  }

  const controles = await controlerLot(lot);
  await lotModel.changerStatut(id, {
    statut: 'en_examen',
    agent_ministere_id,
    rapport_controles: controles,
  });

  await journaliser({
    action: ACTIONS.LOT_EXAMINE,
    entite: 'lots_transmission',
    entite_id: id,
    etablissement_id: lot.etablissement_id,
    apres: { statut: 'en_examen' },
    message: `${controles.bloquants.length} dossier(s) bloquant(s), ${controles.anomalies.length} anomalie(s).`,
  });

  return { lot: await lotModel.trouverParId(id), controles };
}

/**
 * Validation du lot, avec rejet partiel.
 *
 * Sont rejetés : les dossiers signalés bloquants par les contrôles
 * automatiques, plus ceux que l'agent désigne explicitement. Les autres
 * sont validés et deviennent certifiables.
 */
export async function valider(id, agent_ministere_id, donnees = {}) {
  const lot = await recuperer(id);
  if (!INSTRUISABLES.includes(lot.statut)) {
    throw new ErreurApp(409, 'LOT_NON_INSTRUISABLE', `Un lot « ${lot.statut} » est déjà traité.`);
  }

  const controles = await controlerLot(lot);
  const dossiers = await lotModel.listerDossiers(id);

  // Rejets demandés par l'agent, indexés par dossier.
  const rejetsManuels = new Map();
  for (const rejet of donnees.dossiers_rejetes || []) {
    const dossier_id = nettoyerTexte(rejet?.dossier_id);
    const motif = nettoyerTexte(rejet?.motif);
    if (!dossier_id) continue;
    if (!motif) {
      throw new ErreurApp(400, 'MOTIF_REQUIS', 'Chaque rejet doit porter un motif.');
    }
    if (!dossiers.some((d) => d.id === dossier_id)) {
      throw new ErreurApp(400, 'DOSSIER_HORS_LOT', 'Un dossier rejeté n\'appartient pas à ce lot.');
    }
    rejetsManuels.set(dossier_id, motif);
  }

  // Rejets automatiques : les contrôles bloquants font foi.
  const rejetsAutomatiques = new Map(
    controles.bloquants.map((b) => [b.dossier_id, `Contrôle automatique : ${b.erreurs.join(' ; ')}`])
  );

  const aRejeter = new Map([...rejetsAutomatiques, ...rejetsManuels]);
  const aValider = dossiers.filter((d) => !aRejeter.has(d.id));

  if (aValider.length === 0) {
    throw new ErreurApp(
      409,
      'AUCUN_DOSSIER_VALIDABLE',
      'Tous les dossiers du lot sont en erreur. Rejetez le lot ou demandez une correction.'
    );
  }

  const parId = new Map(dossiers.map((d) => [d.id, d]));

  await withTransaction(async (client) => {
    for (const dossier of aValider) {
      await client.query(
        `UPDATE dossiers
            SET statut = 'valide', motif_rejet = NULL,
                agent_ministere_id = $2, date_traitement = now()
          WHERE id = $1`,
        [dossier.id, agent_ministere_id]
      );
      await journaliserStatutDossier(
        {
          dossier_id: dossier.id,
          statut_avant: dossier.statut,
          statut_apres: 'valide',
          lot_id: id,
        },
        client
      );
    }

    for (const [dossier_id, motif] of aRejeter) {
      await client.query(
        `UPDATE dossiers
            SET statut = 'rejete', motif_rejet = $3,
                agent_ministere_id = $2, date_traitement = now()
          WHERE id = $1`,
        [dossier_id, agent_ministere_id, motif]
      );
      await journaliserStatutDossier(
        {
          dossier_id,
          statut_avant: parId.get(dossier_id)?.statut || null,
          statut_apres: 'rejete',
          motif,
          lot_id: id,
        },
        client
      );
    }

    const statutLot = aRejeter.size > 0 ? 'partiellement_traite' : 'valide';

    await lotModel.changerStatut(
      id,
      { statut: statutLot, agent_ministere_id, rapport_controles: controles },
      client
    );

    await journaliser(
      {
        action: ACTIONS.LOT_VALIDE,
        entite: 'lots_transmission',
        entite_id: id,
        etablissement_id: lot.etablissement_id,
        apres: { statut: statutLot, valides: aValider.length, rejetes: aRejeter.size },
        message: `${aValider.length} validé(s), ${aRejeter.size} rejeté(s).`,
      },
      client
    );
  });

  return {
    lot: await lotModel.trouverParId(id),
    valides: aValider.length,
    rejetes: aRejeter.size,
    details_rejets: [...aRejeter].map(([dossier_id, motif]) => ({ dossier_id, motif })),
  };
}

/** Rejet du lot entier : la promotion repart en correction. */
export async function rejeter(id, agent_ministere_id, motif) {
  const lot = await recuperer(id);
  if (!INSTRUISABLES.includes(lot.statut)) {
    throw new ErreurApp(409, 'LOT_NON_INSTRUISABLE', `Un lot « ${lot.statut} » est déjà traité.`);
  }

  const motif_rejet = nettoyerTexte(motif);
  if (!motif_rejet) {
    throw new ErreurApp(400, 'MOTIF_REQUIS', 'Un motif de rejet est obligatoire.');
  }

  const dossiers = await lotModel.listerDossiers(id);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE dossiers
          SET statut = 'rejete', motif_rejet = $2,
              agent_ministere_id = $3, date_traitement = now()
        WHERE lot_id = $1`,
      [id, motif_rejet, agent_ministere_id]
    );
    for (const dossier of dossiers) {
      await journaliserStatutDossier(
        {
          dossier_id: dossier.id,
          statut_avant: dossier.statut,
          statut_apres: 'rejete',
          motif: motif_rejet,
          lot_id: id,
        },
        client
      );
    }

    await lotModel.changerStatut(id, { statut: 'rejete', motif_rejet, agent_ministere_id }, client);

    await journaliser(
      {
        action: ACTIONS.LOT_REJETE,
        entite: 'lots_transmission',
        entite_id: id,
        etablissement_id: lot.etablissement_id,
        apres: { statut: 'rejete', motif_rejet },
        message: `${dossiers.length} dossier(s) renvoyés : ${motif_rejet}`,
      },
      client
    );

    // L'établissement doit pouvoir corriger puis retransmettre.
    await client.query(`UPDATE promotions SET statut = 'ouverte' WHERE id = $1`, [lot.promotion_id]);
  });

  return lotModel.trouverParId(id);
}

/** Lots d'un établissement — suivi côté émetteur. */
export async function listerPourEtablissement(etablissement_id, { statut } = {}) {
  if (!estDansEnum(statut, STATUTS_LOT)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de lot inconnu.');
  }
  return lotModel.lister({ etablissement_id, statut: nettoyerTexte(statut) });
}

export async function detaillerPourEtablissement(id, etablissement_id) {
  const lot = await recuperer(id);
  if (lot.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'LOT_INTROUVABLE', 'Lot introuvable.');
  }
  return { lot, dossiers: await lotModel.listerDossiers(id) };
}
