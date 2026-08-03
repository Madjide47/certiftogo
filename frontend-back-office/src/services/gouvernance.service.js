// ─────────────────────────────────────────────────────────────
// Gouvernance des établissements — agrément, habilitations, demandes
// d'intégration, et contrôle à quatre yeux.
//
// C'est le ministère qui agrée : l'administrateur système exploite la
// plateforme, il ne décide jamais qui peut délivrer un diplôme.
// ─────────────────────────────────────────────────────────────
import api from './api.js';
import { indexerParStatut } from './lot.service.js';

// ── Demandes d'intégration ─────────────────────────────────────────

/** Renvoie { demandes, repartition } — répartition indexée par statut. */
export async function listerDemandes({ statut = '' } = {}) {
  const { data } = await api.get('/ministere/demandes', {
    params: statut ? { statut } : {},
  });
  return { ...data.data, repartition: indexerParStatut(data.data.repartition) };
}

export async function examinerDemande(id) {
  const { data } = await api.post(`/ministere/demandes/${id}/examiner`);
  return data.data.demande;
}

/** Accepte la demande : crée l'établissement et son agent principal. */
export async function accepterDemande(id, donnees = {}) {
  const { data } = await api.post(`/ministere/demandes/${id}/accepter`, donnees);
  return data.data;
}

export async function refuserDemande(id, motif) {
  const { data } = await api.post(`/ministere/demandes/${id}/refuser`, { motif });
  return data.data.demande;
}

// ── Agrément et habilitations ──────────────────────────────────────

export async function creerEtablissement(donnees) {
  const { data } = await api.post('/ministere/etablissements', donnees);
  return data.data;
}

/** Diplômes qu'un établissement est autorisé à délivrer. */
export async function listerHabilitations(etablissementId) {
  const { data } = await api.get(`/ministere/etablissements/${etablissementId}/habilitations`);
  return data.data.habilitations;
}

export async function accorderHabilitation(etablissementId, donnees) {
  const { data } = await api.post(
    `/ministere/etablissements/${etablissementId}/habilitations`,
    donnees
  );
  return data.data.habilitation;
}

export async function changerStatutHabilitation(id, statut, motif) {
  const { data } = await api.patch(`/ministere/habilitations/${id}/statut`, { statut, motif });
  return data.data.habilitation;
}

// ── Contrôle à quatre yeux ─────────────────────────────────────────

/** Renvoie { validations, active }. `active` dit si le contrôle est exigé. */
export async function listerValidations({ statut = 'en_attente' } = {}) {
  const { data } = await api.get('/ministere/validations', { params: { statut } });
  return data.data;
}

export async function approuverValidation(id) {
  const { data } = await api.post(`/ministere/validations/${id}/approuver`);
  return data.data;
}

export async function refuserValidation(id, motif) {
  const { data } = await api.post(`/ministere/validations/${id}/refuser`, { motif });
  return data.data.validation;
}
