// ─────────────────────────────────────────────────────────────
// Routes d'authentification — /api/auth
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { limiteEnvoiOtp, limiteVerificationOtp } from '../middlewares/rate-limit.middleware.js';

const router = Router();

// Étape 1 : demander un code OTP
router.post('/request-otp', limiteEnvoiOtp, authController.demanderOtp);

// Étape 2 : vérifier le code et obtenir un JWT
router.post('/verify-otp', limiteVerificationOtp, authController.verifierOtp);

// Infos de l'utilisateur connecté (protégée)
router.get('/me', authJWT, authController.moi);

// ── Sessions : renouvellement, déconnexion, appareils connectés ──
router.post('/refresh', authController.rafraichir);
router.post('/logout', authJWT, authController.deconnecter);
router.get('/sessions', authJWT, authController.listerSessions);
router.post('/sessions/fermer-autres', authJWT, authController.fermerAutresSessions);
router.delete('/sessions/:id', authJWT, authController.fermerSession);

export default router;
