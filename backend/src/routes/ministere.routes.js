// ─────────────────────────────────────────────────────────────
// Routes "ministère" — /api/ministere (réservées au rôle ministere).
// Instruction des dossiers transmis par les établissements.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as ministereController from '../controllers/ministere.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authJWT, requireRole('ministere'));

// /statistiques doit précéder /:id pour ne pas être capturé comme un id.
router.get('/dossiers/statistiques', ministereController.statistiques);
router.get('/dossiers', ministereController.listerDossiers);
router.get('/dossiers/:id', ministereController.recupererDossier);
router.post('/dossiers/:id/examiner', ministereController.examiner);
router.post('/dossiers/:id/valider', ministereController.valider);
router.post('/dossiers/:id/rejeter', ministereController.rejeter);
router.post('/dossiers/:id/certifier', ministereController.certifier);

// Établissements (lecture seule)
router.get('/etablissements', ministereController.listerEtablissements);

// Diplômes certifiés
router.get('/diplomes', ministereController.listerDiplomes);
router.get('/diplomes/:id', ministereController.recupererDiplome);
router.post('/diplomes/:id/revoquer', ministereController.revoquerDiplome);

export default router;
