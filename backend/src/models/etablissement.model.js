// ─────────────────────────────────────────────────────────────
// Modèle "établissement" — requêtes SQL brutes (driver pg), paramétrées.
// Gestion administrative des établissements (module admin système).
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, code, nom, type, ville, email, telephone, adresse, statut, date_creation`;

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

/** Crée un établissement. `client` permet de l'inscrire dans une transaction. */
export async function creer(data, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO etablissements (code, nom, type, ville, email, telephone, adresse)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLONNES}`,
    [
      data.code,
      data.nom,
      data.type,
      data.ville,
      data.email || null,
      data.telephone || null,
      data.adresse || null,
    ]
  );
  return rows[0];
}

/** Vérifie si un code officiel est déjà attribué. */
export async function codeExiste(code, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(`SELECT 1 FROM etablissements WHERE code = $1 LIMIT 1`, [code]);
  return rows.length > 0;
}

/** Change le statut d'un établissement (actif/suspendu/archive). */
export async function definirStatut(id, statut) {
  const { rows } = await query(
    `UPDATE etablissements SET statut = $2 WHERE id = $1 RETURNING ${COLONNES}`,
    [id, statut]
  );
  return rows[0] || null;
}
