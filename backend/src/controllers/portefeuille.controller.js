// ─────────────────────────────────────────────────────────────
// Contrôleur "portefeuille" — module candidat.
// ─────────────────────────────────────────────────────────────
import * as portefeuilleService from '../services/portefeuille.service.js';

/** GET /api/candidat/diplomes */
export async function listerDiplomes(req, res, next) {
  try {
    const diplomes = await portefeuilleService.lister(req.utilisateur.candidat_id);
    return res.json({ success: true, data: { diplomes } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/candidat/statistiques */
export async function statistiques(req, res, next) {
  try {
    const stats = await portefeuilleService.statistiques(req.utilisateur.candidat_id);
    return res.json({ success: true, data: { statistiques: stats } });
  } catch (err) {
    return next(err);
  }
}
