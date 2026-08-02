// ─────────────────────────────────────────────────────────────
// Service "promotion" — cohortes et inscriptions des étudiants.
//
// Isolation : la promotion appartient à l'établissement propriétaire de
// sa filière. Un établissement ne peut inscrire que ses propres étudiants.
// ─────────────────────────────────────────────────────────────
import * as promotionModel from '../models/promotion.model.js';
import * as inscriptionModel from '../models/inscription.model.js';
import * as candidatModel from '../models/candidat.model.js';
import * as anneeModel from '../models/annee-academique.model.js';
import * as sessionModel from '../models/session-academique.model.js';
import { recupererFiliere } from './structure.service.js';
import * as importService from './import.service.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import {
  nettoyerTexte,
  estUuidValide,
  estDansEnum,
  versEntier,
  MENTIONS,
  STATUTS_PROMOTION,
  STATUTS_INSCRIPTION,
  TRANSITIONS_PROMOTION,
  STATUTS_PROMOTION_MODIFIABLE,
} from '../utils/validators.js';

const CONTRAINTES_PROMOTION = {
  promotions_filiere_id_annee_id_niveau_key: [
    409,
    'PROMOTION_DUPLIQUEE',
    'Une promotion existe déjà pour cette filière, ce niveau et cette année académique.',
  ],
  fk_promotions_session_annee: [
    400,
    'SESSION_HORS_ANNEE',
    'La session choisie n\'appartient pas à l\'année académique de la promotion.',
  ],
};

const CONTRAINTES_INSCRIPTION = {
  inscriptions_candidat_id_promotion_id_key: [
    409,
    'INSCRIPTION_DUPLIQUEE',
    'Cet étudiant est déjà inscrit dans cette promotion.',
  ],
  chk_inscription_mention: [
    400,
    'MENTION_NON_AUTORISEE',
    'Une mention ne peut être attribuée qu\'à un étudiant admis.',
  ],
};

// ── Promotions ─────────────────────────────────────────────────────

export async function lister(etablissement_id, { annee_id, filiere_id, statut } = {}) {
  for (const [valeur, libelle] of [
    [annee_id, 'année académique'],
    [filiere_id, 'filière'],
  ]) {
    if (valeur && !estUuidValide(valeur)) {
      throw new ErreurApp(400, 'FORMAT_INVALIDE', `Identifiant de ${libelle} invalide.`);
    }
  }
  if (!estDansEnum(statut, STATUTS_PROMOTION)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de promotion inconnu.');
  }

  return promotionModel.lister({
    etablissement_id,
    annee_id: nettoyerTexte(annee_id),
    filiere_id: nettoyerTexte(filiere_id),
    statut: nettoyerTexte(statut),
  });
}

export async function recuperer(id, etablissement_id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  }
  const promotion = await promotionModel.trouverParId(id);
  if (!promotion || promotion.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  }
  return promotion;
}

/**
 * Contrôle la cohérence année ↔ session ↔ filière.
 * La clé étrangère composite garantit déjà le lien session/année, mais un
 * contrôle explicite produit un message exploitable plutôt qu'une violation.
 */
async function resoudreRattachement({ annee_id, session_id, filiere, niveau }) {
  const annee = await anneeModel.trouverParId(annee_id);
  if (!annee) throw new ErreurApp(404, 'ANNEE_INTROUVABLE', 'Année académique introuvable.');
  if (annee.statut === 'cloturee') {
    throw new ErreurApp(
      409,
      'ANNEE_CLOTUREE',
      'Impossible de rattacher une promotion à une année clôturée.'
    );
  }

  if (session_id) {
    const session = await sessionModel.trouverParId(session_id);
    if (!session) throw new ErreurApp(404, 'SESSION_INTROUVABLE', 'Session introuvable.');
    if (session.annee_id !== annee_id) {
      throw new ErreurApp(
        400,
        'SESSION_HORS_ANNEE',
        'La session choisie appartient à une autre année académique.'
      );
    }
  }

  // Une L4 dans une licence de 3 ans traduit une erreur de saisie.
  if (niveau > filiere.duree_annees) {
    throw new ErreurApp(
      400,
      'NIVEAU_HORS_CURSUS',
      `Le niveau ${niveau} dépasse la durée de la filière (${filiere.duree_annees} an(s)).`
    );
  }

  return annee;
}

function validerPromotion(donnees) {
  const libelle = nettoyerTexte(donnees.libelle);
  if (!libelle) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le libellé de la promotion est requis.');

  const niveau = versEntier(donnees.niveau);
  if (niveau === null || niveau < 1 || niveau > 8) {
    throw new ErreurApp(
      400,
      'NIVEAU_INVALIDE',
      'Le niveau doit être un entier compris entre 1 et 8.'
    );
  }

  let effectif_prevu = null;
  if (donnees.effectif_prevu !== undefined && donnees.effectif_prevu !== null && donnees.effectif_prevu !== '') {
    effectif_prevu = versEntier(donnees.effectif_prevu);
    if (effectif_prevu === null || effectif_prevu < 0) {
      throw new ErreurApp(
        400,
        'EFFECTIF_INVALIDE',
        'L\'effectif prévu doit être un entier positif.'
      );
    }
  }

  return { libelle, niveau, effectif_prevu };
}

export async function creer(etablissement_id, donnees) {
  const filiere_id = nettoyerTexte(donnees.filiere_id);
  const annee_id = nettoyerTexte(donnees.annee_id);
  const session_id = nettoyerTexte(donnees.session_id);

  if (!filiere_id) throw new ErreurApp(400, 'CHAMP_REQUIS', 'La filière est requise.');
  if (!annee_id) throw new ErreurApp(400, 'CHAMP_REQUIS', 'L\'année académique est requise.');
  if (!estUuidValide(annee_id)) {
    throw new ErreurApp(404, 'ANNEE_INTROUVABLE', 'Année académique introuvable.');
  }
  if (session_id && !estUuidValide(session_id)) {
    throw new ErreurApp(404, 'SESSION_INTROUVABLE', 'Session introuvable.');
  }

  // Garantit que la filière visée appartient à l'établissement appelant.
  const filiere = await recupererFiliere(filiere_id, etablissement_id);
  if (filiere.statut === 'archivee') {
    throw new ErreurApp(
      409,
      'FILIERE_ARCHIVEE',
      'Impossible de créer une promotion sur une filière archivée.'
    );
  }

  const data = validerPromotion(donnees);
  await resoudreRattachement({ annee_id, session_id, filiere, niveau: data.niveau });

  return avecErreursSql(
    () =>
      promotionModel.creer({
        ...data,
        filiere_id,
        annee_id,
        session_id: session_id || null,
        statut: 'brouillon',
      }),
    CONTRAINTES_PROMOTION
  );
}

export async function modifier(id, etablissement_id, donnees) {
  const promotion = await recuperer(id, etablissement_id);

  if (!STATUTS_PROMOTION_MODIFIABLE.includes(promotion.statut)) {
    throw new ErreurApp(
      409,
      'PROMOTION_FIGEE',
      `Une promotion « ${promotion.statut} » ne peut plus être modifiée.`
    );
  }

  const session_id = nettoyerTexte(donnees.session_id);
  if (session_id && !estUuidValide(session_id)) {
    throw new ErreurApp(404, 'SESSION_INTROUVABLE', 'Session introuvable.');
  }

  const data = validerPromotion(donnees);
  const filiere = await recupererFiliere(promotion.filiere_id, etablissement_id);
  await resoudreRattachement({
    annee_id: promotion.annee_id,
    session_id,
    filiere,
    niveau: data.niveau,
  });

  return avecErreursSql(
    () => promotionModel.modifier(id, { ...data, session_id: session_id || null }),
    CONTRAINTES_PROMOTION
  );
}

export async function changerStatut(id, etablissement_id, statut) {
  const promotion = await recuperer(id, etablissement_id);
  const cible = nettoyerTexte(statut);

  if (!cible || !STATUTS_PROMOTION.includes(cible)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de promotion inconnu.');
  }
  if (cible === promotion.statut) return promotion;

  // « transmise » n'est pas un simple changement d'état : la transmission
  // génère un lot et un dossier par étudiant admis. Y passer par ce point
  // d'entrée laisserait une promotion transmise sans rien côté ministère.
  if (cible === 'transmise') {
    throw new ErreurApp(
      409,
      'TRANSMISSION_DEDIEE',
      'Utilisez POST /api/promotions/:id/transmettre : la transmission crée un lot et les dossiers.'
    );
  }

  if (!TRANSITIONS_PROMOTION[promotion.statut].includes(cible)) {
    throw new ErreurApp(
      409,
      'TRANSITION_INTERDITE',
      `Une promotion « ${promotion.statut} » ne peut pas passer à « ${cible} ».`
    );
  }

  return avecErreursSql(() => promotionModel.changerStatut(id, cible), CONTRAINTES_PROMOTION);
}

export async function supprimer(id, etablissement_id) {
  const promotion = await recuperer(id, etablissement_id);

  if (promotion.statut !== 'brouillon') {
    throw new ErreurApp(
      409,
      'PROMOTION_FIGEE',
      'Seule une promotion en brouillon peut être supprimée.'
    );
  }

  const inscriptions = await promotionModel.compterInscriptions(id);
  if (inscriptions > 0) {
    throw new ErreurApp(
      409,
      'PROMOTION_UTILISEE',
      `Suppression impossible : ${inscriptions} étudiant(s) y sont inscrits.`
    );
  }

  await avecErreursSql(() => promotionModel.supprimer(id));
}

// ── Inscriptions ───────────────────────────────────────────────────

export async function listerInscriptions(promotion_id, etablissement_id) {
  await recuperer(promotion_id, etablissement_id);
  return inscriptionModel.listerParPromotion(promotion_id);
}

/** Parcours pluriannuel d'un étudiant de l'établissement. */
export async function parcoursEtudiant(candidat_id, etablissement_id) {
  if (!estUuidValide(candidat_id)) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  }
  const candidat = await candidatModel.trouverParId(candidat_id);
  if (!candidat || candidat.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  }
  return inscriptionModel.listerParCandidat(candidat_id);
}

export async function inscrire(promotion_id, etablissement_id, donnees) {
  const promotion = await recuperer(promotion_id, etablissement_id);

  if (!STATUTS_PROMOTION_MODIFIABLE.includes(promotion.statut)) {
    throw new ErreurApp(
      409,
      'PROMOTION_FIGEE',
      `La composition d'une promotion « ${promotion.statut} » ne peut plus changer.`
    );
  }

  const candidat_id = nettoyerTexte(donnees.candidat_id);
  if (!candidat_id) throw new ErreurApp(400, 'CHAMP_REQUIS', 'L\'étudiant est requis.');
  if (!estUuidValide(candidat_id)) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  }

  // Isolation : on n'inscrit que ses propres étudiants.
  const candidat = await candidatModel.trouverParId(candidat_id);
  if (!candidat || candidat.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  }

  return avecErreursSql(
    () => inscriptionModel.creer({ candidat_id, promotion_id, statut: 'inscrit' }),
    CONTRAINTES_INSCRIPTION
  );
}

/** Enregistre le résultat d'un étudiant : statut, moyenne, mention. */
export async function enregistrerResultat(promotion_id, inscription_id, etablissement_id, donnees) {
  const promotion = await recuperer(promotion_id, etablissement_id);

  if (promotion.statut === 'cloturee') {
    throw new ErreurApp(
      409,
      'PROMOTION_FIGEE',
      'Les résultats d\'une promotion clôturée ne peuvent plus être modifiés.'
    );
  }

  const inscription = await recupererInscription(inscription_id, promotion_id);

  const statut = nettoyerTexte(donnees.statut);
  if (!statut) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le statut de l\'étudiant est requis.');
  if (!STATUTS_INSCRIPTION.includes(statut)) {
    throw new ErreurApp(
      400,
      'STATUT_INVALIDE',
      `Statut inconnu. Valeurs acceptées : ${STATUTS_INSCRIPTION.join(', ')}.`
    );
  }

  const mention = nettoyerTexte(donnees.mention);
  if (mention && !MENTIONS.includes(mention)) {
    throw new ErreurApp(400, 'MENTION_INVALIDE', 'Mention inconnue.');
  }
  if (mention && statut !== 'admis') {
    throw new ErreurApp(
      400,
      'MENTION_NON_AUTORISEE',
      'Une mention ne peut être attribuée qu\'à un étudiant admis.'
    );
  }

  let moyenne = null;
  if (donnees.moyenne !== undefined && donnees.moyenne !== null && donnees.moyenne !== '') {
    moyenne = Number(donnees.moyenne);
    if (!Number.isFinite(moyenne) || moyenne < 0 || moyenne > 20) {
      throw new ErreurApp(
        400,
        'MOYENNE_INVALIDE',
        'La moyenne doit être un nombre compris entre 0 et 20.'
      );
    }
  }

  return avecErreursSql(
    () => inscriptionModel.enregistrerResultat(inscription.id, { statut, moyenne, mention }),
    CONTRAINTES_INSCRIPTION
  );
}

async function recupererInscription(inscription_id, promotion_id) {
  if (!estUuidValide(inscription_id)) {
    throw new ErreurApp(404, 'INSCRIPTION_INTROUVABLE', 'Inscription introuvable.');
  }
  const inscription = await inscriptionModel.trouverParId(inscription_id);
  if (!inscription || inscription.promotion_id !== promotion_id) {
    throw new ErreurApp(404, 'INSCRIPTION_INTROUVABLE', 'Inscription introuvable.');
  }
  return inscription;
}

// ── Import d'une promotion entière ─────────────────────────────────

/** Garde commune aux deux modes d'import. */
async function promotionPourImport(promotion_id, etablissement_id, fichier) {
  const promotion = await recuperer(promotion_id, etablissement_id);

  if (!STATUTS_PROMOTION_MODIFIABLE.includes(promotion.statut)) {
    throw new ErreurApp(
      409,
      'PROMOTION_FIGEE',
      `Une promotion « ${promotion.statut} » n'accepte plus d'import.`
    );
  }
  if (!fichier?.buffer?.length) {
    throw new ErreurApp(400, 'FICHIER_REQUIS', 'Aucun fichier reçu.');
  }

  return promotion;
}

/** Gabarit Excel à remplir, consignes incluses. */
export function genererModeleImport() {
  return importService.genererModele();
}

/** Simulation : produit le rapport sans rien écrire. */
export async function analyserImport(promotion_id, etablissement_id, fichier) {
  await promotionPourImport(promotion_id, etablissement_id, fichier);

  const { rapport } = await importService.analyser({
    buffer: fichier.buffer,
    nomFichier: fichier.originalname || '',
    etablissement_id,
    promotion_id,
  });
  return rapport;
}

/** Import réel — strict : la moindre erreur annule l'ensemble. */
export async function executerImport(promotion_id, etablissement_id, fichier) {
  await promotionPourImport(promotion_id, etablissement_id, fichier);

  return importService.importer({
    buffer: fichier.buffer,
    nomFichier: fichier.originalname || '',
    etablissement_id,
    promotion_id,
  });
}

export async function desinscrire(promotion_id, inscription_id, etablissement_id) {
  const promotion = await recuperer(promotion_id, etablissement_id);

  if (!STATUTS_PROMOTION_MODIFIABLE.includes(promotion.statut)) {
    throw new ErreurApp(
      409,
      'PROMOTION_FIGEE',
      `La composition d'une promotion « ${promotion.statut} » ne peut plus changer.`
    );
  }

  const inscription = await recupererInscription(inscription_id, promotion_id);
  await avecErreursSql(() => inscriptionModel.supprimer(inscription.id));
}
