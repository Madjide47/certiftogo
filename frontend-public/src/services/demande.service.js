// ─────────────────────────────────────────────────────────────
// Demande d'intégration — constitution, dépôt et suivi, sans compte.
//
// L'établissement qui demande à rejoindre la plateforme n'y a par
// définition aucun accès : ces appels sont anonymes. Son autorisation
// tient au JETON rendu à l'ouverture du dossier — la référence seule se
// devine, elle ne peut pas tenir lieu de secret.
//
// Le jeton vit dans `sessionStorage` : un rafraîchissement de page ne
// doit pas faire perdre un dossier à demi constitué, mais il n'a rien à
// faire dans un stockage persistant.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

const CLE = 'certiftogo.demande';

export function memoriser(dossier) {
  sessionStorage.setItem(CLE, JSON.stringify(dossier));
}

export function dossierEnCours() {
  try {
    return JSON.parse(sessionStorage.getItem(CLE) || 'null');
  } catch {
    return null;
  }
}

export function oublier() {
  sessionStorage.removeItem(CLE);
}

const entete = (jeton) => ({ headers: { 'X-Jeton-Depot': jeton } });

export async function typesDiplome() {
  const { data } = await api.get('/demandes-integration/types-diplome');
  return data.data.types_diplome;
}

export async function cataloguePieces() {
  const { data } = await api.get('/demandes-integration/pieces/catalogue');
  return data.data;
}

/** Ouvre le dossier. Retourne { reference, jeton_depot, statut, message }. */
export async function ouvrirDossier(donnees) {
  const { data } = await api.post('/demandes-integration', { ...donnees, avec_pieces: true });
  return data.data;
}

export async function listerPieces(reference, jeton) {
  const { data } = await api.get(`/demandes-integration/${reference}/pieces`, entete(jeton));
  return data.data;
}

export async function deposerPiece(reference, jeton, { type_piece, libelle, fichier }) {
  const corps = new FormData();
  corps.append('type_piece', type_piece);
  if (libelle) corps.append('libelle', libelle);
  corps.append('fichier', fichier);
  const { data } = await api.post(`/demandes-integration/${reference}/pieces`, corps, entete(jeton));
  return data.data;
}

export async function retirerPiece(reference, jeton, id) {
  const { data } = await api.delete(
    `/demandes-integration/${reference}/pieces/${id}`,
    entete(jeton)
  );
  return data.data;
}

export async function transmettreDossier(reference, jeton) {
  const { data } = await api.post(
    `/demandes-integration/${reference}/transmettre`,
    {},
    entete(jeton)
  );
  return data.data;
}

export async function suivreDemande(reference) {
  const { data } = await api.get(`/demandes-integration/${encodeURIComponent(reference)}`);
  return data.data.demande;
}
