// ─────────────────────────────────────────────────────────────
// Service "structure" — facultés et filières d'un établissement.
//
// Isolation : un établissement ne voit et ne modifie que sa propre
// structure. Une filière n'expose pas son établissement directement,
// il est résolu par la faculté parente.
// ─────────────────────────────────────────────────────────────
import * as faculteModel from '../models/faculte.model.js';
import * as filiereModel from '../models/filiere.model.js';
import * as nomenclature from './nomenclature.service.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import {
  nettoyerTexte,
  estUuidValide,
  estDansEnum,
  versEntier,
  STATUTS_STRUCTURE,
} from '../utils/validators.js';

const CONTRAINTES_FACULTE = {
  facultes_etablissement_id_code_key: [
    409,
    'CODE_DUPLIQUE',
    'Une faculté portant ce code existe déjà dans votre établissement.',
  ],
};

const CONTRAINTES_FILIERE = {
  filieres_faculte_id_code_key: [
    409,
    'CODE_DUPLIQUE',
    'Une filière portant ce code existe déjà dans cette faculté.',
  ],
};

// ── Facultés ───────────────────────────────────────────────────────

export async function listerFacultes(etablissement_id, { statut } = {}) {
  if (!estDansEnum(statut, STATUTS_STRUCTURE)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de faculté inconnu.');
  }
  return faculteModel.lister({ etablissement_id, statut: nettoyerTexte(statut) });
}

/** Récupère une faculté en garantissant qu'elle appartient à l'établissement. */
export async function recupererFaculte(id, etablissement_id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'FACULTE_INTROUVABLE', 'Faculté introuvable.');
  }
  const faculte = await faculteModel.trouverParId(id);
  // Même réponse qu'une faculté inexistante : on ne révèle pas l'existence
  // d'une faculté appartenant à un autre établissement.
  if (!faculte || faculte.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'FACULTE_INTROUVABLE', 'Faculté introuvable.');
  }
  return faculte;
}

function validerFaculte(donnees) {
  const nom = nettoyerTexte(donnees.nom);
  const code = nettoyerTexte(donnees.code);

  if (!nom) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le nom de la faculté est requis.');
  if (!code) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le code de la faculté est requis.');
  if (code.length > 20) {
    throw new ErreurApp(400, 'CODE_INVALIDE', 'Le code ne peut pas dépasser 20 caractères.');
  }

  const statut = nettoyerTexte(donnees.statut) || 'active';
  if (!STATUTS_STRUCTURE.includes(statut)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de faculté inconnu.');
  }

  return { nom, code: code.toUpperCase(), statut };
}

export async function creerFaculte(etablissement_id, donnees) {
  const data = validerFaculte(donnees);
  return avecErreursSql(
    () => faculteModel.creer({ ...data, etablissement_id }),
    CONTRAINTES_FACULTE
  );
}

export async function modifierFaculte(id, etablissement_id, donnees) {
  await recupererFaculte(id, etablissement_id);
  const data = validerFaculte(donnees);
  return avecErreursSql(() => faculteModel.modifier(id, data), CONTRAINTES_FACULTE);
}

export async function supprimerFaculte(id, etablissement_id) {
  await recupererFaculte(id, etablissement_id);
  const filieres = await faculteModel.compterFilieres(id);
  if (filieres > 0) {
    throw new ErreurApp(
      409,
      'FACULTE_UTILISEE',
      `Suppression impossible : ${filieres} filière(s) sont rattachées à cette faculté.`
    );
  }
  await avecErreursSql(() => faculteModel.supprimer(id));
}

// ── Filières ───────────────────────────────────────────────────────

export async function listerFilieres(etablissement_id, { faculte_id, statut } = {}) {
  if (faculte_id && !estUuidValide(faculte_id)) {
    throw new ErreurApp(400, 'FORMAT_INVALIDE', 'Identifiant de faculté invalide.');
  }
  if (!estDansEnum(statut, STATUTS_STRUCTURE)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de filière inconnu.');
  }
  return filiereModel.lister({
    etablissement_id,
    faculte_id: nettoyerTexte(faculte_id),
    statut: nettoyerTexte(statut),
  });
}

export async function recupererFiliere(id, etablissement_id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'FILIERE_INTROUVABLE', 'Filière introuvable.');
  }
  const filiere = await filiereModel.trouverParId(id);
  if (!filiere || filiere.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'FILIERE_INTROUVABLE', 'Filière introuvable.');
  }
  return filiere;
}

async function validerFiliere(donnees) {
  const nom = nettoyerTexte(donnees.nom);
  const code = nettoyerTexte(donnees.code);
  const type_diplome = nettoyerTexte(donnees.type_diplome);

  if (!nom) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le nom de la filière est requis.');
  if (!code) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le code de la filière est requis.');
  if (code.length > 20) {
    throw new ErreurApp(400, 'CODE_INVALIDE', 'Le code ne peut pas dépasser 20 caractères.');
  }
  if (!type_diplome) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le type de diplôme est requis.');
  if (!(await nomenclature.estTypeDiplomeValide(type_diplome))) {
    throw new ErreurApp(
      400,
      'TYPE_DIPLOME_INVALIDE',
      `Type de diplôme inconnu. Valeurs acceptées : ${(await nomenclature.codesTypesDiplome()).join(', ')}.`
    );
  }

  const duree_annees = donnees.duree_annees === undefined ? 3 : versEntier(donnees.duree_annees);
  if (duree_annees === null || duree_annees < 1 || duree_annees > 8) {
    throw new ErreurApp(
      400,
      'DUREE_INVALIDE',
      'La durée doit être un entier compris entre 1 et 8 années.'
    );
  }

  const statut = nettoyerTexte(donnees.statut) || 'active';
  if (!STATUTS_STRUCTURE.includes(statut)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de filière inconnu.');
  }

  return { nom, code: code.toUpperCase(), type_diplome, duree_annees, statut };
}

export async function creerFiliere(etablissement_id, donnees) {
  const faculte_id = nettoyerTexte(donnees.faculte_id);
  if (!faculte_id) throw new ErreurApp(400, 'CHAMP_REQUIS', 'La faculté de rattachement est requise.');

  // Garantit que la faculté visée appartient bien à l'établissement appelant.
  await recupererFaculte(faculte_id, etablissement_id);

  const data = await validerFiliere(donnees);
  return avecErreursSql(() => filiereModel.creer({ ...data, faculte_id }), CONTRAINTES_FILIERE);
}

export async function modifierFiliere(id, etablissement_id, donnees) {
  await recupererFiliere(id, etablissement_id);
  const data = await validerFiliere(donnees);
  return avecErreursSql(() => filiereModel.modifier(id, data), CONTRAINTES_FILIERE);
}

export async function supprimerFiliere(id, etablissement_id) {
  await recupererFiliere(id, etablissement_id);
  const promotions = await filiereModel.compterPromotions(id);
  if (promotions > 0) {
    throw new ErreurApp(
      409,
      'FILIERE_UTILISEE',
      `Suppression impossible : ${promotions} promotion(s) sont rattachées à cette filière.`
    );
  }
  await avecErreursSql(() => filiereModel.supprimer(id));
}
