// ─────────────────────────────────────────────────────────────
// Routes "promotions" — /api/promotions (réservées à l'établissement).
// Cohortes et inscriptions des étudiants.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as promotionController from '../controllers/promotion.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authJWT, requireRole('etablissement'));

// Deux segments : aucune ambiguïté avec /:id, qui n'en compte qu'un.
router.get('/parcours/:candidatId', promotionController.parcoursEtudiant);

router.get('/', promotionController.lister);
router.post('/', promotionController.creer);
router.get('/:id', promotionController.recuperer);
router.put('/:id', promotionController.modifier);
router.patch('/:id/statut', promotionController.changerStatut);
router.delete('/:id', promotionController.supprimer);

// ── Inscriptions d'une promotion ───────────────────────────────────
router.get('/:id/inscriptions', promotionController.listerInscriptions);
router.post('/:id/inscriptions', promotionController.inscrire);
router.put('/:id/inscriptions/:inscriptionId', promotionController.enregistrerResultat);
router.delete('/:id/inscriptions/:inscriptionId', promotionController.desinscrire);

export default router;
