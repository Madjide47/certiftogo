// ─────────────────────────────────────────────────────────────
// Service "tableau de bord" — un seul chemin, le serveur sert la vue
// correspondant au rôle appelant.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

export async function tableauDeBord({ jours } = {}) {
  const { data } = await api.get('/tableau-bord', { params: jours ? { jours } : {} });
  return data.data.tableau;
}

export async function exporterTableauDeBord({ jours } = {}) {
  const { data } = await api.get('/tableau-bord/export', {
    params: jours ? { jours } : {},
    responseType: 'blob',
  });
  return data;
}
