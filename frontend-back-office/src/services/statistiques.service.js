// ─────────────────────────────────────────────────────────────
// Service "statistiques" côté front.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Statistiques du tableau de bord établissement. */
export async function statistiquesEtablissement() {
  const { data } = await api.get('/statistiques/etablissement');
  return data.data.statistiques;
}
