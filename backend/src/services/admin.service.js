// ─────────────────────────────────────────────────────────────
// Service "admin système" — statistiques globales, gestion des comptes
// et des établissements.
// ─────────────────────────────────────────────────────────────
import * as adminModel from '../models/admin.model.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import * as etablissementModel from '../models/etablissement.model.js';
import { ErreurApp } from '../utils/errors.js';
import * as sessions from './session.service.js';
import * as notifications from './notification.service.js';
import { journaliser, ACTIONS } from './audit.service.js';
import {
  nettoyerTexte,
  estDansEnum,
  normaliserTelephone,
  estTelephoneValide,
  estEmailValide,
  ROLES,
  TYPES_ETABLISSEMENT,
  STATUTS_ETABLISSEMENT,
} from '../utils/validators.js';

/** Statistiques globales de la plateforme. */
export async function statistiques() {
  return adminModel.statistiquesGlobales();
}

/** Configuration non sensible de la plateforme (lecture seule). */
export function configuration() {
  return {
    environnement: process.env.NODE_ENV || 'development',
    blockchain: {
      mode: process.env.BLOCKCHAIN_MODE || 'mock',
      contrat_adresse: process.env.CONTRAT_ADRESSE || null,
      rpc_url: process.env.BLOCKCHAIN_RPC_URL || null,
    },
    otp: {
      longueur: Number(process.env.OTP_LENGTH) || 6,
      expiration_minutes: Number(process.env.OTP_EXPIRATION_MINUTES) || 5,
      canal: 'Console (mock WhatsApp)',
    },
    securite: {
      jwt_expiration: process.env.JWT_EXPIRES_IN || '24h',
    },
  };
}

// ── Utilisateurs ───────────────────────────────────────────────

export async function listerUtilisateurs({ role } = {}) {
  return utilisateurModel.lister({ role: role || null });
}

/** Crée un compte utilisateur en garantissant la cohérence rôle ↔ rattachement. */
export async function creerUtilisateur(donnees) {
  const nom = nettoyerTexte(donnees.nom);
  const prenom = nettoyerTexte(donnees.prenom);
  const role = nettoyerTexte(donnees.role);
  const telephone = normaliserTelephone(donnees.telephone || '');

  if (!nom || !prenom) {
    throw new ErreurApp(400, 'CHAMPS_REQUIS', 'Nom et prénom sont requis.');
  }
  if (!estTelephoneValide(telephone)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', 'Numéro de téléphone invalide.');
  }
  if (!estDansEnum(role, ROLES) || !role) {
    throw new ErreurApp(400, 'ROLE_INVALIDE', 'Rôle invalide.');
  }

  // Cohérence rôle ↔ FK de rattachement (miroir de chk_role_rattachement).
  const rattachement = { etablissement_id: null, ministere_id: null, personne_id: null };
  if (role === 'etablissement') {
    if (!donnees.etablissement_id) {
      throw new ErreurApp(400, 'RATTACHEMENT_REQUIS', 'Un établissement est requis pour ce rôle.');
    }
    rattachement.etablissement_id = donnees.etablissement_id;
  } else if (role === 'ministere') {
    if (!donnees.ministere_id) {
      throw new ErreurApp(400, 'RATTACHEMENT_REQUIS', 'Un ministère est requis pour ce rôle.');
    }
    rattachement.ministere_id = donnees.ministere_id;
  } else if (role === 'candidat') {
    // Le compte candidat est rattaché à la PERSONNE, pas à sa fiche dans un
    // établissement : c'est ce qui rend son portefeuille national.
    if (!donnees.personne_id) {
      throw new ErreurApp(400, 'RATTACHEMENT_REQUIS', 'Une personne est requise pour ce rôle.');
    }
    rattachement.personne_id = donnees.personne_id;
  }

  const existant = await utilisateurModel.trouverParTelephone(telephone);
  if (existant) {
    throw new ErreurApp(409, 'TELEPHONE_EXISTANT', 'Ce numéro est déjà utilisé.');
  }

  return utilisateurModel.creer({ nom, prenom, telephone, role, ...rattachement });
}

/** Active / désactive un compte. */
export async function definirActifUtilisateur(id, actif) {
  const maj = await utilisateurModel.definirActif(id, !!actif);
  if (!maj) {
    throw new ErreurApp(404, 'UTILISATEUR_INTROUVABLE', 'Utilisateur introuvable.');
  }

  // Désactiver un compte doit couper ses accès TOUT DE SUITE. Sans cette
  // révocation, l'agent qui vient de quitter l'établissement resterait
  // connecté jusqu'à l'expiration de son jeton.
  if (!actif) {
    await sessions.revoquerCompte(id, { motif: 'compte_desactive' });
  }

  return maj;
}

// ── Établissements ─────────────────────────────────────────────

export async function listerEtablissements() {
  return etablissementModel.lister();
}

// `creerEtablissement` a été retirée d'ici : l'agrément d'un établissement
// est un acte du ministère, pas de l'exploitant de la plateforme. Voir
// `gouvernance.service.js`, qui crée l'établissement, son code officiel,
// ses habilitations et son agent principal d'un seul geste.

export async function definirStatutEtablissement(id, statut) {
  if (!estDansEnum(statut, STATUTS_ETABLISSEMENT) || !statut) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut invalide.');
  }
  const maj = await etablissementModel.definirStatut(id, statut);
  if (!maj) {
    throw new ErreurApp(404, 'ETABLISSEMENT_INTROUVABLE', 'Établissement introuvable.');
  }

  // Les agents doivent l'apprendre autrement qu'en voyant leur
  // transmission refusée sans explication.
  if (statut !== 'actif') {
    await notifications.notifierEtablissement(
      notifications.EVENEMENTS.ETABLISSEMENT_SUSPENDU,
      id,
      { etablissement: maj.nom, statut }
    );
  }

  await journaliser({
    action: ACTIONS.ETABLISSEMENT_SUSPENDU,
    entite: 'etablissements',
    entite_id: id,
    etablissement_id: id,
    apres: { statut },
    message: `${maj.nom} (${maj.code}) → ${statut}.`,
  });

  return maj;
}
