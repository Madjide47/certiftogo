// ─────────────────────────────────────────────────────────────
// Service "structure" côté front — facultés et filières de
// l'établissement authentifié.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

export async function listerFacultes({ statut = '' } = {}) {
  const { data } = await api.get('/structure/facultes', { params: statut ? { statut } : {} });
  return data.data.facultes;
}

export async function creerFaculte(donnees) {
  const { data } = await api.post('/structure/facultes', donnees);
  return data.data.faculte;
}

export async function modifierFaculte(id, donnees) {
  const { data } = await api.put(`/structure/facultes/${id}`, donnees);
  return data.data.faculte;
}

export async function supprimerFaculte(id) {
  await api.delete(`/structure/facultes/${id}`);
}

export async function listerFilieres({ faculte_id = '', statut = '' } = {}) {
  const params = {};
  if (faculte_id) params.faculte_id = faculte_id;
  if (statut) params.statut = statut;
  const { data } = await api.get('/structure/filieres', { params });
  return data.data.filieres;
}

export async function creerFiliere(donnees) {
  const { data } = await api.post('/structure/filieres', donnees);
  return data.data.filiere;
}

export async function modifierFiliere(id, donnees) {
  const { data } = await api.put(`/structure/filieres/${id}`, donnees);
  return data.data.filiere;
}

export async function supprimerFiliere(id) {
  await api.delete(`/structure/filieres/${id}`);
}

// ── Agents et organisation interne ─────────────────────────────────

/** Profil du compte : sous-rôle, mode de workflow, permissions effectives. */
export async function monProfil() {
  const { data } = await api.get('/structure/profil');
  return data.data;
}

export async function listerAgents() {
  const { data } = await api.get('/structure/agents');
  return data.data.agents;
}

export async function creerAgent(donnees) {
  const { data } = await api.post('/structure/agents', donnees);
  return data.data.agent;
}

/** Bascule simple ↔ hiérarchique. Réservé à l'agent principal. */
export async function definirModeWorkflow(mode) {
  const { data } = await api.put('/structure/mode-workflow', { mode });
  return data.data.etablissement;
}

/** Départ d'un agent : transfère ses dossiers en cours puis le désactive. */
export async function transfererDossiers({ agent_id, repreneur_id, desactiver = true }) {
  const { data } = await api.post('/agents/transfert', { agent_id, repreneur_id, desactiver });
  return data.data;
}
