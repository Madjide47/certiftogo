// ─────────────────────────────────────────────────────────────
// Routes "cas exceptionnels" — récupération de compte, départ
// d'agent, registre des clés de signature.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as exceptions from '../services/exceptions.service.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { limiter } from '../middlewares/rate-limit.middleware.js';

const repondre = (handler, statut = 200) => async (req, res, next) => {
  try {
    return res.status(statut).json({ success: true, data: await handler(req) });
  } catch (err) {
    return next(err);
  }
};

// ── Récupération de compte (ERR-003) ───────────────────────────────
// Le dépôt est PUBLIC : le demandeur a justement perdu l'accès à son
// compte. Limité par IP, car aucun autre garde-fou n'est possible.
export const recuperationRouter = Router();

recuperationRouter.post(
  '/',
  limiter({ nom: 'recuperation', max: 3, fenetreMs: 60 * 60 * 1000 }),
  repondre((req) => exceptions.deposerRecuperation(req.body || {}), 201)
);

recuperationRouter.get(
  '/',
  authJWT,
  repondre(async (req) => ({
    demandes: await exceptions.listerRecuperations(req.utilisateur, req.query),
  }))
);

recuperationRouter.post(
  '/:id/valider',
  authJWT,
  requireRole('etablissement', 'ministere', 'admin_systeme'),
  repondre((req) => exceptions.validerRecuperation(req.params.id, req.utilisateur, req.body || {}))
);

recuperationRouter.post(
  '/:id/refuser',
  authJWT,
  requireRole('etablissement', 'ministere', 'admin_systeme'),
  repondre((req) =>
    exceptions.refuserRecuperation(req.params.id, req.utilisateur, (req.body || {}).motif)
  )
);

// ── Départ d'un agent (ERR-004) ────────────────────────────────────
export const departRouter = Router();

departRouter.use(authJWT, requireRole('etablissement'));
departRouter.post(
  '/transfert',
  repondre((req) => exceptions.transfererDossiers(req.utilisateur, req.body || {}))
);

// ── Clés de signature (ERR-006) ────────────────────────────────────
export const clesRouter = Router();

clesRouter.use(authJWT, requireRole('admin_systeme'));
clesRouter.get('/', repondre(() => exceptions.etatCles()));
clesRouter.post('/enregistrer', repondre((req) => exceptions.enregistrerCleCourante(req.body?.ministere_id), 201));
clesRouter.post(
  '/compromission',
  repondre((req) => exceptions.declarerCompromission(req.utilisateur, req.body || {}))
);
