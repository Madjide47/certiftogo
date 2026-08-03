// ─────────────────────────────────────────────────────────────
// Routes "promotions" — /api/promotions (réservées à l'établissement).
// Cohortes et inscriptions des étudiants.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as promotionController from '../controllers/promotion.controller.js';
import * as lotController from '../controllers/lot.controller.js';
import * as pieceController from '../controllers/piece.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { recevoirFichier } from '../middlewares/televersement.middleware.js';
import { requirePermission } from '../services/permissions.service.js';
import { TAILLE_MAX_OCTETS } from '../services/piece-jointe.service.js';

const router = Router();

// Le classeur reste en mémoire : il est analysé puis jeté, jamais stocké.
// 5 Mo suffisent largement — un classeur de 12 000 lignes pèse ~1 Mo.
const recevoirClasseur = recevoirFichier({
  tailleMax: 5 * 1024 * 1024,
  extensions: /\.(xlsx|csv)$/i,
  messageFormat: 'Formats acceptés : .xlsx et .csv.',
});

const recevoirPiece = recevoirFichier({
  tailleMax: TAILLE_MAX_OCTETS,
  extensions: /\.(pdf|jpe?g|png)$/i,
  messageFormat: 'Formats acceptés : PDF, JPEG, PNG.',
});

router.use(authJWT, requireRole('etablissement'));

// Deux segments : aucune ambiguïté avec /:id, qui n'en compte qu'un.
router.get('/parcours/:candidatId', promotionController.parcoursEtudiant);
router.get('/modele-import', promotionController.modeleImport);

router.get('/', promotionController.lister);
router.post('/', requirePermission('promotion.creer'), promotionController.creer);
router.get('/:id', promotionController.recuperer);
router.put('/:id', promotionController.modifier);
router.patch('/:id/statut', promotionController.changerStatut);
router.delete('/:id', promotionController.supprimer);

// ── Inscriptions d'une promotion ───────────────────────────────────
router.get('/:id/inscriptions', promotionController.listerInscriptions);
router.post('/:id/inscriptions', promotionController.inscrire);
router.put('/:id/inscriptions/:inscriptionId', requirePermission('promotion.resultat'), promotionController.enregistrerResultat);
router.delete('/:id/inscriptions/:inscriptionId', promotionController.desinscrire);

// Import d'une promotion entière. `?simulation=true` valide sans écrire.
router.post('/:id/import', requirePermission('promotion.importer'), recevoirClasseur, promotionController.importer);

// ── Pièces collectives : procès-verbal de délibération, arrêté de jury ──
router.get('/:id/pieces', pieceController.listerPourPromotion);
router.post(
  '/:id/pieces',
  requirePermission('piece.deposer'),
  recevoirPiece,
  pieceController.deposerPourPromotion
);

// Transmission de la promotion entière au ministère : génère un lot et
// un dossier par étudiant admis.
router.post('/:id/transmettre', requirePermission('promotion.transmettre'), lotController.transmettre);

export default router;
