// ─────────────────────────────────────────────────────────────
// Service d'envoi WhatsApp / SMS — VERSION MOCK (Phase 1).
//
// Pour l'instant, on n'appelle PAS la vraie API WhatsApp Business.
// Le code OTP est simplement AFFICHÉ DANS LA CONSOLE du serveur.
// On branchera l'API réelle dans une phase ultérieure.
// ─────────────────────────────────────────────────────────────
import { logger } from '../utils/logger.js';

/**
 * Simule l'envoi d'un code OTP par WhatsApp/SMS.
 * @param {string} telephone - destinataire
 * @param {string} code - code OTP à 6 chiffres
 * @returns {Promise<{ success: true }>}
 */
export async function envoyerCodeOtp(telephone, code) {
  // eslint-disable-next-line no-console
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║          CertifTOGO — OTP (MOCK)             ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Destinataire : ${telephone.padEnd(28)} ║`);
  console.log(`║  Code OTP     : ${code.padEnd(28)} ║`);
  console.log('║  (mock WhatsApp — expiration 5 min)          ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  logger.info(`OTP mock envoyé à ${telephone}`);
  return { success: true };
}
