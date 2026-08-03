// ─────────────────────────────────────────────────────────────
// Routes "ministère" — /api/ministere (réservées au rôle ministere).
// Instruction des dossiers transmis par les établissements.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as ministereController from '../controllers/ministere.controller.js';
import * as gouvernanceController from '../controllers/gouvernance.controller.js';
import * as lotController from '../controllers/lot.controller.js';
import * as ancrageController from '../controllers/ancrage.controller.js';
import * as pieceController from '../controllers/piece.controller.js';
import * as correctionService from '../services/correction.service.js';
import * as quatreYeux from '../services/validation-critique.service.js';
import * as diplomeService from '../services/diplome.service.js';
import * as ancrageService from '../services/ancrage.service.js';
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
// Les pièces d'un lot : ce que l'agent ouvre avant de statuer.
router.get('/lots/:id/pieces', pieceController.listerPourLot);
router.post('/pieces/:id/decision', pieceController.decider);

router.get('/lots', lotController.lister);
router.get('/lots/:id', lotController.detailler);
router.post('/lots/:id/examiner', lotController.examiner);
router.post('/lots/:id/valider', lotController.valider);
router.post('/lots/:id/rejeter', lotController.rejeter);

// ── Ancrage blockchain : certification de masse et supervision de la file.
// Chemins fixes avant les paramétrés.
router.get('/ancrage/abandonnees', ancrageController.abandonnees);
router.post('/ancrage/traiter', ancrageController.traiter);
router.post('/ancrage/:id/relancer', ancrageController.relancer);
router.get('/ancrage', ancrageController.etat);
router.post('/lots/:id/certifier', ancrageController.certifierLot);
router.get('/lots/:id/ancrage', ancrageController.progression);

// ── Contrôle à quatre yeux (ADR-015) ──────────────────────────────
// Les exécuteurs sont injectés ici : sans cela, le service de validation
// dépendrait de `diplome` et `ancrage`, qui dépendent déjà de lui.
const EXECUTEURS = {
  [quatreYeux.ACTIONS_CRITIQUES.DIPLOME_REVOQUER]: (charge) =>
    diplomeService.revoquer(charge.diplome_id, charge.motif, { approuve: true }),
  [quatreYeux.ACTIONS_CRITIQUES.LOT_CERTIFIER]: (charge) =>
    ancrageService.certifierLot(charge.lot_id, charge.ministere_id, { approuve: true }),
};

router.get('/validations', async (req, res, next) => {
  try {
    const validations = await quatreYeux.lister(req.utilisateur, req.query);
    return res.json({ success: true, data: { validations, active: quatreYeux.estActive() } });
  } catch (err) {
    return next(err);
  }
});

router.post('/validations/:id/approuver', async (req, res, next) => {
  try {
    const data = await quatreYeux.approuver(req.params.id, req.utilisateur, EXECUTEURS);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

router.post('/validations/:id/refuser', async (req, res, next) => {
  try {
    const validation = await quatreYeux.refuser(req.params.id, req.utilisateur, (req.body || {}).motif);
    return res.json({ success: true, data: { validation } });
  } catch (err) {
    return next(err);
  }
});

router.get('/demandes', gouvernanceController.listerDemandes);
router.post('/demandes/:id/examiner', gouvernanceController.examinerDemande);
router.post('/demandes/:id/accepter', gouvernanceController.accepterDemande);
router.post('/demandes/:id/refuser', gouvernanceController.refuserDemande);

// Diplômes certifiés
router.get('/diplomes', ministereController.listerDiplomes);
router.get('/diplomes/:id', ministereController.recupererDiplome);
router.post('/diplomes/:id/revoquer', ministereController.revoquerDiplome);

// ── Correction : émet une NOUVELLE VERSION plutôt que de modifier un
// diplôme certifié, dont le hash est déjà ancré on-chain.
router.post('/diplomes/:id/corriger', async (req, res, next) => {
  try {
    const data = await correctionService.corriger(
      req.params.id,
      req.utilisateur.ministere_id,
      req.body || {}
    );
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

router.get('/diplomes/:id/versions', async (req, res, next) => {
  try {
    return res.json({
      success: true,
      data: await correctionService.historiqueVersions(req.params.id),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
