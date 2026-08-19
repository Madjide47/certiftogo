// ─────────────────────────────────────────────────────────────
// Service "lots de transmission" côté front.
// Côté établissement : suivi de ce qui a été envoyé.
// Côté ministère : file d'instruction.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Transmet une promotion entière — crée le lot et les dossiers. */
export async function transmettrePromotion(promotionId, { date_deliberation }) {
  const { data } = await api.post(`/promotions/${promotionId}/transmettre`, { date_deliberation });
  return data.data;
}

/**
 * État de préparation d'une promotion : effectif, exclus, numéros et
 * pièces manquantes. Lecture seule — le serveur revérifie tout.
 */
export async function preparerTransmission(promotionId) {
  const { data } = await api.get(`/promotions/${promotionId}/transmission`);
  return data.data;
}

/** Lots émis par mon établissement. */
export async function mesLots({ statut = '' } = {}) {
  const { data } = await api.get('/lots', { params: statut ? { statut } : {} });
  return data.data.lots;
}

export async function monLot(id) {
  const { data } = await api.get(`/lots/${id}`);
  return data.data;
}

// ── Ministère ──────────────────────────────────────────────────────

/**
 * L'API renvoie la répartition telle que PostgreSQL la produit — un
 * tableau `[{ statut, total }]`. Les écrans veulent un accès par statut ;
 * la conversion se fait ici une fois, plutôt que dans chaque page.
 */
export function indexerParStatut(lignes) {
  if (!Array.isArray(lignes)) return lignes || {};
  return Object.fromEntries(lignes.map((l) => [l.statut, l.total]));
}

export async function fileDesLots({ statut = '' } = {}) {
  const { data } = await api.get('/ministere/lots', { params: statut ? { statut } : {} });
  return { ...data.data, repartition: indexerParStatut(data.data.repartition) };
}

/** Lot, dossiers et rapport des contrôles automatiques. */
export async function detaillerLot(id) {
  const { data } = await api.get(`/ministere/lots/${id}`);
  return data.data;
}

export async function examinerLot(id) {
  const { data } = await api.post(`/ministere/lots/${id}/examiner`);
  return data.data;
}

/** Valide le lot ; `dossiers_rejetes` permet le rejet partiel. */
export async function validerLot(id, { dossiers_rejetes = [] } = {}) {
  const { data } = await api.post(`/ministere/lots/${id}/valider`, { dossiers_rejetes });
  return data.data;
}

/**
 * Statue sur une TRANCHE de dossiers : ce qui n'est pas désigné reste
 * en attente. C'est ce qui permet de reprendre l'instruction plus tard
 * au lieu de devoir tout traiter d'une séance.
 */
export async function traiterDossiers(id, { dossiers_valides = [], dossiers_rejetes = [] } = {}) {
  const { data } = await api.post(`/ministere/lots/${id}/traiter`, {
    dossiers_valides,
    dossiers_rejetes,
  });
  return data.data;
}

/** Fiche complète du titulaire d'un dossier reçu (ministère). */
export async function ficheDuDossier(dossierId) {
  const { data } = await api.get(`/ministere/dossiers/${dossierId}/fiche`);
  return data.data;
}

/** Les urgences en attente, tous lots confondus. */
export async function dossiersUrgents() {
  const { data } = await api.get('/ministere/dossiers/urgents');
  return data.data.dossiers;
}

/** Déclare ou lève l'urgence d'un dossier reçu (ministère). */
export async function prioriserDossierMinistere(id, declaration) {
  const { data } = await api.patch(`/ministere/dossiers/${id}/priorite`, declaration);
  return data.data.dossier;
}

/** Déclare ou lève l'urgence d'un dossier transmis (établissement). */
export async function prioriserDossier(id, declaration) {
  const { data } = await api.patch(`/dossiers/${id}/priorite`, declaration);
  return data.data.dossier;
}

/** Urgence déclarée sur un étudiant avant que la promotion ne parte. */
export async function prioriserInscription(promotionId, inscriptionId, declaration) {
  const { data } = await api.patch(
    `/promotions/${promotionId}/inscriptions/${inscriptionId}/priorite`,
    declaration
  );
  return data.data.inscription;
}

export async function rejeterLot(id, motif) {
  const { data } = await api.post(`/ministere/lots/${id}/rejeter`, { motif });
  return data.data.lot;
}

export async function certifierLot(id) {
  const { data } = await api.post(`/ministere/lots/${id}/certifier`);
  return data.data;
}

export async function progressionAncrage(id) {
  const { data } = await api.get(`/ministere/lots/${id}/ancrage`);
  return data.data.progression;
}
