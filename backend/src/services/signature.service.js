// ─────────────────────────────────────────────────────────────
// Service "signature" — signature numérique de l'empreinte d'un diplôme.
// Phase 4 : HMAC-SHA256 avec un secret du ministère (placeholder simple et
// vérifiable). À terme, on remplacera par une vraie signature asymétrique
// (clé privée du ministère) sans changer l'interface de ce service.
//
// ⚠️ AUCUN secret par défaut n'est codé en dur : le dépôt étant public, une
// valeur de repli connue permettrait à n'importe qui de forger une signature
// valide. Le secret vient exclusivement de MINISTERE_SIGNING_SECRET.
//   - en production : absent => l'application refuse de démarrer ;
//   - ailleurs      : absent => secret aléatoire éphémère + avertissement.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

const LONGUEUR_MINIMALE = 16;

/** Résout le secret de signature au chargement du module. */
function resoudreSecret() {
  const fourni = process.env.MINISTERE_SIGNING_SECRET;

  if (fourni && fourni.length >= LONGUEUR_MINIMALE) return fourni;

  const production = process.env.NODE_ENV === 'production';
  const probleme = !fourni
    ? 'MINISTERE_SIGNING_SECRET est absent'
    : `MINISTERE_SIGNING_SECRET fait moins de ${LONGUEUR_MINIMALE} caractères`;

  if (production) {
    throw new Error(
      `[signature] ${probleme}. Définissez un secret long et aléatoire ` +
        'avant de démarrer en production.'
    );
  }

  // Hors production : secret éphémère, régénéré à chaque démarrage.
  // Les signatures ne survivent donc pas à un redémarrage — sans impact,
  // `verifier()` n'étant appelé nulle part dans le flux applicatif (la
  // vérification publique repose sur le hash et l'ancrage blockchain).
  logger.warn(
    `[signature] ${probleme} : utilisation d'un secret aléatoire éphémère. ` +
      'À ne jamais faire en production.'
  );
  return crypto.randomBytes(32).toString('hex');
}

const SECRET = resoudreSecret();

/** Signe une empreinte (hex) et renvoie la signature (hex). */
export function signer(hash) {
  return crypto.createHmac('sha256', SECRET).update(hash, 'utf8').digest('hex');
}

/** Vérifie qu'une signature correspond bien à l'empreinte (comparaison constante). */
export function verifier(hash, signature) {
  const attendue = signer(hash);
  const a = Buffer.from(attendue, 'hex');
  const b = Buffer.from(signature || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
