// ─────────────────────────────────────────────────────────────
// Routes "demandes d'intégration" — /api/demandes-integration
//
// PUBLIQUES, et c'est volontaire : un établissement qui souhaite
// rejoindre la plateforme n'a par définition pas encore de compte.
// Le dépôt d'une demande ne crée aucun accès — seul le ministère peut
// transformer une demande en établissement.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as gouvernanceController from '../controllers/gouvernance.controller.js';
import { limiteDemandeIntegration } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.post('/', limiteDemandeIntegration, gouvernanceController.deposerDemande);
router.get('/:reference', gouvernanceController.suivreDemande);

export default router;
