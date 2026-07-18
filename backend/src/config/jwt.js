// ─────────────────────────────────────────────────────────────
// Configuration et helpers JWT.
// Le token porte l'identité et le rôle de l'utilisateur connecté.
// ─────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_a_changer';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Génère un JWT signé pour un utilisateur.
 * @param {{ utilisateur_id: string, role: string, etablissement_id?: string|null,
 *           ministere_id?: string|null, candidat_id?: string|null }} payload
 * @returns {string} token signé
 */
export function genererToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Vérifie et décode un JWT. Lève une erreur si invalide/expiré.
 * @param {string} token
 * @returns {object} payload décodé
 */
export function verifierToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
