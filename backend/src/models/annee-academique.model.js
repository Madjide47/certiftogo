// ─────────────────────────────────────────────────────────────
// Modèle "année académique" — référentiel national piloté par le ministère.
// Requêtes SQL brutes paramétrées (driver pg).
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, libelle, date_debut, date_fin, statut, date_creation`;

/** Liste les années, de la plus récente à la plus ancienne. */
export async function lister({ statut = null } = {}) {
  const params = [];
  let filtre = '';
  if (statut) {
    params.push(statut);
    filtre = `WHERE statut = $1`;
  }
  const { rows } = await query(
    `SELECT ${COLONNES} FROM annees_academiques ${filtre} ORDER BY libelle DESC`,
    params
  );
  return rows;
}

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM annees_academiques WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function trouverParLibelle(libelle) {
  const { rows } = await query(`SELECT ${COLONNES} FROM annees_academiques WHERE libelle = $1`, [
    libelle,
  ]);
  return rows[0] || null;
}

export async function creer({ libelle, date_debut, date_fin, statut }) {
  const { rows } = await query(
    `INSERT INTO annees_academiques (libelle, date_debut, date_fin, statut)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLONNES}`,
    [libelle, date_debut, date_fin, statut]
  );
  return rows[0];
}

export async function changerStatut(id, statut) {
  const { rows } = await query(
    `UPDATE annees_academiques SET statut = $2 WHERE id = $1 RETURNING ${COLONNES}`,
    [id, statut]
  );
  return rows[0] || null;
}

/** Nombre de promotions rattachées — sert à refuser une suppression. */
export async function compterPromotions(id) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM promotions WHERE annee_id = $1`,
    [id]
  );
  return rows[0].total;
}

export async function supprimer(id) {
  const { rowCount } = await query(`DELETE FROM annees_academiques WHERE id = $1`, [id]);
  return rowCount > 0;
}
