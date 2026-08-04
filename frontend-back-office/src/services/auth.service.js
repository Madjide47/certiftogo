// ─────────────────────────────────────────────────────────────
// Service d'authentification côté front — appels à l'API auth.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Demande l'envoi d'un code OTP. */
export async function demanderOtp(telephone) {
  const { data } = await api.post('/auth/request-otp', { telephone });
  return data.data; // { message, expiration_minutes }
}

/** Vérifie le code OTP et récupère le token + l'utilisateur. */
export async function verifierOtp(telephone, code) {
  const { data } = await api.post('/auth/verify-otp', { telephone, code });
  return data.data; // { token, utilisateur }
}

/** Récupère l'utilisateur connecté à partir du token stocké. */
/** Appareils actuellement connectés à ce compte. */
export async function listerSessions() {
  const { data } = await api.get('/auth/sessions');
  return data.data.sessions;
}

export async function fermerSession(id) {
  const { data } = await api.delete(`/auth/sessions/${id}`);
  return data.data;
}

export async function fermerAutresSessions() {
  const { data } = await api.post('/auth/sessions/fermer-autres');
  return data.data;
}

// ── Changement volontaire de numéro (A-14) ─────────────────────────

export async function etatChangementNumero() {
  const { data } = await api.get('/auth/changement-numero');
  return data.data.demande;
}

export async function demanderChangementNumero(nouveau_telephone) {
  const { data } = await api.post('/auth/changement-numero', { nouveau_telephone });
  return data.data;
}

export async function confirmerAncienNumero(id, code) {
  const { data } = await api.post(`/auth/changement-numero/${id}/confirmer-ancien`, { code });
  return data.data;
}

export async function confirmerNouveauNumero(id, code) {
  const { data } = await api.post(`/auth/changement-numero/${id}/confirmer-nouveau`, { code });
  return data.data;
}

export async function annulerChangementNumero(id) {
  const { data } = await api.delete(`/auth/changement-numero/${id}`);
  return data.data;
}

export async function recupererMoi() {
  const { data } = await api.get('/auth/me');
  return data.data.utilisateur;
}
