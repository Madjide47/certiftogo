// ─────────────────────────────────────────────────────────────
// Modèle "session" — accès révocables et appareils connectés.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, utilisateur_id, adresse_ip, user_agent, date_creation,
                  derniere_activite, date_expiration, date_revocation,
                  revoquee_par, motif_revocation`;

export async function creer({ utilisateur_id, jeton_hash, adresse_ip, user_agent, date_expiration }) {
  const { rows } = await query(
    `INSERT INTO sessions (utilisateur_id, jeton_hash, adresse_ip, user_agent, date_expiration)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLONNES}`,
    [utilisateur_id, jeton_hash, adresse_ip || null, user_agent || null, date_expiration]
  );
  return rows[0];
}

/** Session active correspondant à un jeton de rafraîchissement. */
export async function trouverParJeton(jeton_hash) {
  const { rows } = await query(
    `SELECT ${COLONNES}, utilisateur_id FROM sessions
      WHERE jeton_hash = $1
        AND date_revocation IS NULL
        AND date_expiration > now()`,
    [jeton_hash]
  );
  return rows[0] || null;
}

/**
 * Vérifie qu'une session est toujours valable.
 * Appelé à chaque requête authentifiée : c'est le prix d'une révocation
 * réellement immédiate, plutôt qu'un jeton valable 24 h quoi qu'il arrive.
 */
export async function estActive(id) {
  const { rows } = await query(
    `SELECT 1 FROM sessions
      WHERE id = $1 AND date_revocation IS NULL AND date_expiration > now()`,
    [id]
  );
  return rows.length > 0;
}

export async function toucher(id) {
  await query(`UPDATE sessions SET derniere_activite = now() WHERE id = $1`, [id]);
}

export async function listerActives(utilisateur_id) {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM sessions
      WHERE utilisateur_id = $1 AND date_revocation IS NULL AND date_expiration > now()
      ORDER BY derniere_activite DESC`,
    [utilisateur_id]
  );
  return rows;
}

export async function revoquer(id, { par = null, motif = 'deconnexion' } = {}) {
  const { rows } = await query(
    `UPDATE sessions
        SET date_revocation = now(), revoquee_par = $2, motif_revocation = $3
      WHERE id = $1 AND date_revocation IS NULL
      RETURNING ${COLONNES}`,
    [id, par, motif]
  );
  return rows[0] || null;
}

/** Ferme toutes les sessions d'un compte — désactivation, vol d'appareil. */
export async function revoquerToutes(utilisateur_id, { par = null, motif = 'revocation_globale', sauf = null } = {}) {
  const { rowCount } = await query(
    `UPDATE sessions
        SET date_revocation = now(), revoquee_par = $2, motif_revocation = $3
      WHERE utilisateur_id = $1
        AND date_revocation IS NULL
        AND ($4::uuid IS NULL OR id <> $4)`,
    [utilisateur_id, par, motif, sauf]
  );
  return rowCount;
}

/** Purge des sessions expirées depuis longtemps. */
export async function purger(jours = 30) {
  const { rowCount } = await query(
    `DELETE FROM sessions WHERE date_expiration < now() - ($1 || ' days')::interval`,
    [String(jours)]
  );
  return rowCount;
}
