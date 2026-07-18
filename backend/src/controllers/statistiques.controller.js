// ─────────────────────────────────────────────────────────────
// Contrôleur "statistiques" — tableaux de bord.
// ─────────────────────────────────────────────────────────────
import * as statistiquesService from '../services/statistiques.service.js';

/** GET /api/statistiques/etablissement */
export async function etablissement(req, res, next) {
  try {
    const stats = await statistiquesService.statistiquesEtablissement(
      req.utilisateur.etablissement_id
    );
    return res.json({ success: true, data: { statistiques: stats } });
  } catch (err) {
    return next(err);
  }
}
