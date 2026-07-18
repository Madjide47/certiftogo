// ─────────────────────────────────────────────────────────────
// Service "candidats" côté front — appels à l'API établissement.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Liste les candidats (recherche optionnelle). */
export async function listerCandidats({ recherche = '' } = {}) {
  const { data } = await api.get('/candidats', { params: { recherche } });
  return data.data.candidats;
}

/** Récupère un candidat par id. */
export async function recupererCandidat(id) {
  const { data } = await api.get(`/candidats/${id}`);
  return data.data.candidat;
}

/** Crée un candidat. */
export async function creerCandidat(donnees) {
  const { data } = await api.post('/candidats', donnees);
  return data.data.candidat;
}

/** Met à jour un candidat. */
export async function modifierCandidat(id, donnees) {
  const { data } = await api.put(`/candidats/${id}`, donnees);
  return data.data.candidat;
}

/** Supprime un candidat. */
export async function supprimerCandidat(id) {
  await api.delete(`/candidats/${id}`);
}
