// ─────────────────────────────────────────────────────────────
// Service "ministère" côté front — instruction des dossiers reçus.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Liste les dossiers transmis (filtre statut optionnel). */
export async function listerDossiersRecus({ statut = '' } = {}) {
  const params = statut ? { statut } : {};
  const { data } = await api.get('/ministere/dossiers', { params });
  return data.data.dossiers;
}

/** Récupère un dossier transmis par id. */
export async function recupererDossierRecu(id) {
  const { data } = await api.get(`/ministere/dossiers/${id}`);
  return data.data.dossier;
}

/** Prend un dossier en examen (soumis → en_examen). */
export async function examinerDossier(id) {
  const { data } = await api.post(`/ministere/dossiers/${id}/examiner`);
  return data.data.dossier;
}

/** Valide un dossier (→ valide, prêt à certifier). */
export async function validerDossier(id) {
  const { data } = await api.post(`/ministere/dossiers/${id}/valider`);
  return data.data.dossier;
}

/** Rejette un dossier avec motif. */
export async function rejeterDossier(id, motif) {
  const { data } = await api.post(`/ministere/dossiers/${id}/rejeter`, { motif });
  return data.data.dossier;
}

/** Certifie un dossier validé → crée le diplôme. */
export async function certifierDossier(id) {
  const { data } = await api.post(`/ministere/dossiers/${id}/certifier`);
  return data.data.diplome;
}

/** Liste les diplômes certifiés (filtre statut optionnel). */
export async function listerDiplomes({ statut = '' } = {}) {
  const params = statut ? { statut } : {};
  const { data } = await api.get('/ministere/diplomes', { params });
  return data.data.diplomes;
}

/** Révoque un diplôme avec motif. */
export async function revoquerDiplome(id, motif) {
  const { data } = await api.post(`/ministere/diplomes/${id}/revoquer`, { motif });
  return data.data.diplome;
}

/** Répartition des dossiers transmis par statut. */
export async function statistiquesMinistere() {
  const { data } = await api.get('/ministere/dossiers/statistiques');
  return data.data.statistiques;
}

/** Liste des établissements (lecture seule). */
export async function listerEtablissementsMinistere() {
  const { data } = await api.get('/ministere/etablissements');
  return data.data.etablissements;
}
