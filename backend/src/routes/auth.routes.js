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

// ── Changement volontaire de numéro (A-14) ──────────────────────
// Le titulaire mène la procédure lui-même : il détient encore ses deux
// numéros, il n'a besoin de personne pour le prouver. La récupération
// après perte, elle, passe par un agent (/api/recuperation).
//
// Le plafond d'envoi d'OTP s'applique : sans lui, la demande deviendrait
// un moyen d'envoyer des SMS à n'importe quel numéro.
const changement = Router();
changement.use(authJWT);
changement.get('/', authController.etatChangementNumero);
changement.post('/', limiteEnvoiOtp, authController.demanderChangementNumero);
changement.post('/:id/confirmer-ancien', limiteVerificationOtp, authController.confirmerAncienNumero);
changement.post('/:id/confirmer-nouveau', limiteVerificationOtp, authController.confirmerNouveauNumero);
changement.delete('/:id', authController.annulerChangementNumero);

router.use('/changement-numero', changement);

export default router;
