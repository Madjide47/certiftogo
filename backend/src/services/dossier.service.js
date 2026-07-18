// ─────────────────────────────────────────────────────────────
// Service "dossier" — logique métier du module établissement.
// Gère le cycle de vie côté établissement : brouillon → soumis.
// ─────────────────────────────────────────────────────────────
import * as dossierModel from '../models/dossier.model.js';
import * as candidatModel from '../models/candidat.model.js';
import { ErreurApp } from '../utils/errors.js';
import {
  nettoyerTexte,
  estDansEnum,
  MENTIONS,
  TYPES_DIPLOME,
} from '../utils/validators.js';
import { genererReferenceDossier } from '../utils/reference-generator.js';

/** Liste les dossiers de l'établissement courant. */
export async function lister(etablissement_id, { statut, limit, offset } = {}) {
  return dossierModel.lister({ etablissement_id, statut, limit, offset });
}

/** Récupère un dossier en garantissant l'appartenance à l'établissement. */
export async function recuperer(id, etablissement_id) {
  const dossier = await dossierModel.trouverParId(id);
  if (!dossier || dossier.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');
  }
  return dossier;
}

/** Valide et normalise les données métier d'un dossier. */
function validerDonnees(donnees) {
  const mention = nettoyerTexte(donnees.mention);
  if (!estDansEnum(mention, MENTIONS)) {
    throw new ErreurApp(400, 'MENTION_INVALIDE', 'Mention invalide.');
  }
  const type_diplome = nettoyerTexte(donnees.type_diplome);
  if (!estDansEnum(type_diplome, TYPES_DIPLOME)) {
    throw new ErreurApp(400, 'TYPE_DIPLOME_INVALIDE', 'Type de diplôme invalide.');
  }

  // notes : JSON libre (objet), optionnel.
  let notes = donnees.notes ?? null;
  if (notes != null && typeof notes !== 'object') {
    throw new ErreurApp(400, 'NOTES_INVALIDES', 'Les notes doivent être un objet JSON.');
  }

  return {
    filiere: nettoyerTexte(donnees.filiere),
    parcours: nettoyerTexte(donnees.parcours),
    mention,
    date_obtention: nettoyerTexte(donnees.date_obtention),
    type_diplome,
    annee_academique: nettoyerTexte(donnees.annee_academique),
    notes,
  };
}

/** Génère une référence CT-AAAA-XXXXX unique (quelques tentatives). */
async function genererReferenceUnique() {
  for (let i = 0; i < 5; i += 1) {
    const reference = genererReferenceDossier();
    if (!(await dossierModel.referenceExiste(reference))) return reference;
  }
  throw new ErreurApp(500, 'REFERENCE_INDISPONIBLE', 'Impossible de générer une référence unique.');
}

/** Vérifie que le candidat appartient bien à l'établissement. */
async function verifierCandidat(candidat_id, etablissement_id) {
  const candidat = candidat_id ? await candidatModel.trouverParId(candidat_id) : null;
  if (!candidat || candidat.etablissement_id !== etablissement_id) {
    throw new ErreurApp(400, 'CANDIDAT_INVALIDE', 'Candidat inexistant ou hors de votre établissement.');
  }
}

/** Crée un dossier (brouillon) pour un candidat de l'établissement. */
export async function creer(etablissement_id, agent_etablissement_id, donnees) {
  await verifierCandidat(donnees.candidat_id, etablissement_id);
  const data = validerDonnees(donnees);
  const reference = await genererReferenceUnique();

  return dossierModel.creer({
    ...data,
    reference,
    etablissement_id,
    candidat_id: donnees.candidat_id,
    agent_etablissement_id,
  });
}

/** Modifie un dossier — autorisé uniquement en statut brouillon ou rejete. */
export async function modifier(id, etablissement_id, donnees) {
  const dossier = await recuperer(id, etablissement_id);
  if (!['brouillon', 'rejete'].includes(dossier.statut)) {
    throw new ErreurApp(
      409,
      'DOSSIER_NON_MODIFIABLE',
      'Seul un dossier en brouillon ou rejeté peut être modifié.'
    );
  }

  const candidat_id = donnees.candidat_id || dossier.candidat_id;
  await verifierCandidat(candidat_id, etablissement_id);
  const data = validerDonnees(donnees);

  return dossierModel.modifier(id, { ...data, candidat_id });
}

/** Transmet un dossier au ministère : brouillon/rejete → soumis. */
export async function transmettre(id, etablissement_id, agent_etablissement_id) {
  const dossier = await recuperer(id, etablissement_id);
  if (!['brouillon', 'rejete'].includes(dossier.statut)) {
    throw new ErreurApp(
      409,
      'DOSSIER_NON_TRANSMISSIBLE',
      'Ce dossier a déjà été transmis ou traité.'
    );
  }
  // Cohérence minimale avant transmission au ministère.
  if (!dossier.type_diplome || !dossier.date_obtention) {
    throw new ErreurApp(
      400,
      'DOSSIER_INCOMPLET',
      'Renseignez au moins le type de diplôme et la date d\'obtention avant transmission.'
    );
  }
  return dossierModel.transmettre(id, agent_etablissement_id);
}

/** Supprime un dossier — uniquement en brouillon. */
export async function supprimer(id, etablissement_id) {
  const dossier = await recuperer(id, etablissement_id);
  if (dossier.statut !== 'brouillon') {
    throw new ErreurApp(
      409,
      'DOSSIER_NON_SUPPRIMABLE',
      'Seul un dossier en brouillon peut être supprimé.'
    );
  }
  await dossierModel.supprimer(id);
}
