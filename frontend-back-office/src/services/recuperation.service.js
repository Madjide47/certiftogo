// ─────────────────────────────────────────────────────────────
// Service "récupération de compte" (ERR-003).
// Le dépôt est public — il n'a donc pas sa place ici. Ce fichier ne
// couvre que l'instruction, réservée aux agents.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

export async function listerRecuperations({ statut = '' } = {}) {
  const { data } = await api.get('/recuperation', {
    params: statut ? { statut } : {},
  });
  return data.data.demandes;
}

/**
 * `utilisateur_id` n'est à fournir que si le rapprochement automatique
 * n'a rien trouvé : sans lui, le serveur refuse la validation.
 */
export async function validerRecuperation(id, { utilisateur_id } = {}) {
  const { data } = await api.post(`/recuperation/${id}/valider`, { utilisateur_id });
  return data.data;
}

export async function refuserRecuperation(id, motif) {
  const { data } = await api.post(`/recuperation/${id}/refuser`, { motif });
  return data.data;
}
