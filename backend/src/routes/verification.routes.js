// ─────────────────────────────────────────────────────────────
// Routes "vérification" — /api/verification (PUBLIQUES, sans JWT).
// Utilisées par le front-office public (hash ou QR).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import {
  limiteVerificationPublique,
  limiteVerificationLot,
} from '../middlewares/rate-limit.middleware.js';
import * as verificationController from '../controllers/verification.controller.js';

const router = Router();

// Déclarée avant la route paramétrée : sinon un POST resterait sans
// route, mais surtout la lecture du fichier laisserait croire l'inverse.
router.post('/lot', limiteVerificationLot, verificationController.verifierLot);

router.get('/:code', limiteVerificationPublique, verificationController.verifier);

export default router;
