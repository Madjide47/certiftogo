// ─────────────────────────────────────────────────────────────
// Routes "vérification" — /api/verification (PUBLIQUES, sans JWT).
// Utilisées par le front-office public (hash ou QR).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as verificationController from '../controllers/verification.controller.js';

const router = Router();

router.get('/:code', verificationController.verifier);

export default router;
