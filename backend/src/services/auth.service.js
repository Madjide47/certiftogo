// ─────────────────────────────────────────────────────────────
// Service d'authentification — logique métier de l'auth OTP.
// Orchestre modèles + services OTP/WhatsApp + génération JWT.
// ─────────────────────────────────────────────────────────────
import * as utilisateurModel from '../models/utilisateur.model.js';
import * as otpModel from '../models/otp.model.js';
import { genererCodeOtp, calculerExpiration, OTP_EXPIRATION_MINUTES } from './otp.service.js';
import { envoyerCodeOtp, estActif as whatsappActif } from './whatsapp.service.js';
import { genererToken } from '../config/jwt.js';

/** Erreur métier avec code HTTP et code applicatif. */
export class ErreurAuth extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Étape 1 — Demande d'un code OTP pour un numéro de téléphone.
 * Génère, stocke et "envoie" (mock console) un code.
 * @param {string} telephone (déjà normalisé)
 */
export async function demanderOtp(telephone) {
  const utilisateur = await utilisateurModel.trouverParTelephone(telephone);

  if (!utilisateur) {
    throw new ErreurAuth(404, 'UTILISATEUR_INTROUVABLE', 'Aucun compte associé à ce numéro.');
  }
  if (!utilisateur.actif) {
    throw new ErreurAuth(403, 'COMPTE_INACTIF', 'Ce compte est désactivé.');
  }

  // On invalide les éventuels codes encore actifs avant d'en créer un nouveau.
  await otpModel.invaliderCodesActifs(utilisateur.id);

  const code = genererCodeOtp();
  const date_expiration = calculerExpiration();

  await otpModel.creerCode({
    utilisateur_id: utilisateur.id,
    code,
    telephone,
    date_expiration,
  });

  try {
    await envoyerCodeOtp(telephone, code);
  } catch (err) {
    // L'envoi a échoué : le code stocké est inutilisable, on l'invalide
    // pour ne pas laisser traîner un OTP que personne n'a reçu.
    await otpModel.invaliderCodesActifs(utilisateur.id);
    throw new ErreurAuth(
      502,
      'ENVOI_OTP_ECHEC',
      "Impossible d'envoyer le code de vérification. Réessayez dans un instant."
    );
  }

  const reponse = {
    message: `Un code de vérification a été envoyé par WhatsApp. Il expire dans ${OTP_EXPIRATION_MINUTES} minutes.`,
    expiration_minutes: OTP_EXPIRATION_MINUTES,
  };

  // Le code n'est renvoyé au front que si AUCUN envoi réel n'a eu lieu
  // (mode mock) et hors production. NE JAMAIS exposer autrement.
  if (process.env.NODE_ENV !== 'production' && !whatsappActif()) {
    reponse.code_dev = code;
  }

  return reponse;
}

/**
 * Étape 2 — Vérification d'un code OTP. Renvoie un JWT + les infos utilisateur.
 * @param {string} telephone (déjà normalisé)
 * @param {string} code
 */
export async function verifierOtp(telephone, code) {
  const codeOtp = await otpModel.trouverCodeValide(telephone, code);

  if (!codeOtp) {
    throw new ErreurAuth(401, 'CODE_INVALIDE', 'Code invalide, expiré ou déjà utilisé.');
  }

  // Le code est bon : on le consomme.
  await otpModel.marquerUtilise(codeOtp.id);

  const utilisateur = await utilisateurModel.trouverParId(codeOtp.utilisateur_id);
  if (!utilisateur || !utilisateur.actif) {
    throw new ErreurAuth(403, 'COMPTE_INACTIF', 'Ce compte est indisponible.');
  }

  const token = genererToken({
    utilisateur_id: utilisateur.id,
    role: utilisateur.role,
    etablissement_id: utilisateur.etablissement_id,
    ministere_id: utilisateur.ministere_id,
    candidat_id: utilisateur.candidat_id,
  });

  return { token, utilisateur: formaterUtilisateur(utilisateur) };
}

/** Formate un utilisateur pour l'exposition côté API (sans champ sensible). */
export function formaterUtilisateur(u) {
  return {
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    telephone: u.telephone,
    role: u.role,
    etablissement_id: u.etablissement_id,
    ministere_id: u.ministere_id,
    candidat_id: u.candidat_id,
    actif: u.actif,
  };
}
