// ─────────────────────────────────────────────────────────────
// Service "priorité de traitement".
//
// La file du ministère était strictement chronologique. Or un diplômé
// qui doit produire son acte pour une bourse, une inscription à
// l'étranger ou un concours a une échéance ; son voisin de promotion
// n'en a pas. Faute de pouvoir le dire, l'urgence se réglait par
// téléphone — et ne laissait aucune trace de qui avait fait passer qui
// devant.
//
// Trois règles :
//
//   1. Une urgence porte toujours un MOTIF écrit. Sans lui, la
//      priorité n'est pas un arbitrage mais un passe-droit, et rien
//      ne permet de la contester après coup.
//   2. Elle se déclare des deux côtés, parce qu'elle se découvre des
//      deux côtés : l'établissement connaît la situation de son
//      étudiant avant de transmettre, le ministère reçoit les demandes
//      qui arrivent après.
//   3. Elle est journalisée comme une décision, pas comme une
//      modification de fiche.
// ─────────────────────────────────────────────────────────────
import * as dossierModel from '../models/dossier.model.js';
import * as inscriptionModel from '../models/inscription.model.js';
import * as promotionModel from '../models/promotion.model.js';
import { journaliser, ACTIONS } from './audit.service.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import {
  nettoyerTexte,
  estUuidValide,
  canoniserDate,
  FORMATS_DATE_ACCEPTES,
} from '../utils/validators.js';

const PRIORITES = ['normale', 'urgente'];

/** Un motif trop court ne motive rien : « urgent » n'est pas une raison. */
const LONGUEUR_MOTIF_MINIMALE = 10;

/**
 * Valide les données d'une déclaration de priorité, quelle que soit la
 * cible. Retourne le triplet à écrire.
 */
function lireDeclaration(donnees = {}) {
  const priorite = nettoyerTexte(donnees.priorite) || 'normale';
  if (!PRIORITES.includes(priorite)) {
    throw new ErreurApp(
      400,
      'PRIORITE_INCONNUE',
      `Priorité attendue : ${PRIORITES.join(' ou ')}.`
    );
  }

  // Revenir à « normale » efface le motif et l'échéance : garder la
  // raison d'une urgence levée laisserait croire qu'elle tient encore.
  if (priorite === 'normale') {
    return { priorite, motif_urgence: null, date_echeance: null };
  }

  const motif_urgence = nettoyerTexte(donnees.motif_urgence || donnees.motif);
  if (!motif_urgence || motif_urgence.length < LONGUEUR_MOTIF_MINIMALE) {
    throw new ErreurApp(
      400,
      'MOTIF_URGENCE_REQUIS',
      "Expliquez l'urgence en une phrase : c'est elle qui justifie de faire passer ce dossier devant les autres."
    );
  }

  let date_echeance = null;
  if (donnees.date_echeance) {
    date_echeance = canoniserDate(donnees.date_echeance);
    if (!date_echeance) {
      throw new ErreurApp(
        400,
        'DATE_INVALIDE',
        `Échéance illisible. Formats acceptés : ${FORMATS_DATE_ACCEPTES}.`
      );
    }
  }

  return { priorite, motif_urgence, date_echeance };
}

/** Journalise une déclaration comme la décision qu'elle est. */
async function tracer(utilisateur, { entite, entite_id, avant, apres, sujet, etablissement_id }) {
  await journaliser({
    action: apres.priorite === 'urgente' ? ACTIONS.DOSSIER_PRIORISE : ACTIONS.DOSSIER_DEPRIORISE,
    entite,
    entite_id,
    utilisateur_id: utilisateur.utilisateur_id,
    role: utilisateur.role,
    etablissement_id: etablissement_id || utilisateur.etablissement_id || null,
    avant,
    apres,
    message:
      apres.priorite === 'urgente'
        ? `${sujet} déclaré urgent : ${apres.motif_urgence}`
        : `${sujet} ramené à une priorité normale.`,
  });
}

// ── Établissement, avant transmission ──────────────────────────────

/**
 * Déclare l'urgence sur l'INSCRIPTION, seule chose qui existe tant que
 * la promotion n'est pas partie. La transmission recopiera l'urgence sur
 * le dossier engendré.
 */
export async function definirPourInscription(inscription_id, utilisateur, donnees = {}) {
  if (!estUuidValide(inscription_id)) {
    throw new ErreurApp(404, 'INSCRIPTION_INTROUVABLE', 'Inscription introuvable.');
  }

  const inscription = await inscriptionModel.trouverParId(inscription_id);
  if (!inscription) {
    throw new ErreurApp(404, 'INSCRIPTION_INTROUVABLE', 'Inscription introuvable.');
  }

  const promotion = await promotionModel.trouverParId(inscription.promotion_id);
  if (!promotion || promotion.etablissement_id !== utilisateur.etablissement_id) {
    throw new ErreurApp(404, 'INSCRIPTION_INTROUVABLE', 'Inscription introuvable.');
  }

  // Après transmission, l'inscription ne commande plus rien : le dossier
  // est parti avec la priorité qu'il avait. Corriger ici donnerait
  // l'illusion d'agir sur un lot déjà chez le ministère.
  if (!['brouillon', 'ouverte', 'controle_interne', 'validee_interne'].includes(promotion.statut)) {
    throw new ErreurApp(
      409,
      'PROMOTION_FIGEE',
      `La promotion est « ${promotion.statut} » : l'urgence se déclare désormais sur le dossier, auprès du ministère.`
    );
  }

  const declaration = lireDeclaration(donnees);
  const misAJour = await avecErreursSql(() =>
    inscriptionModel.definirPriorite(inscription_id, declaration)
  );

  await tracer(utilisateur, {
    entite: 'inscriptions',
    entite_id: inscription_id,
    avant: { priorite: inscription.priorite },
    apres: declaration,
    sujet: 'Étudiant',
    etablissement_id: promotion.etablissement_id,
  });

  return misAJour;
}

// ── Dossier transmis ───────────────────────────────────────────────

/**
 * Déclare l'urgence sur un dossier déjà transmis.
 *
 * Le ministère y accède parce qu'il instruit ; l'établissement parce
 * que la situation de son étudiant peut changer après l'envoi — et
 * l'obliger à décrocher son téléphone pour cela nous ramènerait à
 * l'arbitrage sans trace que ce service remplace.
 */
export async function definirPourDossier(dossier_id, utilisateur, donnees = {}) {
  if (!estUuidValide(dossier_id)) {
    throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');
  }

  const dossier = await dossierModel.trouverParId(dossier_id);
  if (!dossier) throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');

  if (
    utilisateur.role === 'etablissement' &&
    dossier.etablissement_id !== utilisateur.etablissement_id
  ) {
    // 404 plutôt que 403 : confirmer l'existence du dossier d'un autre
    // établissement est déjà une fuite.
    throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');
  }

  // Une priorité ne sert qu'à ordonner ce qui attend. Sur un dossier
  // déjà certifié ou rejeté, elle ne changerait rien et ferait croire
  // le contraire.
  if (!['soumis', 'en_examen'].includes(dossier.statut)) {
    throw new ErreurApp(
      409,
      'DOSSIER_DEJA_STATUE',
      `Ce dossier est « ${dossier.statut} » : il n'attend plus d'être traité, la priorité n'a plus d'objet.`
    );
  }

  const declaration = lireDeclaration(donnees);
  const misAJour = await avecErreursSql(() =>
    dossierModel.definirPriorite(dossier_id, {
      ...declaration,
      priorite_definie_par_id: utilisateur.utilisateur_id,
    })
  );

  await tracer(utilisateur, {
    entite: 'dossiers',
    entite_id: dossier_id,
    avant: { priorite: dossier.priorite, motif_urgence: dossier.motif_urgence },
    apres: declaration,
    sujet: `Dossier ${dossier.reference}`,
    etablissement_id: dossier.etablissement_id,
  });

  return misAJour;
}

/**
 * Les dossiers urgents encore en attente, tous lots confondus.
 *
 * Un agent qui n'ouvre que les lots un par un ne verra jamais qu'une
 * urgence dort dans un lot arrivé il y a trois semaines. Cette vue
 * traverse les lots — c'est sa raison d'être.
 */
export async function listerUrgents({ limit = 100 } = {}) {
  return dossierModel.listerPourMinistere({ priorite: 'urgente', statut: 'soumis', limit });
}
