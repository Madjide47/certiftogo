// ─────────────────────────────────────────────────────────────
// Routes "promotions" — /api/promotions (réservées à l'établissement).
// Cohortes et inscriptions des étudiants.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import multer from 'multer';
import * as promotionController from '../controllers/promotion.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { ErreurApp } from '../utils/errors.js';

const router = Router();

// Le fichier reste en mémoire : il est analysé puis jeté, jamais stocké.
// 5 Mo suffisent largement — un classeur de 12 000 lignes pèse ~1 Mo.
const EXTENSIONS = /\.(xlsx|csv)$/i;
const televersement = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, fichier, suite) => {
    if (!EXTENSIONS.test(fichier.originalname || '')) {
      return suite(
        new ErreurApp(400, 'FORMAT_NON_SUPPORTE', 'Formats acceptés : .xlsx et .csv.')
      );
    }
    return suite(null, true);
  },
});

/** Traduit les erreurs de multer en erreurs métier plutôt qu'en 500. */
function recevoirFichier(req, res, next) {
  televersement.single('fichier')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ErreurApp(413, 'FICHIER_TROP_VOLUMINEUX', 'Fichier limité à 5 Mo.'));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new ErreurApp(400, 'CHAMP_FICHIER_INVALIDE', 'Le fichier doit être envoyé dans le champ « fichier ».'));
    }
    return next(err);
  });
}

router.use(authJWT, requireRole('etablissement'));

// Deux segments : aucune ambiguïté avec /:id, qui n'en compte qu'un.
router.get('/parcours/:candidatId', promotionController.parcoursEtudiant);
router.get('/modele-import', promotionController.modeleImport);

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

// Import d'une promotion entière. `?simulation=true` valide sans écrire.
router.post('/:id/import', recevoirFichier, promotionController.importer);

export default router;
