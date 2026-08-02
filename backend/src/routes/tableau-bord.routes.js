// ─────────────────────────────────────────────────────────────
// Routes "tableau de bord" — /api/tableau-bord.
// Un seul chemin : le service sert la vue du rôle appelant.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as tableauBord from '../services/tableau-bord.service.js';
import { authJWT } from '../middlewares/auth.middleware.js';

const router = Router();
router.use(authJWT);

router.get('/export', async (req, res, next) => {
  try {
    const csv = await tableauBord.exporter(req.utilisateur, req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tableau-bord.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const tableau = await tableauBord.pour(req.utilisateur, req.query);
    return res.json({ success: true, data: { tableau } });
  } catch (err) {
    return next(err);
  }
});

export default router;
