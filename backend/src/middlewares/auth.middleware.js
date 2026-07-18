// ─────────────────────────────────────────────────────────────
// Middleware d'authentification JWT.
// Extrait le token du header "Authorization: Bearer <token>",
// le vérifie, et attache le payload à req.utilisateur.
// ─────────────────────────────────────────────────────────────
import { verifierToken } from '../config/jwt.js';

export function authJWT(req, res, next) {
  const header = req.headers.authorization || '';
  const [schema, token] = header.split(' ');

  if (schema !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_MANQUANT', message: 'Authentification requise.' },
    });
  }

  try {
    // payload : { utilisateur_id, role, etablissement_id, ministere_id, candidat_id }
    req.utilisateur = verifierToken(token);
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_INVALIDE', message: 'Session invalide ou expirée.' },
    });
  }
}

export default authJWT;
