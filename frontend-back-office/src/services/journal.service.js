// ─────────────────────────────────────────────────────────────
// Service "journal d'audit", historique et corbeille.
// La portée est décidée côté serveur selon le rôle : un établissement
// n'obtient que ses propres actions.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

export async function consulterJournal(filtres = {}) {
  const params = Object.fromEntries(Object.entries(filtres).filter(([, v]) => v));
  const { data } = await api.get('/journal', { params });
  return data.data;
}

export async function repartitionActions() {
  const { data } = await api.get('/journal/repartition');
  return data.data.repartitions;
}

/** Chronologie complète d'un dossier — la pièce à produire en cas de litige. */
export async function historiqueDossier(id) {
  const { data } = await api.get(`/journal/dossiers/${id}`);
  return data.data.historique;
}

/** URL d'export CSV, à ouvrir directement (le jeton passe par l'intercepteur). */
export async function exporterJournal(filtres = {}) {
  const params = Object.fromEntries(Object.entries(filtres).filter(([, v]) => v));
  const { data } = await api.get('/journal/export', { params, responseType: 'blob' });
  return data;
}

// ── Corbeille ──────────────────────────────────────────────────────

export async function listerCorbeille({ table_source = '' } = {}) {
  const { data } = await api.get('/corbeille', {
    params: table_source ? { table_source } : {},
  });
  return data.data.elements;
}

export async function restaurer(id) {
  const { data } = await api.post(`/corbeille/${id}/restaurer`);
  return data.data.restaure;
}
