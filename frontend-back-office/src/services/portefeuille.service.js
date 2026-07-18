// ─────────────────────────────────────────────────────────────
// Service "portefeuille" côté front — diplômes du candidat connecté.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Liste les diplômes du candidat. */
export async function listerMesDiplomes() {
  const { data } = await api.get('/candidat/diplomes');
  return data.data.diplomes;
}

/** Statistiques du portefeuille (répartition par statut). */
export async function statistiquesPortefeuille() {
  const { data } = await api.get('/candidat/statistiques');
  return data.data.statistiques;
}
