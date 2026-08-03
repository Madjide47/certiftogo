// ─────────────────────────────────────────────────────────────
// File d'ancrage blockchain — supervision côté ministère.
//
// L'ancrage est asynchrone : certifier un lot de 400 diplômes ne bloque
// pas l'agent, les écritures on-chain partent dans une file traitée par
// un worker. Ces écrans montrent l'état de cette file et permettent de
// relancer ce qui a définitivement échoué.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** État de la file + coût blockchain par établissement. */
export async function etatAncrage() {
  const { data } = await api.get('/ministere/ancrage');
  return data.data;
}

/** Dead letter queue : tâches ayant épuisé leurs tentatives. */
export async function tachesAbandonnees() {
  const { data } = await api.get('/ministere/ancrage/abandonnees');
  return data.data.taches;
}

/** Remet une tâche abandonnée en file, compteur remis à zéro. */
export async function relancerTache(id) {
  const { data } = await api.post(`/ministere/ancrage/${id}/relancer`);
  return data.data.tache;
}

/** Déclenche une tranche du worker à la main (démonstration, rattrapage). */
export async function traiterFile(taille) {
  const { data } = await api.post('/ministere/ancrage/traiter', { taille });
  return data.data;
}
