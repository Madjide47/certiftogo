// ─────────────────────────────────────────────────────────────
// Middleware de contrôle de rôle.
// À utiliser APRÈS authJWT. Ex : requireRole('ministere')
//                                requireRole('ministere', 'admin_systeme')
// ─────────────────────────────────────────────────────────────

/**
 * @param {...string} rolesAutorises
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...rolesAutorises) {
  return (req, res, next) => {
    const role = req.utilisateur?.role;

    if (!role) {
      return res.status(401).json({
        success: false,
        error: { code: 'NON_AUTHENTIFIE', message: 'Authentification requise.' },
      });
    }

    if (!rolesAutorises.includes(role)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCES_REFUSE', message: 'Vous n\'avez pas les droits nécessaires.' },
      });
    }

    return next();
  };
}

export default requireRole;
