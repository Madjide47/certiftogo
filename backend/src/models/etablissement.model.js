// ─────────────────────────────────────────────────────────────
// Modèle "établissement" — requêtes SQL brutes (driver pg), paramétrées.
// Gestion administrative des établissements (module admin système).
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, nom, type, ville, email, telephone, adresse, statut, date_creation`;

/** Liste tous les établissements. */
export async function lister() {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM etablissements ORDER BY nom ASC`
  );
  return rows;
}

/** Récupère un établissement par id. */
export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM etablissements WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** Crée un établissement. */
export async function creer(data) {
  const { rows } = await query(
    `INSERT INTO etablissements (nom, type, ville, email, telephone, adresse)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLONNES}`,
    [data.nom, data.type, data.ville, data.email || null, data.telephone || null, data.adresse || null]
  );
  return rows[0];
}

/** Change le statut d'un établissement (actif/suspendu/archive). */
export async function definirStatut(id, statut) {
  const { rows } = await query(
    `UPDATE etablissements SET statut = $2 WHERE id = $1 RETURNING ${COLONNES}`,
    [id, statut]
  );
  return rows[0] || null;
}
