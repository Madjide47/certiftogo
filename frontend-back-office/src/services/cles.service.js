// ─────────────────────────────────────────────────────────────
// Service "clés de signature" (ERR-006).
// L'API n'expose jamais la clé, seulement son empreinte : on peut
// vérifier qu'on parle de la même sans rien révéler.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

export async function etatCles() {
  const { data } = await api.get('/admin/cles');
  return data.data;
}

/** Enregistre la clé actuellement configurée dans le registre. */
export async function enregistrerCleCourante(ministere_id) {
  const { data } = await api.post('/admin/cles/enregistrer', { ministere_id });
  return data.data;
}

export async function declarerCompromission({ empreinte, motif }) {
  const { data } = await api.post('/admin/cles/compromission', { empreinte, motif });
  return data.data;
}
