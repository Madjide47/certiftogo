// ─────────────────────────────────────────────────────────────
// Contrôleur "vérification" — endpoint public (sans authentification).
// ─────────────────────────────────────────────────────────────
import * as verificationService from '../services/verification.service.js';

/** POST /api/verification/lot — body : { codes: string[] } */
export async function verifierLot(req, res, next) {
  try {
    const resultat = await verificationService.verifierLot(req.body?.codes, {
      methode: req.body?.methode,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.json({ success: true, data: resultat });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/verification/:code?methode=hash|qr|pdf */
export async function verifier(req, res, next) {
  try {
    const resultat = await verificationService.verifier(req.params.code, {
      methode: req.query.methode,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.json({ success: true, data: resultat });
  } catch (err) {
    return next(err);
  }
}
