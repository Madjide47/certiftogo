// ─────────────────────────────────────────────────────────────
// Service "ancrage" — certification de masse et worker de file.
//
// Une certification unitaire reste synchrone : attendre quatre secondes
// pour un diplôme est acceptable, et le résultat immédiat est plus clair
// pour l'agent. Un lot de 250 — ou 12 000 — passe par la file.
//
// Le diplôme existe en base dès la décision du ministère, au statut
// « en_attente_ancrage » : juridiquement il est délivré, seule sa preuve
// publique reste à publier.
// ─────────────────────────────────────────────────────────────
import { withTransaction } from '../config/database.js';
import * as ancrageModel from '../models/ancrage.model.js';
import * as diplomeModel from '../models/diplome.model.js';
import * as dossierModel from '../models/dossier.model.js';
import * as txModel from '../models/transaction-blockchain.model.js';
import * as lotModel from '../models/lot.model.js';
import * as blockchain from './blockchain.service.js';
import { journaliser, journaliserStatutDossier, ACTIONS } from './audit.service.js';
import * as notifications from './notification.service.js';
import * as quatreYeux from './validation-critique.service.js';
import { construireDiplomeDepuisDossier } from './diplome.service.js';
import { ErreurApp } from '../utils/errors.js';
import { estUuidValide, versEntier } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

const TAILLE_LOT_WORKER = Number(process.env.ANCRAGE_TAILLE_LOT || 10);

// ── Certification de masse ─────────────────────────────────────────

/**
 * Certifie tous les dossiers validés d'un lot.
 * Les diplômes sont créés immédiatement, l'ancrage est mis en file.
 */
export async function certifierLot(lot_id, ministere_id, options = {}) {
  if (!ministere_id) {
    throw new ErreurApp(403, 'MINISTERE_REQUIS', 'Compte ministère requis pour certifier.');
  }

  const lot = await lotModel.trouverParId(lot_id);
  if (!lot) throw new ErreurApp(404, 'LOT_INTROUVABLE', 'Lot introuvable.');
  if (!['valide', 'partiellement_traite'].includes(lot.statut)) {
    throw new ErreurApp(
      409,
      'LOT_NON_CERTIFIABLE',
      `Un lot « ${lot.statut} » ne peut pas être certifié. Validez-le d'abord.`
    );
  }

  // Certifier des milliers de diplomes d'un geste merite un second regard.
  if (quatreYeux.estActive() && !options.approuve) {
    const demande = await quatreYeux.demander({
      action: quatreYeux.ACTIONS_CRITIQUES.LOT_CERTIFIER,
      entite: 'lots_transmission',
      entite_id: lot_id,
      charge_utile: { lot_id, ministere_id },
      motif: `Certification du lot ${lot.reference} (${lot.effectif} dossiers).`,
    });
    return { en_attente_validation: true, validation: demande };
  }

  const dossiers = await lotModel.listerDossiers(lot_id);
  const aCertifier = dossiers.filter((d) => d.statut === 'valide');

  if (aCertifier.length === 0) {
    throw new ErreurApp(
      409,
      'AUCUN_DOSSIER_VALIDE',
      'Aucun dossier validé à certifier dans ce lot.'
    );
  }

  let crees = 0;
  const echecs = [];

  for (const resume of aCertifier) {
    try {
      const dossier = await dossierModel.trouverParIdMinistere(resume.id);
      const prepare = await construireDiplomeDepuisDossier(dossier);

      await withTransaction(async (client) => {
        const diplome = await diplomeModel.creer(
          {
            ...prepare.donnees,
            ministere_id,
            // Le diplôme est officiel ; sa preuve publique suit.
            statut: 'en_attente_ancrage',
          },
          client
        );

        await dossierModel.definirStatut(dossier.id, 'certifie', client);
        await journaliserStatutDossier(
          {
            dossier_id: dossier.id,
            statut_avant: dossier.statut,
            statut_apres: 'certifie',
            motif: `Certification de masse — lot ${lot.reference}.`,
            lot_id,
          },
          client
        );

        await ancrageModel.enfiler(
          {
            diplome_id: diplome.id,
            lot_id,
            operation: 'certification',
            charge_utile: {
              reference: prepare.donnees.reference,
              hash: prepare.donnees.hash_sha256,
              signature: prepare.donnees.signature_numerique,
            },
            // Une même certification ne peut pas être enfilée deux fois.
            cle_idempotence: `certification:${diplome.id}`,
          },
          client
        );

        await client.query(
          `UPDATE utilisateurs u SET actif = TRUE
             FROM candidats c
            WHERE c.id = $1 AND u.personne_id = c.personne_id
              AND u.role = 'candidat' AND u.actif = FALSE`,
          [dossier.candidat_id]
        );
      });

      crees += 1;
    } catch (err) {
      // Un dossier fautif ne doit pas interrompre les 249 autres.
      echecs.push({ dossier_id: resume.id, reference: resume.reference, erreur: err.message });
    }
  }

  await lotModel.changerStatut(lot_id, { statut: 'certifie', agent_ministere_id: null });

  await journaliser({
    action: ACTIONS.LOT_CERTIFIE,
    entite: 'lots_transmission',
    entite_id: lot_id,
    etablissement_id: lot.etablissement_id,
    apres: { diplomes_crees: crees, echecs: echecs.length },
    message: `${crees} diplôme(s) créés, mis en file d'ancrage.`,
  });

  return { lot_id, diplomes_crees: crees, echecs, en_file: crees };
}

/** Progression de l'ancrage d'un lot : « 8 245 / 12 000 ». */
export async function progression(lot_id) {
  if (!estUuidValide(lot_id)) throw new ErreurApp(404, 'LOT_INTROUVABLE', 'Lot introuvable.');

  const lignes = await ancrageModel.progressionLot(lot_id);
  const parStatut = Object.fromEntries(lignes.map((l) => [l.statut, l.total]));
  const total = lignes.reduce((somme, l) => somme + l.total, 0);
  const ancres = parStatut.confirmee || 0;

  return {
    total,
    ancres,
    en_attente: (parStatut.en_attente || 0) + (parStatut.en_cours || 0),
    en_echec: parStatut.echouee || 0,
    abandonnes: parStatut.abandonnee || 0,
    pourcentage: total === 0 ? 0 : Math.round((ancres / total) * 100),
    libelle: `${ancres} / ${total} ancrés`,
  };
}

// ── Worker ─────────────────────────────────────────────────────────

/**
 * Traite une tranche de la file. Renvoie le compte de tâches traitées,
 * pour qu'un appelant puisse boucler tant qu'il reste du travail.
 */
export async function traiterTranche(taille = TAILLE_LOT_WORKER) {
  const taches = await ancrageModel.reserver(taille);
  let confirmees = 0;
  let echouees = 0;

  for (const tache of taches) {
    try {
      const { reference, hash, motif } = tache.charge_utile;

      const tx =
        tache.operation === 'certification'
          ? await blockchain.certifier({ reference, hash })
          : await blockchain.revoquer({ reference, hash, motif });

      if (tx.statut !== 'confirmee') {
        throw new Error(`Transaction non confirmée (statut ${tx.statut}).`);
      }

      await withTransaction(async (client) => {
        await txModel.creer(
          {
            diplome_id: tache.diplome_id,
            transaction_hash: tx.transactionHash,
            block_number: tx.blockNumber,
            adresse_contrat: tx.adresseContrat,
            gas_used: tx.gasUsed,
            gas_price: tx.gasPrice,
            statut: tx.statut,
          },
          client
        );

        if (tache.operation === 'certification') {
          await client.query(
            `UPDATE diplomes SET statut = 'actif', transaction_id = $2 WHERE id = $1`,
            [tache.diplome_id, tx.transactionHash]
          );
        }

        await ancrageModel.marquerConfirmee(tache.id, tx.transactionHash, client);
      });

      confirmees += 1;
    } catch (err) {
      const etat = await ancrageModel.marquerEchouee(tache.id, err.message);
      echouees += 1;

      if (etat?.statut === 'abandonnee') {
        // Abandon définitif : l'administrateur doit être averti, le
        // diplôme reste sans preuve publique.
        logger.error(
          `[ancrage] Tâche ${tache.id} abandonnée après ${etat.tentatives} tentatives : ${err.message}`
        );
        await notifications.notifierRole(
          notifications.EVENEMENTS.ANCRAGE_ECHOUE,
          'admin_systeme',
          {
            reference: tache.charge_utile?.reference,
            tentatives: etat.tentatives,
            erreur: err.message,
            entite: 'file_attente_ancrage',
            entite_id: tache.id,
          }
        );

        await journaliser({
          action: ACTIONS.ANCRAGE_ABANDONNE,
          entite: 'file_attente_ancrage',
          entite_id: tache.id,
          resultat: 'echec',
          message: `Ancrage abandonné après ${etat.tentatives} tentatives : ${err.message}`,
        });
      }
    }
  }

  return { traitees: taches.length, confirmees, echouees };
}

/** Vide la file, par tranches. Utilisé par le worker et par les tests. */
export async function viderFile({ maxTranches = 100 } = {}) {
  let total = { traitees: 0, confirmees: 0, echouees: 0 };
  for (let i = 0; i < maxTranches; i += 1) {
    const tranche = await traiterTranche();
    total = {
      traitees: total.traitees + tranche.traitees,
      confirmees: total.confirmees + tranche.confirmees,
      echouees: total.echouees + tranche.echouees,
    };
    if (tranche.traitees === 0) break;
  }
  return total;
}

// ── Supervision ────────────────────────────────────────────────────

export async function etat() {
  const [file, couts] = await Promise.all([
    ancrageModel.etatFile(),
    ancrageModel.coutParEtablissement(),
  ]);
  return { file, couts };
}

export function listerAbandonnees() {
  return ancrageModel.listerAbandonnees();
}

export async function relancer(id) {
  if (!estUuidValide(id)) throw new ErreurApp(404, 'TACHE_INTROUVABLE', 'Tâche introuvable.');
  const tache = await ancrageModel.relancer(id);
  if (!tache) {
    throw new ErreurApp(
      404,
      'TACHE_INTROUVABLE',
      'Tâche introuvable ou non abandonnée.'
    );
  }
  await journaliser({
    action: ACTIONS.ANCRAGE_RELANCE,
    entite: 'file_attente_ancrage',
    entite_id: id,
    message: 'Tâche remise en file après abandon.',
  });
  return tache;
}

/** Déclenche le traitement à la demande (le worker autonome fait de même). */
export async function traiterMaintenant(taille) {
  const n = versEntier(taille) || TAILLE_LOT_WORKER;
  return traiterTranche(Math.min(Math.max(n, 1), 100));
}

// ── Surveillance du portefeuille de service (CDC §34.2) ────────────

/** Coût moyen d'une opération, en POL. Mesuré sur Amoy. */
const COUT_MOYEN_POL = Number(process.env.COUT_MOYEN_POL || 0.0075);
/** Seuil d'alerte, exprimé en jours de consommation restante. */
const SEUIL_JOURS = Number(process.env.SOLDE_SEUIL_JOURS || 30);

/**
 * Évalue l'autonomie du portefeuille de service.
 *
 * Le seuil est exprimé en JOURS plutôt qu'en montant : c'est ce qui laisse
 * le temps d'agir. Un solde de 2 POL ne dit rien ; « 4 jours restants »
 * dit tout.
 */
export async function surveillerSolde() {
  let portefeuille;
  try {
    portefeuille = await blockchain.soldeService();
  } catch (err) {
    return { disponible: false, erreur: err.message };
  }

  // Consommation observée sur les 30 derniers jours.
  const { rows } = await (await import('../config/database.js')).query(
    `SELECT COUNT(*)::int AS operations
       FROM transactions_blockchain
      WHERE date_transaction >= now() - INTERVAL '30 days'`
  );

  const parJour = rows[0].operations / 30;
  const coutJournalier = parJour * COUT_MOYEN_POL;
  const jours = coutJournalier > 0 ? Math.floor(portefeuille.solde / coutJournalier) : null;

  const niveau =
    jours === null ? 'inconnu' : jours <= 7 ? 'critique' : jours <= SEUIL_JOURS ? 'bas' : 'normal';

  const etat = {
    ...portefeuille,
    operations_30j: rows[0].operations,
    cout_journalier_pol: Number(coutJournalier.toFixed(6)),
    jours_restants: jours,
    seuil_jours: SEUIL_JOURS,
    niveau,
  };

  if (niveau === 'bas' || niveau === 'critique') {
    await journaliser({
      action: ACTIONS.SOLDE_BAS,
      entite: 'blockchain',
      resultat: 'echec',
      message: `Portefeuille de service : ${jours} jour(s) d'autonomie (seuil ${SEUIL_JOURS}).`,
    });
    await notifications.notifierRole(notifications.EVENEMENTS.SOLDE_BAS, 'admin_systeme', {
      jours,
      solde: portefeuille.solde,
      niveau,
    });
  }

  return etat;
}
