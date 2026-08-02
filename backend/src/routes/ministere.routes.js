// ─────────────────────────────────────────────────────────────
// Routes "ministère" — /api/ministere (réservées au rôle ministere).
// Instruction des dossiers transmis par les établissements.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as ministereController from '../controllers/ministere.controller.js';
import * as gouvernanceController from '../controllers/gouvernance.controller.js';
import * as lotController from '../controllers/lot.controller.js';
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

// ── Gouvernance : agrément, habilitations, demandes d'intégration ──
// C'est le ministère qui agrée un établissement — acte métier, pas
// opération technique. L'administrateur système, lui, exploite la
// plateforme et ne certifie jamais.
router.post('/etablissements', gouvernanceController.creerEtablissement);
router.get('/etablissements/:id/habilitations', gouvernanceController.listerHabilitations);
router.post('/etablissements/:id/habilitations', gouvernanceController.accorderHabilitation);
router.patch('/habilitations/:id/statut', gouvernanceController.changerStatutHabilitation);

// ── Lots de transmission : la file d'attente est faite de lots, pas de
// dossiers isolés. L'instruction porte sur le lot, la décision sur le dossier.
router.get('/lots', lotController.lister);
router.get('/lots/:id', lotController.detailler);
router.post('/lots/:id/examiner', lotController.examiner);
router.post('/lots/:id/valider', lotController.valider);
router.post('/lots/:id/rejeter', lotController.rejeter);

router.get('/demandes', gouvernanceController.listerDemandes);
router.post('/demandes/:id/examiner', gouvernanceController.examinerDemande);
router.post('/demandes/:id/accepter', gouvernanceController.accepterDemande);
router.post('/demandes/:id/refuser', gouvernanceController.refuserDemande);

// Diplômes certifiés
router.get('/diplomes', ministereController.listerDiplomes);
router.get('/diplomes/:id', ministereController.recupererDiplome);
router.post('/diplomes/:id/revoquer', ministereController.revoquerDiplome);

export default router;
