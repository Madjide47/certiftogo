// ─────────────────────────────────────────────────────────────
// Service "pièces justificatives".
//
// Le contenu d'une pièce n'est pas une URL publique : il passe par l'API
// authentifiée. On ne peut donc pas pointer un <a href> ni un <img src>
// dessus — il faut récupérer le flux, puis en faire une URL locale.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

export async function catalogueTypes() {
  const { data } = await api.get('/pieces/types');
  return data.data;
}

export async function listerPourCandidat(candidatId) {
  const { data } = await api.get(`/candidats/${candidatId}/pieces`);
  return data.data.pieces;
}

export async function listerPourPromotion(promotionId) {
  const { data } = await api.get(`/promotions/${promotionId}/pieces`);
  return data.data.pieces;
}

function corps({ fichier, type_piece, libelle }) {
  const donnees = new FormData();
  donnees.append('type_piece', type_piece);
  if (libelle) donnees.append('libelle', libelle);
  donnees.append('fichier', fichier);
  return donnees;
}

export async function deposerPourCandidat(candidatId, contenu) {
  const { data } = await api.post(`/candidats/${candidatId}/pieces`, corps(contenu));
  return data.data.piece;
}

export async function deposerPourPromotion(promotionId, contenu) {
  const { data } = await api.post(`/promotions/${promotionId}/pieces`, corps(contenu));
  return data.data.piece;
}

export async function supprimerPiece(id) {
  await api.delete(`/pieces/${id}`);
}

/**
 * Ouvre la pièce dans un nouvel onglet.
 *
 * L'onglet est ouvert AVANT l'appel réseau : ouvert après, le navigateur
 * le bloquerait comme popup, l'agent croirait la pièce illisible.
 */
export async function ouvrirPiece(id) {
  const onglet = window.open('', '_blank');
  try {
    const { data } = await api.get(`/pieces/${id}/contenu`, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    if (onglet) onglet.location = url;
    else window.open(url, '_blank');
    // Laisser le temps au navigateur de charger avant de libérer l'URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    onglet?.close();
    // Le blob doit être relu pour retrouver le message d'erreur JSON.
    if (err.response?.data instanceof Blob) {
      try {
        const texte = await err.response.data.text();
        err.response.data = JSON.parse(texte);
      } catch {
        /* réponse non lisible : le message générique fera l'affaire */
      }
    }
    throw err;
  }
}

// ── Ministère ──────────────────────────────────────────────────────

export async function piecesDuLot(lotId) {
  const { data } = await api.get(`/ministere/lots/${lotId}/pieces`);
  return data.data;
}

export async function deciderPiece(id, { statut, motif } = {}) {
  const { data } = await api.post(`/ministere/pieces/${id}/decision`, { statut, motif });
  return data.data.piece;
}
