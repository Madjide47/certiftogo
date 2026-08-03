// ─────────────────────────────────────────────────────────────
// Service "candidat" — logique métier du module établissement.
// Contrôle l'appartenance à l'établissement et la validation.
// ─────────────────────────────────────────────────────────────
import * as candidatModel from '../models/candidat.model.js';
import * as personneModel from '../models/personne.model.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import { ErreurApp } from '../utils/errors.js';
import { journaliser, deposerCorbeille, ACTIONS } from './audit.service.js';
import {
  nettoyerTexte,
  estEmailValide,
  estDansEnum,
  canoniserTelephone,
  estTelephoneValide,
  canoniserDate,
  FORMATS_DATE_ACCEPTES,
  SEXES,
} from '../utils/validators.js';

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

  // Le téléphone est normalisé avant d'être stocké : sans cela
  // « 90 00 00 11 » et « +22890000011 » désigneraient deux personnes
  // distinctes, et le portefeuille national se fragmenterait.
  const telephone = canoniserTelephone(donnees.telephone || '');
  if (telephone && !estTelephoneValide(telephone)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', 'Numéro de téléphone invalide.');
  }

  // Sans ce contrôle, une date fantaisiste descendait jusqu'à PostgreSQL :
  // l'agent recevait une erreur de base de données au lieu du champ fautif.
  const date_naissance = canoniserDate(donnees.date_naissance);
  if (date_naissance === null) {
    throw new ErreurApp(
      400,
      'DATE_INVALIDE',
      `Date de naissance illisible. Formats acceptés : ${FORMATS_DATE_ACCEPTES}.`
    );
  }

  return {
    numero_etudiant,
    nom,
    prenom,
    date_naissance: date_naissance ?? null,
    lieu_naissance: nettoyerTexte(donnees.lieu_naissance),
    sexe,
    telephone,
    email,
  };
}

/**
 * Rattache la fiche à une personne : on réutilise l'identité existante si
 * le numéro est déjà connu, sinon on en crée une. C'est ce qui permet à un
 * diplômé de deux établissements de n'avoir qu'un seul portefeuille.
 */
async function resoudrePersonne(data) {
  if (data.telephone) {
    const existante = await personneModel.trouverParTelephone(data.telephone);
    if (existante) return existante;
  }
  return personneModel.creer(data);
}

/**
 * Crée le compte de connexion, désactivé.
 * Décision métier : le compte naît avec la saisie mais reste fermé tant
 * qu'aucun diplôme n'est certifié — la certification l'active. Cela évite
 * de créer des milliers de comptes pendant une certification de masse.
 */
async function assurerCompte(personne) {
  if (!personne.telephone) return null; // sans numéro, pas de connexion possible
  const existant = await utilisateurModel.trouverParTelephone(personne.telephone);
  if (existant) return existant;

  return utilisateurModel.creer({
    nom: personne.nom,
    prenom: personne.prenom,
    telephone: personne.telephone,
    role: 'candidat',
    personne_id: personne.id,
    actif: false,
  });
}

/** Crée un candidat pour l'établissement courant. */
export async function creer(etablissement_id, donnees) {
  const data = validerDonnees(donnees);

  if (await candidatModel.numeroExiste(etablissement_id, data.numero_etudiant)) {
    throw new ErreurApp(409, 'NUMERO_DUPLIQUE', 'Ce numéro étudiant existe déjà.');
  }

  const personne = await resoudrePersonne(data);
  await assurerCompte(personne);

  const candidat = await candidatModel.creer({
    ...data,
    personne_id: personne.id,
    etablissement_id,
  });

  await journaliser({
    action: ACTIONS.CANDIDAT_CREE,
    entite: 'candidats',
    entite_id: candidat.id,
    apres: candidat,
    message: `${candidat.nom} ${candidat.prenom} (${candidat.numero_etudiant}).`,
  });

  return candidat;
}

/** Met à jour un candidat de l'établissement courant. */
export async function modifier(id, etablissement_id, donnees) {
  const avant = await recuperer(id, etablissement_id); // garantit l'appartenance
  const data = validerDonnees(donnees);

  if (await candidatModel.numeroExiste(etablissement_id, data.numero_etudiant, id)) {
    throw new ErreurApp(409, 'NUMERO_DUPLIQUE', 'Ce numéro étudiant existe déjà.');
  }

  const apres = await candidatModel.modifier(id, data);

  await journaliser({
    action: ACTIONS.CANDIDAT_MODIFIE,
    entite: 'candidats',
    entite_id: id,
    avant,
    apres,
    message: `${apres.nom} ${apres.prenom} (${apres.numero_etudiant}).`,
  });

  return apres;
}

/** Supprime un candidat (refusé s'il possède des dossiers). */
export async function supprimer(id, etablissement_id) {
  const candidat = await recuperer(id, etablissement_id);
  try {
    // La ligne part d'abord en corbeille : toute suppression est réversible.
    await deposerCorbeille({
      table_source: 'candidats',
      enregistrement_id: id,
      donnees: candidat,
      libelle: `${candidat.nom} ${candidat.prenom} (${candidat.numero_etudiant})`,
      etablissement_id,
    });

    await candidatModel.supprimer(id);

    await journaliser({
      action: ACTIONS.CANDIDAT_SUPPRIME,
      entite: 'candidats',
      entite_id: id,
      avant: candidat,
      message: `${candidat.nom} ${candidat.prenom} (${candidat.numero_etudiant}).`,
    });
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
