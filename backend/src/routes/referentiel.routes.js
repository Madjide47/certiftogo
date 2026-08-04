// ─────────────────────────────────────────────────────────────
// Routes "référentiel" — /api/referentiel
//
// Le référentiel académique est national : le ministère l'écrit, tous les
// comptes authentifiés le lisent (un établissement doit consulter les
// années et sessions ouvertes pour rattacher ses promotions).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as referentielController from '../controllers/referentiel.controller.js';
import * as nomenclature from '../services/nomenclature.service.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

const repondre = (handler, statut = 200) => async (req, res, next) => {
  try {
    return res.status(statut).json({ success: true, data: await handler(req) });
  } catch (err) {
    return next(err);
  }
};

router.use(authJWT);

const ministere = requireRole('ministere', 'admin_systeme');

// ── Années académiques ─────────────────────────────────────────────
router.get('/annees', referentielController.listerAnnees);
router.post('/annees', ministere, referentielController.creerAnnee);
router.get('/annees/:id', referentielController.recupererAnnee);
router.patch('/annees/:id/statut', ministere, referentielController.changerStatutAnnee);
router.delete('/annees/:id', ministere, referentielController.supprimerAnnee);

// ── Sessions ───────────────────────────────────────────────────────
router.get('/annees/:id/sessions', referentielController.listerSessions);
router.post('/annees/:id/sessions', ministere, referentielController.creerSession);
router.patch('/sessions/:id/statut', ministere, referentielController.changerStatutSession);
router.delete('/sessions/:id', ministere, referentielController.supprimerSession);

// ── Nomenclatures : types de diplôme et mentions (P-11) ────────────
// Lecture ouverte à tout compte : un établissement doit pouvoir remplir
// une liste déroulante. Écriture au ministère seul — la nomenclature des
// diplômes du pays n'est pas un réglage d'exploitation.
router.get(
  '/nomenclatures',
  repondre(async (req) => {
    const actifsSeuls = String(req.query.actifs || '') === 'true';
    const [types, mentions] = await Promise.all([
      nomenclature.typesDiplome({ actifsSeuls }),
      nomenclature.mentions({ actifsSeuls }),
    ]);
    return { types_diplome: types, mentions };
  })
);

router.post(
  '/types-diplome',
  ministere,
  repondre((req) => nomenclature.ajouterTypeDiplome(req.body || {}), 201)
);

router.patch(
  '/types-diplome/:code/actif',
  ministere,
  repondre((req) =>
    nomenclature.definirActifTypeDiplome(req.params.code, (req.body || {}).actif)
  )
);

export default router;
