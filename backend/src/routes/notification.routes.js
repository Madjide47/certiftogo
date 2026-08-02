// ─────────────────────────────────────────────────────────────
// Routes "notifications" — /api/notifications.
// Centre de réception in-app et préférences, pour tout compte authentifié.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as notificationService from '../services/notification.service.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();
router.use(authJWT);

const repondre = (handler) => async (req, res, next) => {
  try {
    return res.json({ success: true, data: await handler(req) });
  } catch (err) {
    return next(err);
  }
};

// Chemins fixes avant les paramétrés.
router.get('/preferences', repondre((req) => notificationService.preferences(req.utilisateur)));
router.put(
  '/preferences',
  repondre(async (req) => ({
    preference: await notificationService.definirPreference(req.utilisateur, req.body || {}),
  }))
);

router.post(
  '/tout-lu',
  repondre(async (req) => ({ marquees: await notificationService.toutMarquerLu(req.utilisateur) }))
);

// Supervision de la file d'expédition : administrateur uniquement.
router.get(
  '/supervision',
  requireRole('admin_systeme'),
  repondre(async () => ({ repartition: await notificationService.repartition() }))
);
router.post(
  '/expedier',
  requireRole('admin_systeme'),
  repondre((req) => notificationService.expedierEnAttente((req.body || {}).taille))
);

router.get('/', repondre((req) => notificationService.boiteDeReception(req.utilisateur, req.query)));
router.patch(
  '/:id/lue',
  repondre(async (req) => ({
    notification: await notificationService.marquerLue(req.utilisateur, req.params.id),
  }))
);

export default router;
