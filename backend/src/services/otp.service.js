// ─────────────────────────────────────────────────────────────
// Service OTP — génération et durée de validité des codes.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

const OTP_LENGTH = Number(process.env.OTP_LENGTH) || 6;
const OTP_EXPIRATION_MINUTES = Number(process.env.OTP_EXPIRATION_MINUTES) || 5;

/**
 * Génère un code OTP numérique cryptographiquement aléatoire.
 * @returns {string} code de OTP_LENGTH chiffres (ex : "042317")
 */
export function genererCodeOtp() {
  const max = 10 ** OTP_LENGTH;
  const code = crypto.randomInt(0, max);
  return String(code).padStart(OTP_LENGTH, '0');
}

/**
 * Calcule la date d'expiration d'un code à partir de maintenant.
 * @returns {Date}
 */
export function calculerExpiration() {
  return new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);
}

export { OTP_EXPIRATION_MINUTES };
