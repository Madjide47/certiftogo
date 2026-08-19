// ─────────────────────────────────────────────────────────────
// Service "notifications" côté front — centre de réception et
// préférences.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

export async function listerNotifications({ non_lues = false } = {}) {
  const { data } = await api.get('/notifications', {
    params: non_lues ? { non_lues: 'true' } : {},
  });
  return data.data;
}

/** Compteur du bandeau. Silencieux : il ne doit jamais casser l'en-tête. */
export async function compterNonLues() {
  const { data } = await api.get('/notifications');
  return data.data.non_lues ?? 0;
}

export async function marquerLue(id) {
  const { data } = await api.patch(`/notifications/${id}/lue`);
  return data.data.notification;
}

export async function toutMarquerLu() {
  const { data } = await api.post('/notifications/tout-lu');
  return data.data.marquees;
}

export async function preferences() {
  const { data } = await api.get('/notifications/preferences');
  return data.data;
}

export async function definirPreference({ evenement, canal, actif }) {
  const { data } = await api.put('/notifications/preferences', { evenement, canal, actif });
  return data.data.preference;
}
