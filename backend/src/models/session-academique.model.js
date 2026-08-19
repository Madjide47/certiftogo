// ─────────────────────────────────────────────────────────────
// Modèle "session académique" — normale, rattrapage ou exceptionnelle,
// rattachée à une année académique.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, annee_id, type, libelle, date_debut, date_fin, statut, date_creation`;

export async function listerParAnnee(annee_id) {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM sessions_academiques
      WHERE annee_id = $1
      ORDER BY date_debut NULLS LAST, type`,
    [annee_id]
  );
  return rows;
}

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM sessions_academiques WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function creer({ annee_id, type, libelle, date_debut, date_fin, statut }) {
  const { rows } = await query(
    `INSERT INTO sessions_academiques (annee_id, type, libelle, date_debut, date_fin, statut)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLONNES}`,
    [annee_id, type, libelle, date_debut, date_fin, statut]
  );
  return rows[0];
}

export async function changerStatut(id, statut) {
  const { rows } = await query(
    `UPDATE sessions_academiques SET statut = $2 WHERE id = $1 RETURNING ${COLONNES}`,
    [id, statut]
  );
  return rows[0] || null;
}

/** Nombre de promotions présentées au titre de cette session. */
export async function compterPromotions(id) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM promotions WHERE session_id = $1`,
    [id]
  );
  return rows[0].total;
}

export async function supprimer(id) {
  const { rowCount } = await query(`DELETE FROM sessions_academiques WHERE id = $1`, [id]);
  return rowCount > 0;
}
