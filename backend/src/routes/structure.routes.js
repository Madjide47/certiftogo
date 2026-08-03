// ─────────────────────────────────────────────────────────────
// Routes "structure" — /api/structure (réservées à l'établissement).
// Facultés et filières de l'établissement authentifié.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as structureController from '../controllers/structure.controller.js';
import * as gouvernanceController from '../controllers/gouvernance.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import * as permissions from '../services/permissions.service.js';
import * as gouvernanceService from '../services/gouvernance.service.js';

const router = Router();

router.use(authJWT, requireRole('etablissement'));

// ── Agents de l'établissement (création réservée à l'agent principal) ──
// Profil du compte : l'interface s'en sert pour masquer ce qui est interdit
// plutot que de laisser l'agent decouvrir l'interdiction par un 403.
router.get('/profil', async (req, res, next) => {
  try {
    return res.json({ success: true, data: await permissions.profil(req.utilisateur) });
  } catch (err) {
    return next(err);
  }
});

router.put('/mode-workflow', async (req, res, next) => {
  try {
    const etablissement = await gouvernanceService.definirModeWorkflow(
      req.utilisateur,
      (req.body || {}).mode
    );
    return res.json({ success: true, data: { etablissement } });
  } catch (err) {
    return next(err);
  }
});

router.get('/agents', gouvernanceController.listerAgents);
router.post('/agents', gouvernanceController.creerAgent);

// ── Facultés ───────────────────────────────────────────────────────
router.get('/facultes', structureController.listerFacultes);
router.post('/facultes', permissions.requirePermission('structure.gerer'), structureController.creerFaculte);
router.get('/facultes/:id', structureController.recupererFaculte);
router.put('/facultes/:id', structureController.modifierFaculte);
router.delete('/facultes/:id', structureController.supprimerFaculte);

// ── Filières ───────────────────────────────────────────────────────
router.get('/filieres', structureController.listerFilieres);
router.post('/filieres', permissions.requirePermission('structure.gerer'), structureController.creerFiliere);
router.get('/filieres/:id', structureController.recupererFiliere);
router.put('/filieres/:id', structureController.modifierFiliere);
router.delete('/filieres/:id', structureController.supprimerFiliere);

export default router;
