// ─────────────────────────────────────────────────────────────
// Service "référentiel" côté front — années académiques et sessions.
// Lecture ouverte à tous les rôles, écriture réservée au ministère.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Liste les années académiques (filtre de statut optionnel). */
export async function listerAnnees({ statut = '' } = {}) {
  const { data } = await api.get('/referentiel/annees', { params: statut ? { statut } : {} });
  return data.data.annees;
}

export async function creerAnnee(donnees) {
  const { data } = await api.post('/referentiel/annees', donnees);
  return data.data.annee;
}

export async function changerStatutAnnee(id, statut) {
  const { data } = await api.patch(`/referentiel/annees/${id}/statut`, { statut });
  return data.data.annee;
}

export async function supprimerAnnee(id) {
  await api.delete(`/referentiel/annees/${id}`);
}

/** Sessions d'une année académique. */
export async function listerSessions(anneeId) {
  const { data } = await api.get(`/referentiel/annees/${anneeId}/sessions`);
  return data.data.sessions;
}

export async function creerSession(anneeId, donnees) {
  const { data } = await api.post(`/referentiel/annees/${anneeId}/sessions`, donnees);
  return data.data.session;
}

export async function changerStatutSession(id, statut) {
  const { data } = await api.patch(`/referentiel/sessions/${id}/statut`, { statut });
  return data.data.session;
}

export async function supprimerSession(id) {
  await api.delete(`/referentiel/sessions/${id}`);
}
