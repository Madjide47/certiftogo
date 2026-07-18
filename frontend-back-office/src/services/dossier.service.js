// ─────────────────────────────────────────────────────────────
// Service "dossiers" côté front — appels à l'API établissement.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Liste les dossiers (filtre statut optionnel). */
export async function listerDossiers({ statut = '' } = {}) {
  const params = statut ? { statut } : {};
  const { data } = await api.get('/dossiers', { params });
  return data.data.dossiers;
}

/** Récupère un dossier par id. */
export async function recupererDossier(id) {
  const { data } = await api.get(`/dossiers/${id}`);
  return data.data.dossier;
}

/** Crée un dossier (brouillon). */
export async function creerDossier(donnees) {
  const { data } = await api.post('/dossiers', donnees);
  return data.data.dossier;
}

/** Met à jour un dossier. */
export async function modifierDossier(id, donnees) {
  const { data } = await api.put(`/dossiers/${id}`, donnees);
  return data.data.dossier;
}

/** Transmet un dossier au ministère. */
export async function transmettreDossier(id) {
  const { data } = await api.post(`/dossiers/${id}/transmettre`);
  return data.data.dossier;
}

/** Supprime un dossier (brouillon). */
export async function supprimerDossier(id) {
  await api.delete(`/dossiers/${id}`);
}
