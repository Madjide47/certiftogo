// ─────────────────────────────────────────────────────────────
// Modèle "faculté" — subdivision d'un établissement.
// Toutes les opérations sont scopées à un établissement.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, etablissement_id, nom, code, statut, date_creation`;

export async function lister({ etablissement_id, statut = null }) {
  const params = [etablissement_id];
  let filtre = '';
  if (statut) {
    params.push(statut);
    filtre = `AND statut = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT ${COLONNES} FROM facultes
      WHERE etablissement_id = $1 ${filtre}
      ORDER BY nom`,
    params
  );
  return rows;
}

/** Récupère une faculté sans filtre : l'appelant vérifie l'appartenance. */
export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM facultes WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function creer({ etablissement_id, nom, code, statut }) {
  const { rows } = await query(
    `INSERT INTO facultes (etablissement_id, nom, code, statut)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLONNES}`,
    [etablissement_id, nom, code, statut]
  );
  return rows[0];
}

export async function modifier(id, { nom, code, statut }) {
  const { rows } = await query(
    `UPDATE facultes SET nom = $2, code = $3, statut = $4
      WHERE id = $1
      RETURNING ${COLONNES}`,
    [id, nom, code, statut]
  );
  return rows[0] || null;
}

/** Nombre de filières rattachées — sert à refuser une suppression. */
export async function compterFilieres(id) {
  const { rows } = await query(`SELECT COUNT(*)::int AS total FROM filieres WHERE faculte_id = $1`, [
    id,
  ]);
  return rows[0].total;
}

export async function supprimer(id) {
  const { rowCount } = await query(`DELETE FROM facultes WHERE id = $1`, [id]);
  return rowCount > 0;
}
