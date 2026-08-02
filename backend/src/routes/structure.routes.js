// ─────────────────────────────────────────────────────────────
// Routes "structure" — /api/structure (réservées à l'établissement).
// Facultés et filières de l'établissement authentifié.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as structureController from '../controllers/structure.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authJWT, requireRole('etablissement'));

// ── Facultés ───────────────────────────────────────────────────────
router.get('/facultes', structureController.listerFacultes);
router.post('/facultes', structureController.creerFaculte);
router.get('/facultes/:id', structureController.recupererFaculte);
router.put('/facultes/:id', structureController.modifierFaculte);
router.delete('/facultes/:id', structureController.supprimerFaculte);

// ── Filières ───────────────────────────────────────────────────────
router.get('/filieres', structureController.listerFilieres);
router.post('/filieres', structureController.creerFiliere);
router.get('/filieres/:id', structureController.recupererFiliere);
router.put('/filieres/:id', structureController.modifierFiliere);
router.delete('/filieres/:id', structureController.supprimerFiliere);

export default router;
