// ─────────────────────────────────────────────────────────────
// Contrôleur "lot de transmission" — côté établissement (émission)
// et côté ministère (instruction).
// ─────────────────────────────────────────────────────────────
import * as lotService from '../services/lot.service.js';

const etab = (req) => req.utilisateur.etablissement_id;
const agentId = (req) => req.utilisateur?.utilisateur_id || null;

// ── Établissement ──────────────────────────────────────────────────

/** POST /api/promotions/:id/transmettre */
export async function transmettre(req, res, next) {
  try {
    const resultat = await lotService.transmettre(
      req.params.id,
      etab(req),
      req.utilisateur,
      req.body || {}
    );
    return res.status(201).json({ success: true, data: resultat });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/promotions/:id/transmission — ce qui manque avant d'envoyer. */
export async function preparerTransmission(req, res, next) {
  try {
    const data = await lotService.preparerTransmission(req.params.id, etab(req));
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/lots?statut= */
export async function listerPourEtablissement(req, res, next) {
  try {
    const lots = await lotService.listerPourEtablissement(etab(req), { statut: req.query.statut });
    return res.json({ success: true, data: { lots } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/lots/:id */
export async function detaillerPourEtablissement(req, res, next) {
  try {
    const data = await lotService.detaillerPourEtablissement(req.params.id, etab(req));
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

// ── Ministère ──────────────────────────────────────────────────────

/** GET /api/ministere/lots?statut= */
export async function lister(req, res, next) {
  try {
    const data = await lotService.lister({ statut: req.query.statut });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/lots/:id — lot, dossiers et contrôles automatiques */
export async function detailler(req, res, next) {
  try {
    const data = await lotService.detailler(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/lots/:id/examiner */
export async function examiner(req, res, next) {
  try {
    const data = await lotService.examiner(req.params.id, agentId(req));
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/lots/:id/valider  body: { dossiers_rejetes: [{dossier_id, motif}] } */
export async function valider(req, res, next) {
  try {
    const data = await lotService.valider(req.params.id, agentId(req), req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/ministere/lots/:id/traiter
 * body: { dossiers_valides: [id], dossiers_rejetes: [{dossier_id, motif}] }
 *
 * Statue sur une tranche seulement : ce qui n'est pas désigné reste en
 * attente, et l'agent peut reprendre plus tard.
 */
export async function traiterDossiers(req, res, next) {
  try {
    const data = await lotService.traiterDossiers(req.params.id, agentId(req), req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/lots/:id/rejeter  body: { motif } */
export async function rejeter(req, res, next) {
  try {
    const lot = await lotService.rejeter(req.params.id, agentId(req), (req.body || {}).motif);
    return res.json({ success: true, data: { lot } });
  } catch (err) {
    return next(err);
  }
}
