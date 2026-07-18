// ─────────────────────────────────────────────────────────────
// Modèle "code OTP" — requêtes SQL brutes (driver pg).
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

/**
 * Enregistre un nouveau code OTP.
 * @param {{ utilisateur_id: string, code: string, telephone: string, date_expiration: Date }} data
 * @returns {Promise<object>} le code créé
 */
export async function creerCode({ utilisateur_id, code, telephone, date_expiration }) {
  const { rows } = await query(
    `INSERT INTO codes_otp (utilisateur_id, code, telephone, date_expiration)
     VALUES ($1, $2, $3, $4)
     RETURNING id, utilisateur_id, telephone, date_expiration, date_creation`,
    [utilisateur_id, code, telephone, date_expiration]
  );
  return rows[0];
}

/**
 * Récupère le dernier code OTP valide (non utilisé, non expiré) pour un téléphone/code.
 * @param {string} telephone
 * @param {string} code
 * @returns {Promise<object|null>}
 */
export async function trouverCodeValide(telephone, code) {
  const { rows } = await query(
    `SELECT id, utilisateur_id, code, telephone, utilise, date_expiration
       FROM codes_otp
      WHERE telephone = $1
        AND code = $2
        AND utilise = FALSE
        AND date_expiration > now()
      ORDER BY date_creation DESC
      LIMIT 1`,
    [telephone, code]
  );
  return rows[0] || null;
}

/**
 * Marque un code OTP comme utilisé.
 * @param {string} id
 */
export async function marquerUtilise(id) {
  await query(`UPDATE codes_otp SET utilise = TRUE WHERE id = $1`, [id]);
}

/**
 * Invalide tous les codes OTP encore actifs d'un utilisateur
 * (appelé avant d'en générer un nouveau, pour éviter les codes multiples valides).
 * @param {string} utilisateur_id
 */
export async function invaliderCodesActifs(utilisateur_id) {
  await query(
    `UPDATE codes_otp SET utilise = TRUE
      WHERE utilisateur_id = $1 AND utilise = FALSE`,
    [utilisateur_id]
  );
}
