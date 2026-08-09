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
import * as pieces from './piece-jointe.service.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import { genererReferenceDossier } from '../utils/reference-generator.js';
import { journaliser, journaliserStatutDossier, ACTIONS } from './audit.service.js';
import * as notifications from './notification.service.js';
import * as permissions from './permissions.service.js';
import {
  nettoyerTexte,
  estUuidValide,
  estDansEnum,
  canoniserDate,
  FORMATS_DATE_ACCEPTES,
} from '../utils/validators.js';

const STATUTS_LOT = ['transmis', 'en_examen', 'valide', 'partiellement_traite', 'rejete', 'certifie'];
const INSTRUISABLES = ['transmis', 'en_examen'];

/** Référence de lot : LOT-AAAA-XXXXX */
function genererReferenceLot(annee = new Date().getFullYear()) {
  return `LOT-${annee}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
}

// ── Transmission (établissement) ───────────────────────────────────

/**
 * État de préparation d'une promotion, AVANT de transmettre.
 *
 * L'agent découvrait les manques au moment du clic, sous forme d'un
 * refus. Un refus ne se corrige pas : il faut ressortir de l'écran,
 * retrouver les étudiants cités dans le message, compléter, revenir.
 * Ce rapport dit la même chose avant, sous une forme sur laquelle on
 * peut travailler.
 *
 * Aucune écriture : c'est une lecture, et le serveur revérifiera tout
 * à la transmission. Ce que l'écran affiche n'autorise rien.
 */
export async function preparerTransmission(promotion_id, etablissement_id) {
  if (!estUuidValide(promotion_id)) {
    throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  }
  const promotion = await promotionModel.trouverParId(promotion_id);
  if (!promotion || promotion.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  }

  const inscriptions = await inscriptionModel.listerParPromotion(promotion_id);
  const admis = inscriptions.filter((i) => i.statut === 'admis');

  const sansNumero = admis
    .filter((i) => !i.telephone)
    .map((i) => ({
      candidat_id: i.candidat_id,
      nom: i.nom,
      prenom: i.prenom,
      numero_etudiant: i.numero_etudiant,
    }));

  const etatPieces = await pieces.controlerAvantTransmission(
    promotion_id,
    admis.map((i) => ({
      candidat_id: i.candidat_id,
      nom: i.nom,
      prenom: i.prenom,
      numero_etudiant: i.numero_etudiant,
    }))
  );

  const urgents = admis.filter((i) => i.priorite === 'urgente').length;

  return {
    promotion: {
      id: promotion.id,
      libelle: promotion.libelle,
      statut: promotion.statut,
      date_deliberation: promotion.date_deliberation,
    },
    inscrits: inscriptions.length,
    admis: admis.length,
    non_transmis: inscriptions.length - admis.length,
    urgents,
    sans_numero: sansNumero,
    pieces: {
      incomplets: etatPieces.incomplets,
      manquants_collectifs: etatPieces.manquantsCollectifs,
    },
    // Le bouton reste actif quoi qu'il arrive : ce drapeau sert à
    // afficher l'obstacle, pas à masquer l'action. C'est le serveur qui
    // refuse, et son refus est la seule autorité.
    transmissible:
      admis.length > 0 && sansNumero.length === 0 && etatPieces.complet,
  };
}

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
  // En mode hiérarchique, seule une promotion validée en interne part au
  // ministère : celui qui saisit n'est pas celui qui engage l'établissement.
  // ERR-005 : un établissement suspendu ne transmet plus. Ses diplômes
  // déjà certifiés restent valides — la suspension vise l'avenir, pas le
  // passé — et ses dossiers en cours restent consultables.
  const { rows: etat } = await (await import('../config/database.js')).query(
    `SELECT statut FROM etablissements WHERE id = $1`,
    [etablissement_id]
  );
  if (etat[0] && etat[0].statut !== 'actif') {
    throw new ErreurApp(
      409,
      'ETABLISSEMENT_SUSPENDU',
      `Établissement ${etat[0].statut} : les transmissions au ministère sont gelées.`
    );
  }

  const mode = await permissions.modeWorkflow(etablissement_id);
  const statutRequis = mode === 'hierarchique' ? 'validee_interne' : 'ouverte';

  if (promotion.statut !== statutRequis) {
    throw new ErreurApp(
      409,
      'PROMOTION_NON_TRANSMISSIBLE',
      mode === 'hierarchique'
        ? `Une promotion « ${promotion.statut} » ne peut pas être transmise : elle doit d'abord être contrôlée puis validée en interne.`
        : `Une promotion « ${promotion.statut} » ne peut pas être transmise. Ouvrez-la d'abord.`
    );
  }

  // La date de délibération fait foi comme date d'obtention des diplômes.
  const deliberationSaisie =
    nettoyerTexte(donnees.date_deliberation) || promotion.date_deliberation;
  if (!deliberationSaisie) {
    throw new ErreurApp(
      400,
      'DELIBERATION_REQUISE',
      'La date de délibération est requise : elle fait foi comme date d\'obtention.'
    );
  }
  const dateDeliberation = canoniserDate(deliberationSaisie);
  if (!dateDeliberation) {
    throw new ErreurApp(
      400,
      'DATE_INVALIDE',
      `Date de délibération illisible. Formats acceptés : ${FORMATS_DATE_ACCEPTES}.`
    );
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

  // A-17 — un diplômé sans numéro ne recevra jamais son diplôme et ne
  // pourra jamais ouvrir son portefeuille : la certification produirait
  // un acte que son titulaire ignore. Le manque se corrige en amont, à
  // l'établissement, pas après l'ancrage sur la blockchain.
  const sansNumero = admis.filter((i) => !i.telephone);
  if (sansNumero.length > 0) {
    const exemples = sansNumero
      .slice(0, 5)
      .map((i) => `${i.nom} ${i.prenom} (${i.numero_etudiant})`)
      .join(', ');
    throw new ErreurApp(
      409,
      'NUMERO_MANQUANT',
      `${sansNumero.length} étudiant(s) admis n'ont pas de numéro de téléphone : ${exemples}${sansNumero.length > 5 ? '…' : ''}. ` +
        'Sans numéro, le diplômé ne peut ni être averti de sa certification ni accéder à son portefeuille. Complétez leurs fiches avant de transmettre.'
    );
  }

  // Les pièces justificatives font partie du dossier, pas de son
  // accompagnement. Le contrôle existait déjà, mais il se jouait à la
  // RÉCEPTION : le ministère rejetait, et l'établissement redéposait
  // quelques jours plus tard un document qu'il avait sous la main depuis
  // le début. Le même contrôle, joué ici, ne coûte que le temps de
  // cliquer sur « déposer ».
  const etatPieces = await pieces.controlerAvantTransmission(
    promotion_id,
    admis.map((i) => ({
      candidat_id: i.candidat_id,
      nom: i.nom,
      prenom: i.prenom,
      numero_etudiant: i.numero_etudiant,
    }))
  );

  if (etatPieces.manquantsCollectifs.length > 0) {
    throw new ErreurApp(
      409,
      'PIECES_COLLECTIVES_MANQUANTES',
      `Acte(s) de délibération manquant(s) pour la promotion : ${etatPieces.manquantsCollectifs.join(', ')}. Déposez-les avant de transmettre.`
    );
  }

  if (etatPieces.incomplets.length > 0) {
    const exemples = etatPieces.incomplets
      .slice(0, 5)
      .map((e) => `${e.nom} ${e.prenom} (${e.numero_etudiant}) — ${e.manquants.join(', ')}`)
      .join(' ; ');
    throw new ErreurApp(
      409,
      'PIECES_MANQUANTES',
      `${etatPieces.incomplets.length} étudiant(s) admis n'ont pas toutes leurs pièces obligatoires : ${exemples}${etatPieces.incomplets.length > 5 ? '…' : ''}. ` +
        'Complétez leur dossier avant de transmettre — sans ces actes, le ministère ne peut rien instruire.',
      { incomplets: etatPieces.incomplets }
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
        // L'urgence déclarée sur l'inscription suit le dossier : sans ce
        // report, l'établissement aurait signalé un cas pressant que le
        // ministère ne verrait jamais.
        const urgent = inscription.priorite === 'urgente';
        await client.query(
          `INSERT INTO dossiers
             (reference, etablissement_id, candidat_id, filiere, mention,
              date_obtention, type_diplome, annee_academique,
              statut, date_transmission, agent_etablissement_id, lot_id, promotion_id,
              priorite, motif_urgence, date_echeance,
              priorite_definie_par_id, date_priorite)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'soumis', now(), $9, $10, $11,
                   $12, $13, $14, $15, $16)`,
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
            urgent ? 'urgente' : 'normale',
            urgent ? inscription.motif_urgence : null,
            urgent ? inscription.date_echeance : null,
            urgent ? agent.utilisateur_id : null,
            urgent ? new Date() : null,
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
  ).then(async (lot_id) => {
    // Le ministere doit savoir qu'un lot l'attend : sans cela il faudrait
    // consulter l'interface au hasard pour decouvrir le travail a faire.
    await notifications.notifierRole(notifications.EVENEMENTS.LOT_RECU, 'ministere', {
      etablissement: promotion.etablissement_nom || 'Un etablissement',
      effectif: admis.length,
      promotion: promotion.libelle,
      reference: (await lotModel.trouverParId(lot_id))?.reference,
      entite: 'lots_transmission',
      entite_id: lot_id,
    });
    return {
    // Relu APRÈS le commit : `trouverParId` passe par le pool, donc par une
    // autre connexion, qui ne verrait pas encore la ligne non validée.
      lot: await lotModel.trouverParId(lot_id),
      transmis: admis.length,
      non_transmis: inscriptions.length - admis.length,
    };
  });
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

/**
 * Vue d'instruction : le lot, ses dossiers, les contrôles — et, sur
 * chaque dossier, ce qui l'empêche encore d'être validé.
 *
 * Sans cette imputation ligne à ligne, l'écran ne pouvait dire que
 * « 12 pièces non examinées » sans jamais dire lesquelles : l'agent
 * n'avait aucun moyen de savoir sur quoi il pouvait déjà statuer.
 */
export async function detailler(id) {
  const lot = await recuperer(id);
  const bruts = await lotModel.listerDossiers(id);
  const controles = await controlerLot(lot);
  const obstacles = await pieces.obstaclesParDossier(lot, bruts);
  const bloquantsAuto = new Map(controles.bloquants.map((b) => [b.dossier_id, b.erreurs]));

  const dossiers = bruts.map((d) => {
    const raisons = [
      ...new Set([
        ...(obstacles.parDossier.get(d.id) || []),
        ...(bloquantsAuto.get(d.id) || []),
      ]),
    ];
    return {
      ...d,
      obstacles: raisons,
      en_attente: A_STATUER.includes(d.statut),
      validable: A_STATUER.includes(d.statut) && raisons.length === 0,
    };
  });

  return {
    lot,
    dossiers,
    controles,
    obstacles_collectifs: obstacles.collectifs,
    progression: {
      total: dossiers.length,
      en_attente: dossiers.filter((d) => d.en_attente).length,
      validables: dossiers.filter((d) => d.validable).length,
      valides: dossiers.filter((d) => d.statut === 'valide').length,
      rejetes: dossiers.filter((d) => d.statut === 'rejete').length,
      certifies: dossiers.filter((d) => d.statut === 'certifie').length,
      urgents_en_attente: dossiers.filter((d) => d.en_attente && d.priorite === 'urgente').length,
    },
  };
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

  await notifications.notifierEtablissement(
    notifications.EVENEMENTS.LOT_EXAMINE,
    lot.etablissement_id,
    { reference: lot.reference, effectif: lot.effectif, entite: 'lots_transmission', entite_id: id }
  );

  return { lot: await lotModel.trouverParId(id), controles };
}

// ── Instruction par tranches ───────────────────────────────────────
//
// L'instruction se faisait en un seul geste : ouvrir le lot, tout
// examiner, tout valider. Sur 250 dossiers — et l'Université de Lomé en
// annonce 12 000 — cela suppose une séance ininterrompue, et le travail
// déjà fait est perdu si l'agent doit s'arrêter.
//
// Le lot reste l'unité de transmission ; il cesse d'être l'unité de
// SÉANCE. L'agent statue sur les dossiers qu'il a examinés, revient
// plus tard pour les autres, et le lot ne se solde que lorsqu'il ne
// reste plus rien à décider.

/** Statuts d'un dossier qui attend encore une décision du ministère. */
const A_STATUER = ['soumis', 'en_examen'];

/**
 * Écrit les décisions et recalcule l'état du lot.
 *
 * Le statut du lot n'est pas décidé par l'appelant mais DÉDUIT de ce
 * qu'il reste : tant qu'un dossier attend, le lot est « en examen » ;
 * quand plus rien n'attend, il se solde — « validé » si aucun rejet,
 * « partiellement traité » sinon.
 */
async function appliquerDecisions(lot, agent_ministere_id, { aValider, aRejeter, controles }) {
  const parId = new Map(aValider.map((d) => [d.id, d]));
  let solde = null;

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
          lot_id: lot.id,
        },
        client
      );
    }

    for (const [dossier_id, { motif, statut_avant }] of aRejeter) {
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
          statut_avant: statut_avant || parId.get(dossier_id)?.statut || null,
          statut_apres: 'rejete',
          motif,
          lot_id: lot.id,
        },
        client
      );
    }

    // Compté APRÈS écriture et DANS la transaction : c'est le seul
    // instant où l'on connaît le reste à faire sans course avec un
    // second agent qui instruirait le même lot.
    const { rows } = await client.query(
      `SELECT COUNT(*) FILTER (WHERE statut = ANY($2))::int AS restants,
              COUNT(*) FILTER (WHERE statut = 'rejete')::int  AS rejetes,
              COUNT(*) FILTER (WHERE statut = 'valide')::int  AS valides
         FROM dossiers WHERE lot_id = $1`,
      [lot.id, A_STATUER]
    );
    const compte = rows[0];
    solde = compte;

    const statutLot =
      compte.restants > 0
        ? 'en_examen'
        : compte.rejetes > 0
          ? 'partiellement_traite'
          : 'valide';

    await lotModel.changerStatut(
      lot.id,
      { statut: statutLot, agent_ministere_id, rapport_controles: controles },
      client
    );
    solde.statut_lot = statutLot;

    await journaliser(
      {
        action: ACTIONS.LOT_VALIDE,
        entite: 'lots_transmission',
        entite_id: lot.id,
        etablissement_id: lot.etablissement_id,
        apres: {
          statut: statutLot,
          valides_cette_fois: aValider.length,
          rejetes_cette_fois: aRejeter.size,
          restants: compte.restants,
        },
        message:
          compte.restants > 0
            ? `${aValider.length} validé(s), ${aRejeter.size} rejeté(s) — ${compte.restants} dossier(s) restent à instruire.`
            : `${aValider.length} validé(s), ${aRejeter.size} rejeté(s) : instruction du lot achevée.`,
      },
      client
    );
  });

  // L'établissement est prévenu quand le lot est SOLDÉ, pas à chaque
  // tranche : dix notifications pour une même promotion n'informent
  // personne, elles apprennent à ignorer les notifications.
  if (solde.restants === 0) {
    await notifications.notifierEtablissement(
      notifications.EVENEMENTS.LOT_VALIDE,
      lot.etablissement_id,
      {
        reference: lot.reference,
        valides: solde.valides,
        rejetes: solde.rejetes,
        entite: 'lots_transmission',
        entite_id: lot.id,
      }
    );
  }

  return {
    lot: await lotModel.trouverParId(lot.id),
    valides: aValider.length,
    rejetes: aRejeter.size,
    restants: solde.restants,
    lot_solde: solde.restants === 0,
    total_valides: solde.valides,
    total_rejetes: solde.rejetes,
    details_rejets: [...aRejeter].map(([dossier_id, { motif }]) => ({ dossier_id, motif })),
  };
}

/** Lit et contrôle les rejets demandés par l'agent. */
function lireRejets(donnees, dossiers) {
  const rejets = new Map();
  for (const rejet of donnees.dossiers_rejetes || []) {
    const dossier_id = nettoyerTexte(rejet?.dossier_id);
    const motif = nettoyerTexte(rejet?.motif);
    if (!dossier_id) continue;
    if (!motif) {
      throw new ErreurApp(400, 'MOTIF_REQUIS', 'Chaque rejet doit porter un motif.');
    }
    const dossier = dossiers.find((d) => d.id === dossier_id);
    if (!dossier) {
      throw new ErreurApp(400, 'DOSSIER_HORS_LOT', "Un dossier rejeté n'appartient pas à ce lot.");
    }
    rejets.set(dossier_id, { motif, statut_avant: dossier.statut });
  }
  return rejets;
}

/**
 * Statue sur une TRANCHE de dossiers : ceux que l'agent a examinés.
 *
 * Contrairement à `valider`, rien n'est décidé implicitement — un
 * dossier non désigné reste en attente. C'est ce qui rend l'instruction
 * reprenable : ce qui n'a pas été jugé n'est pas jugé.
 */
export async function traiterDossiers(id, agent_ministere_id, donnees = {}) {
  const lot = await recuperer(id);
  if (!INSTRUISABLES.includes(lot.statut)) {
    throw new ErreurApp(409, 'LOT_NON_INSTRUISABLE', `Un lot « ${lot.statut} » est déjà traité.`);
  }

  const dossiers = await lotModel.listerDossiers(id);
  const enAttente = dossiers.filter((d) => A_STATUER.includes(d.statut));
  if (enAttente.length === 0) {
    throw new ErreurApp(
      409,
      'LOT_DEJA_STATUE',
      'Tous les dossiers de ce lot ont déjà reçu une décision.'
    );
  }

  const controles = await controlerLot(lot);
  const obstacles = await pieces.obstaclesParDossier(lot, dossiers);

  // Les actes collectifs ne se découpent pas : le procès-verbal fonde
  // la délibération entière. Tant qu'il manque ou n'a pas été ouvert,
  // aucun dossier de la promotion ne repose sur rien.
  if (obstacles.collectifs.length > 0) {
    throw new ErreurApp(
      409,
      'PIECES_COLLECTIVES_MANQUANTES',
      `Instruction impossible tant que les actes collectifs ne sont pas réglés : ${obstacles.collectifs.join(' ; ')}.`
    );
  }

  const aValiderIds = [
    ...new Set((donnees.dossiers_valides || []).map((v) => nettoyerTexte(v)).filter(Boolean)),
  ];
  const rejets = lireRejets(donnees, dossiers);

  if (aValiderIds.length === 0 && rejets.size === 0) {
    throw new ErreurApp(
      400,
      'AUCUN_DOSSIER_DESIGNE',
      'Désignez au moins un dossier à valider ou à rejeter.'
    );
  }

  const enAttenteIds = new Set(enAttente.map((d) => d.id));
  for (const dossier_id of [...aValiderIds, ...rejets.keys()]) {
    if (!dossiers.some((d) => d.id === dossier_id)) {
      throw new ErreurApp(400, 'DOSSIER_HORS_LOT', "Un dossier désigné n'appartient pas à ce lot.");
    }
    if (!enAttenteIds.has(dossier_id)) {
      throw new ErreurApp(
        409,
        'DOSSIER_DEJA_STATUE',
        'Un dossier désigné a déjà reçu une décision. Rechargez le lot avant de continuer.'
      );
    }
  }

  const contradictoire = aValiderIds.find((d) => rejets.has(d));
  if (contradictoire) {
    throw new ErreurApp(
      400,
      'DECISION_CONTRADICTOIRE',
      'Un même dossier ne peut pas être à la fois validé et rejeté.'
    );
  }

  // Un dossier ne se valide pas « quand même » : ce qui l'empêche doit
  // être levé — ouvrir les pièces, en obtenir une nouvelle — ou le
  // dossier doit être rejeté explicitement, avec son motif.
  const bloquantsAuto = new Map(controles.bloquants.map((b) => [b.dossier_id, b.erreurs]));
  const empeches = aValiderIds
    .map((dossier_id) => ({
      dossier_id,
      reference: dossiers.find((d) => d.id === dossier_id)?.reference,
      raisons: [
        ...new Set([
          ...(obstacles.parDossier.get(dossier_id) || []),
          ...(bloquantsAuto.get(dossier_id) || []),
        ]),
      ],
    }))
    .filter((e) => e.raisons.length > 0);

  if (empeches.length > 0) {
    const exemples = empeches
      .slice(0, 3)
      .map((e) => `${e.reference} (${e.raisons.join(', ')})`)
      .join(' ; ');
    throw new ErreurApp(
      409,
      'DOSSIERS_NON_VALIDABLES',
      `${empeches.length} dossier(s) ne peuvent pas être validés en l'état : ${exemples}${empeches.length > 3 ? '…' : ''}. Levez l'obstacle ou rejetez-les explicitement.`,
      { empeches }
    );
  }

  const aValider = dossiers.filter((d) => aValiderIds.includes(d.id));
  return appliquerDecisions(lot, agent_ministere_id, { aValider, aRejeter: rejets, controles });
}

/**
 * Validation du lot entier — le geste de clôture.
 *
 * Statue d'un coup sur tout ce qui reste : les dossiers signalés
 * bloquants par les contrôles automatiques sont rejetés, ceux que
 * l'agent désigne aussi, les autres sont validés. Reste utile après une
 * instruction par tranches, pour solder ce qui n'appelle pas de doute.
 */
export async function valider(id, agent_ministere_id, donnees = {}) {
  const lot = await recuperer(id);
  if (!INSTRUISABLES.includes(lot.statut)) {
    throw new ErreurApp(409, 'LOT_NON_INSTRUISABLE', `Un lot « ${lot.statut} » est déjà traité.`);
  }

  const controles = await controlerLot(lot);
  const dossiers = await lotModel.listerDossiers(id);
  const enAttente = dossiers.filter((d) => A_STATUER.includes(d.statut));

  if (enAttente.length === 0) {
    throw new ErreurApp(
      409,
      'LOT_DEJA_STATUE',
      'Tous les dossiers de ce lot ont déjà reçu une décision.'
    );
  }

  // « Ouvert, vu, validé » : le ministère ne valide pas en bloc un lot
  // dont il n'a pas ouvert les pièces. Le contrôle est ici, pas
  // seulement à l'écran — un appel direct à l'API doit buter dessus.
  // Pour statuer sans tout avoir ouvert, il existe l'instruction par
  // tranches, qui exige la même chose mais dossier par dossier.
  const etatPieces = controles.synthese.pieces || {};
  if (etatPieces.collectives_manquantes?.length > 0) {
    throw new ErreurApp(
      409,
      'PIECES_COLLECTIVES_MANQUANTES',
      `Ce lot ne peut pas être validé : ${etatPieces.collectives_manquantes.join(', ')} — acte(s) de délibération absent(s). Demandez-les à l'établissement.`
    );
  }
  if (etatPieces.non_examinees > 0) {
    throw new ErreurApp(
      409,
      'PIECES_NON_EXAMINEES',
      `${etatPieces.non_examinees} pièce(s) n'ont pas encore été ouvertes. Consultez-les puis validez ou rejetez chacune — ou traitez le lot par tranches, en ne statuant que sur les dossiers examinés.`
    );
  }

  const enAttenteIds = new Set(enAttente.map((d) => d.id));

  const rejetsManuels = lireRejets(donnees, dossiers);
  // Un dossier déjà statué lors d'une tranche précédente ne se rejuge
  // pas au passage : revenir sur une décision est une correction, elle
  // a sa propre procédure.
  for (const dossier_id of rejetsManuels.keys()) {
    if (!enAttenteIds.has(dossier_id)) {
      throw new ErreurApp(
        409,
        'DOSSIER_DEJA_STATUE',
        'Un dossier rejeté a déjà reçu une décision. Rechargez le lot avant de continuer.'
      );
    }
  }

  // Rejets automatiques : les contrôles bloquants font foi.
  const rejetsAutomatiques = new Map(
    controles.bloquants
      .filter((b) => enAttenteIds.has(b.dossier_id))
      .map((b) => [
        b.dossier_id,
        {
          motif: `Contrôle automatique : ${b.erreurs.join(' ; ')}`,
          statut_avant: dossiers.find((d) => d.id === b.dossier_id)?.statut || null,
        },
      ])
  );

  const aRejeter = new Map([...rejetsAutomatiques, ...rejetsManuels]);
  const aValider = enAttente.filter((d) => !aRejeter.has(d.id));

  if (aValider.length === 0) {
    throw new ErreurApp(
      409,
      'AUCUN_DOSSIER_VALIDABLE',
      'Tous les dossiers restants sont en erreur. Rejetez le lot ou demandez une correction.'
    );
  }

  return appliquerDecisions(lot, agent_ministere_id, { aValider, aRejeter, controles });
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

  await notifications.notifierEtablissement(
    notifications.EVENEMENTS.LOT_REJETE,
    lot.etablissement_id,
    { reference: lot.reference, motif: motif_rejet, entite: 'lots_transmission', entite_id: id }
  );

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
