// ─────────────────────────────────────────────────────────────
// Service "session" — jetons de rafraîchissement et révocation.
//
// Avant : un JWT valable 24 h que rien ne pouvait annuler. Désactiver un
// compte ne fermait pas ses accès en cours, et un téléphone volé restait
// exploitable une journée entière.
//
// Maintenant : un jeton d'accès court adossé à une session révocable. Le
// jeton de rafraîchissement n'est jamais stocké en clair — la fuite de la
// table ne permet pas d'usurper une session.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import * as sessionModel from '../models/session.model.js';
import { contexteCourant } from '../config/contexte.js';
import { ErreurApp } from '../utils/errors.js';
import { estUuidValide } from '../utils/validators.js';

/** Durée de vie d'une session (rafraîchissement possible pendant ce délai). */
export const DUREE_SESSION_JOURS = Number(process.env.SESSION_DUREE_JOURS || 30);

const empreinte = (jeton) => crypto.createHash('sha256').update(jeton).digest('hex');

/** Ouvre une session et renvoie le jeton de rafraîchissement en clair. */
export async function ouvrir(utilisateur_id) {
  const contexte = contexteCourant();
  const jeton = crypto.randomBytes(48).toString('hex');

  const expiration = new Date();
  expiration.setDate(expiration.getDate() + DUREE_SESSION_JOURS);

  const session = await sessionModel.creer({
    utilisateur_id,
    jeton_hash: empreinte(jeton),
    adresse_ip: contexte?.adresse_ip,
    user_agent: contexte?.user_agent,
    date_expiration: expiration,
  });

  return { session, jeton_rafraichissement: jeton };
}

/** Échange un jeton de rafraîchissement contre une session valide. */
export async function resoudre(jeton) {
  if (typeof jeton !== 'string' || jeton.length < 32) {
    throw new ErreurApp(401, 'JETON_INVALIDE', 'Jeton de rafraîchissement invalide.');
  }
  const session = await sessionModel.trouverParJeton(empreinte(jeton));
  if (!session) {
    throw new ErreurApp(401, 'SESSION_EXPIREE', 'Session expirée ou révoquée. Reconnectez-vous.');
  }
  await sessionModel.toucher(session.id);
  return session;
}

export function estActive(session_id) {
  return sessionModel.estActive(session_id);
}

export async function lister(utilisateur) {
  const sessions = await sessionModel.listerActives(utilisateur.utilisateur_id);
  return sessions.map((s) => ({
    ...s,
    // Le client doit pouvoir reconnaître « cet appareil-ci » sans qu'on
    // lui expose de jeton.
    courante: s.id === utilisateur.session_id,
  }));
}

export async function fermer(utilisateur, session_id) {
  if (!estUuidValide(session_id)) {
    throw new ErreurApp(404, 'SESSION_INTROUVABLE', 'Session introuvable.');
  }
  const sessions = await sessionModel.listerActives(utilisateur.utilisateur_id);
  if (!sessions.some((s) => s.id === session_id)) {
    throw new ErreurApp(404, 'SESSION_INTROUVABLE', 'Session introuvable.');
  }
  return sessionModel.revoquer(session_id, {
    par: utilisateur.utilisateur_id,
    motif: 'deconnexion',
  });
}

/** Ferme toutes les autres sessions — utile après une connexion suspecte. */
export async function fermerLesAutres(utilisateur) {
  return sessionModel.revoquerToutes(utilisateur.utilisateur_id, {
    par: utilisateur.utilisateur_id,
    motif: 'deconnexion_autres',
    sauf: utilisateur.session_id,
  });
}

/** Coupe immédiatement tous les accès d'un compte (désactivation, vol). */
export function revoquerCompte(utilisateur_id, { par = null, motif = 'compte_desactive' } = {}) {
  return sessionModel.revoquerToutes(utilisateur_id, { par, motif });
}

export const purger = sessionModel.purger;
