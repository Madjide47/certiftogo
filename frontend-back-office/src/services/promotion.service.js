// ─────────────────────────────────────────────────────────────
// Service "promotions" côté front — cohortes, inscriptions et résultats.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

export async function listerPromotions({ annee_id = '', filiere_id = '', statut = '' } = {}) {
  const params = {};
  if (annee_id) params.annee_id = annee_id;
  if (filiere_id) params.filiere_id = filiere_id;
  if (statut) params.statut = statut;
  const { data } = await api.get('/promotions', { params });
  return data.data.promotions;
}

export async function creerPromotion(donnees) {
  const { data } = await api.post('/promotions', donnees);
  return data.data.promotion;
}

export async function modifierPromotion(id, donnees) {
  const { data } = await api.put(`/promotions/${id}`, donnees);
  return data.data.promotion;
}

export async function changerStatutPromotion(id, statut) {
  const { data } = await api.patch(`/promotions/${id}/statut`, { statut });
  return data.data.promotion;
}

export async function supprimerPromotion(id) {
  await api.delete(`/promotions/${id}`);
}

/** Étudiants inscrits dans une promotion. */
export async function listerInscriptions(promotionId) {
  const { data } = await api.get(`/promotions/${promotionId}/inscriptions`);
  return data.data.inscriptions;
}

export async function inscrireEtudiant(promotionId, candidat_id) {
  const { data } = await api.post(`/promotions/${promotionId}/inscriptions`, { candidat_id });
  return data.data.inscription;
}

export async function enregistrerResultat(promotionId, inscriptionId, donnees) {
  const { data } = await api.put(
    `/promotions/${promotionId}/inscriptions/${inscriptionId}`,
    donnees
  );
  return data.data.inscription;
}

export async function desinscrireEtudiant(promotionId, inscriptionId) {
  await api.delete(`/promotions/${promotionId}/inscriptions/${inscriptionId}`);
}

/** Parcours pluriannuel d'un étudiant. */
export async function parcoursEtudiant(candidatId) {
  const { data } = await api.get(`/promotions/parcours/${candidatId}`);
  return data.data.parcours;
}
