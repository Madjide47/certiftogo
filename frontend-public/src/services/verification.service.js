// ─────────────────────────────────────────────────────────────
// Service de vérification publique (par hash ou référence).
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/**
 * Vérifie un diplôme par sa valeur (empreinte SHA-256 ou référence).
 * @param {string} code
 * @param {string} [methode] - 'hash' | 'qr' | 'pdf'
 * @returns {Promise<object>} résultat public
 */
export async function verifierDiplome(code, methode) {
  const params = methode ? { methode } : {};
  const { data } = await api.get(`/verification/${encodeURIComponent(code)}`, { params });
  return data.data;
}

/**
 * Vérifie plusieurs diplômes en un appel (50 au maximum).
 * L'ordre de la réponse suit celui de la demande.
 * @param {string[]} codes
 * @returns {Promise<{ demandes: number, verifies: number, resultats: object[], synthese: object }>}
 */
export async function verifierLot(codes) {
  const { data } = await api.post('/verification/lot', { codes });
  return data.data;
}
