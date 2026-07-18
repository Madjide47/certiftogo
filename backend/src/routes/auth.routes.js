// ─────────────────────────────────────────────────────────────
// Routes d'authentification — /api/auth
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Étape 1 : demander un code OTP
router.post('/request-otp', authController.demanderOtp);

// Étape 2 : vérifier le code et obtenir un JWT
router.post('/verify-otp', authController.verifierOtp);

// Infos de l'utilisateur connecté (protégée)
router.get('/me', authJWT, authController.moi);

export default router;
