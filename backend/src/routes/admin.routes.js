// ─────────────────────────────────────────────────────────────
// Routes "admin" — /api/admin (réservées au rôle admin_systeme).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authJWT, requireRole('admin_systeme'));

router.get('/statistiques', adminController.statistiques);
router.get('/configuration', adminController.configuration);

router.get('/utilisateurs', adminController.listerUtilisateurs);
router.post('/utilisateurs', adminController.creerUtilisateur);
router.patch('/utilisateurs/:id/actif', adminController.definirActifUtilisateur);

router.get('/etablissements', adminController.listerEtablissements);
router.post('/etablissements', adminController.creerEtablissement);
router.patch('/etablissements/:id/statut', adminController.definirStatutEtablissement);

export default router;
