// ─────────────────────────────────────────────────────────────
// Middleware d'authentification JWT.
// Extrait le token du header "Authorization: Bearer <token>",
// le vérifie, et attache le payload à req.utilisateur.
// ─────────────────────────────────────────────────────────────
import { verifierToken } from '../config/jwt.js';
import * as sessionModel from '../models/session.model.js';

export async function authJWT(req, res, next) {
  const header = req.headers.authorization || '';
  const [schema, token] = header.split(' ');

  if (schema !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_MANQUANT', message: 'Authentification requise.' },
    });
  }

  let charge;
  try {
    // payload : { session_id, utilisateur_id, role, etablissement_id, ministere_id, personne_id }
    charge = verifierToken(token);
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_INVALIDE', message: 'Session invalide ou expirée.' },
    });
  }

  // Un jeton signé ne suffit pas : sa session doit être encore ouverte.
  // C'est le prix d'une révocation réellement immédiate — sans cette
  // vérification, désactiver un compte laisserait ses accès vivre
  // jusqu'à l'expiration du jeton.
  if (charge.session_id) {
    try {
      if (!(await sessionModel.estActive(charge.session_id))) {
        return res.status(401).json({
          success: false,
          error: { code: 'SESSION_REVOQUEE', message: 'Session close. Reconnectez-vous.' },
        });
      }
    } catch (err) {
      return next(err);
    }
  }

  req.utilisateur = charge;
  return next();
}

export default authJWT;
