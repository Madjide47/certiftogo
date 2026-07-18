// ─────────────────────────────────────────────────────────────
// Service "candidat" — logique métier du module établissement.
// Contrôle l'appartenance à l'établissement et la validation.
// ─────────────────────────────────────────────────────────────
import * as candidatModel from '../models/candidat.model.js';
import { ErreurApp } from '../utils/errors.js';
import { nettoyerTexte, estEmailValide, estDansEnum, SEXES } from '../utils/validators.js';

/** Liste les candidats de l'établissement courant. */
export async function lister(etablissement_id, { recherche, limit, offset } = {}) {
  return candidatModel.lister({ etablissement_id, recherche, limit, offset });
}

/** Récupère un candidat en garantissant qu'il appartient à l'établissement. */
export async function recuperer(id, etablissement_id) {
  const candidat = await candidatModel.trouverParId(id);
  if (!candidat || candidat.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Candidat introuvable.');
  }
  return candidat;
}

/** Valide et normalise les données d'un candidat. */
function validerDonnees(donnees) {
  const numero_etudiant = nettoyerTexte(donnees.numero_etudiant);
  const nom = nettoyerTexte(donnees.nom);
  const prenom = nettoyerTexte(donnees.prenom);

  if (!numero_etudiant) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le numéro étudiant est requis.');
  if (!nom) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le nom est requis.');
  if (!prenom) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le prénom est requis.');

  const email = nettoyerTexte(donnees.email);
  if (!estEmailValide(email)) throw new ErreurApp(400, 'EMAIL_INVALIDE', 'Email invalide.');

  const sexe = nettoyerTexte(donnees.sexe);
  if (!estDansEnum(sexe, SEXES)) throw new ErreurApp(400, 'SEXE_INVALIDE', 'Le sexe doit être M ou F.');

  return {
    numero_etudiant,
    nom,
    prenom,
    date_naissance: nettoyerTexte(donnees.date_naissance),
    lieu_naissance: nettoyerTexte(donnees.lieu_naissance),
    sexe,
    telephone: nettoyerTexte(donnees.telephone),
    email,
  };
}

/** Crée un candidat pour l'établissement courant. */
export async function creer(etablissement_id, donnees) {
  const data = validerDonnees(donnees);

  if (await candidatModel.numeroExiste(etablissement_id, data.numero_etudiant)) {
    throw new ErreurApp(409, 'NUMERO_DUPLIQUE', 'Ce numéro étudiant existe déjà.');
  }

  return candidatModel.creer({ ...data, etablissement_id });
}

/** Met à jour un candidat de l'établissement courant. */
export async function modifier(id, etablissement_id, donnees) {
  await recuperer(id, etablissement_id); // garantit l'appartenance
  const data = validerDonnees(donnees);

  if (await candidatModel.numeroExiste(etablissement_id, data.numero_etudiant, id)) {
    throw new ErreurApp(409, 'NUMERO_DUPLIQUE', 'Ce numéro étudiant existe déjà.');
  }

  return candidatModel.modifier(id, data);
}

/** Supprime un candidat (refusé s'il possède des dossiers). */
export async function supprimer(id, etablissement_id) {
  await recuperer(id, etablissement_id);
  try {
    await candidatModel.supprimer(id);
  } catch (err) {
    if (err.code === '23503') {
      throw new ErreurApp(
        409,
        'CANDIDAT_LIE',
        'Impossible de supprimer : ce candidat possède des dossiers.'
      );
    }
    throw err;
  }
}
