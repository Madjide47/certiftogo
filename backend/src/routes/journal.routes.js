// ─────────────────────────────────────────────────────────────
// Routes "journal d'audit" — /api/journal et /api/corbeille.
//
// Ouvertes à tout compte authentifié : le service restreint ensuite la
// portée selon le rôle. Un établissement ne voit que ses propres actions,
// le ministère et l'administrateur voient tout.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as journalController from '../controllers/journal.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';

export const journalRouter = Router();

journalRouter.use(authJWT);

// Chemins fixes avant les paramétrés.
journalRouter.get('/repartition', journalController.repartition);
journalRouter.get('/export', journalController.exporter);
journalRouter.get('/dossiers/:id', journalController.historiqueDossier);
journalRouter.post('/purger', journalController.purger);
journalRouter.get('/', journalController.consulter);

export const corbeilleRouter = Router();

corbeilleRouter.use(authJWT);
corbeilleRouter.get('/', journalController.listerCorbeille);
corbeilleRouter.post('/:id/restaurer', journalController.restaurer);

export default journalRouter;
