// ─────────────────────────────────────────────────────────────
// Service "signature" — signature numérique de l'empreinte d'un diplôme.
// Phase 4 : HMAC-SHA256 avec un secret du ministère (placeholder simple et
// vérifiable). À terme, on remplacera par une vraie signature asymétrique
// (clé privée du ministère) sans changer l'interface de ce service.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

const SECRET =
  process.env.MINISTERE_SIGNING_SECRET || 'certiftogo_ministere_dev_secret';

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
