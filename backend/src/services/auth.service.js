// ─────────────────────────────────────────────────────────────
// Service d'authentification — logique métier de l'auth OTP.
// Orchestre modèles + services OTP/WhatsApp + génération JWT.
// ─────────────────────────────────────────────────────────────
import * as utilisateurModel from '../models/utilisateur.model.js';
import * as otpModel from '../models/otp.model.js';
import { genererCodeOtp, calculerExpiration, OTP_EXPIRATION_MINUTES } from './otp.service.js';
import { envoyerCodeOtp, estActif as whatsappActif } from './whatsapp.service.js';
import { genererToken } from '../config/jwt.js';
import { journaliser, ACTIONS } from './audit.service.js';
import * as sessions from './session.service.js';

/** Essais autorisés sur un code OTP avant de le brûler (CDC §23.5). */
export const TENTATIVES_OTP_MAX = Number(process.env.OTP_TENTATIVES_MAX || 5);

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

  // Réponse VOLONTAIREMENT identique que le compte existe ou non : un
  // 404 sur numéro inconnu permettrait d'énumérer les comptes de la
  // plateforme — donc de savoir qui travaille au ministère. On ne dit
  // rien, on n'envoie simplement pas de code.
  const reponseGenerique = {
    message: `Si un compte est associé à ce numéro, un code de vérification vient d'être envoyé. Il expire dans ${OTP_EXPIRATION_MINUTES} minutes.`,
    expiration_minutes: OTP_EXPIRATION_MINUTES,
  };

  if (!utilisateur || !utilisateur.actif) {
    await journaliser({
      action: ACTIONS.OTP_DEMANDE,
      entite: 'utilisateurs',
      resultat: 'echec',
      auteur_libelle: telephone,
      message: utilisateur ? 'Compte désactivé.' : 'Numéro inconnu.',
    });
    return reponseGenerique;
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

  await journaliser({
    action: ACTIONS.OTP_DEMANDE,
    entite: 'utilisateurs',
    entite_id: utilisateur.id,
    utilisateur_id: utilisateur.id,
    auteur_libelle: `${utilisateur.nom} ${utilisateur.prenom}`.trim(),
  });

  const reponse = { ...reponseGenerique };

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
    // Un code à 6 chiffres, c'est un million de possibilités : sans
    // plafond d'essais il tombe en quelques minutes avec un script. On
    // compte les échecs sur le code ACTIF du numéro, et on le brûle au
    // plafond — l'attaquant doit alors en refaire émettre un.
    const actif = await otpModel.trouverCodeActif(telephone);
    if (actif) {
      const etat = await otpModel.enregistrerEchec(actif.id, TENTATIVES_OTP_MAX);
      if (etat?.bloque) {
        await journaliser({
          action: ACTIONS.CONNEXION_ECHOUEE,
          entite: 'utilisateurs',
          entite_id: actif.utilisateur_id,
          resultat: 'echec',
          auteur_libelle: telephone,
          message: `Code brûlé après ${etat.tentatives} tentatives infructueuses.`,
        });
        throw new ErreurAuth(
          429,
          'TROP_DE_TENTATIVES',
          'Trop de tentatives : ce code est désormais invalide. Demandez-en un nouveau.'
        );
      }
    }

    // Une tentative infructueuse est tracée : c'est le premier signal
    // d'une attaque par force brute sur un numéro connu.
    await journaliser({
      action: ACTIONS.CONNEXION_ECHOUEE,
      entite: 'utilisateurs',
      resultat: 'echec',
      message: `Code invalide ou expiré pour ${telephone}.`,
      auteur_libelle: telephone,
    });
    throw new ErreurAuth(401, 'CODE_INVALIDE', 'Code invalide, expiré ou déjà utilisé.');
  }

  // Le code est bon : on le consomme.
  await otpModel.marquerUtilise(codeOtp.id);

  const utilisateur = await utilisateurModel.trouverParId(codeOtp.utilisateur_id);
  if (!utilisateur || !utilisateur.actif) {
    throw new ErreurAuth(403, 'COMPTE_INACTIF', 'Ce compte est indisponible.');
  }

  // Une session révocable adosse le jeton : désactiver un compte ferme
  // désormais ses accès en cours, au lieu de les laisser vivre 24 h.
  const { session, jeton_rafraichissement } = await sessions.ouvrir(utilisateur.id);

  const token = genererToken({
    session_id: session.id,
    utilisateur_id: utilisateur.id,
    role: utilisateur.role,
    etablissement_id: utilisateur.etablissement_id,
    ministere_id: utilisateur.ministere_id,
    personne_id: utilisateur.personne_id,
    // Porté par le jeton : détermine qui peut créer d'autres agents.
    est_agent_principal: utilisateur.est_agent_principal === true,
  });

  await journaliser({
    action: ACTIONS.CONNEXION_REUSSIE,
    entite: 'utilisateurs',
    entite_id: utilisateur.id,
    utilisateur_id: utilisateur.id,
    role: utilisateur.role,
    etablissement_id: utilisateur.etablissement_id,
    auteur_libelle: `${utilisateur.nom} ${utilisateur.prenom}`.trim(),
  });

  return {
    token,
    jeton_rafraichissement,
    session_id: session.id,
    utilisateur: formaterUtilisateur(utilisateur),
  };
}

/**
 * Renouvelle un jeton d'accès à partir d'un jeton de rafraîchissement.
 * Le compte est revérifié à chaque fois : un compte désactivé entre-temps
 * ne se renouvelle pas.
 */
export async function rafraichir(jeton_rafraichissement) {
  const session = await sessions.resoudre(jeton_rafraichissement);
  const utilisateur = await utilisateurModel.trouverParId(session.utilisateur_id);

  if (!utilisateur || !utilisateur.actif) {
    await sessions.revoquerCompte(session.utilisateur_id, { motif: 'compte_desactive' });
    throw new ErreurAuth(403, 'COMPTE_INACTIF', 'Ce compte est indisponible.');
  }

  const token = genererToken({
    session_id: session.id,
    utilisateur_id: utilisateur.id,
    role: utilisateur.role,
    etablissement_id: utilisateur.etablissement_id,
    ministere_id: utilisateur.ministere_id,
    personne_id: utilisateur.personne_id,
    est_agent_principal: utilisateur.est_agent_principal === true,
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
    personne_id: u.personne_id,
    actif: u.actif,
    est_agent_principal: u.est_agent_principal === true,
  };
}
