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
export async function recupererMoi() {
  const { data } = await api.get('/auth/me');
  return data.data.utilisateur;
}
