// ─────────────────────────────────────────────────────────────
// Service "admin système" — statistiques globales, gestion des comptes
// et des établissements.
// ─────────────────────────────────────────────────────────────
import * as adminModel from '../models/admin.model.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import * as etablissementModel from '../models/etablissement.model.js';
import { ErreurApp } from '../utils/errors.js';
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
  const rattachement = { etablissement_id: null, ministere_id: null, candidat_id: null };
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
    if (!donnees.candidat_id) {
      throw new ErreurApp(400, 'RATTACHEMENT_REQUIS', 'Un candidat est requis pour ce rôle.');
    }
    rattachement.candidat_id = donnees.candidat_id;
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
  return maj;
}

// ── Établissements ─────────────────────────────────────────────

export async function listerEtablissements() {
  return etablissementModel.lister();
}

export async function creerEtablissement(donnees) {
  const nom = nettoyerTexte(donnees.nom);
  const type = nettoyerTexte(donnees.type);
  const ville = nettoyerTexte(donnees.ville);
  const email = nettoyerTexte(donnees.email);

  if (!nom || !ville) {
    throw new ErreurApp(400, 'CHAMPS_REQUIS', 'Nom et ville sont requis.');
  }
  if (!estDansEnum(type, TYPES_ETABLISSEMENT) || !type) {
    throw new ErreurApp(400, 'TYPE_INVALIDE', "Type d'établissement invalide.");
  }
  if (!estEmailValide(email)) {
    throw new ErreurApp(400, 'EMAIL_INVALIDE', 'Email invalide.');
  }

  return etablissementModel.creer({
    nom,
    type,
    ville,
    email,
    telephone: nettoyerTexte(donnees.telephone),
    adresse: nettoyerTexte(donnees.adresse),
  });
}

export async function definirStatutEtablissement(id, statut) {
  if (!estDansEnum(statut, STATUTS_ETABLISSEMENT) || !statut) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut invalide.');
  }
  const maj = await etablissementModel.definirStatut(id, statut);
  if (!maj) {
    throw new ErreurApp(404, 'ETABLISSEMENT_INTROUVABLE', 'Établissement introuvable.');
  }
  return maj;
}
