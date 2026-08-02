// ─────────────────────────────────────────────────────────────
// Contrôleur "journal d'audit", historique et corbeille.
// ─────────────────────────────────────────────────────────────
import * as auditService from '../services/audit.service.js';

/** GET /api/journal?action=&entite=&resultat=&depuis=&jusqua=&limit=&offset= */
export async function consulter(req, res, next) {
  try {
    const data = await auditService.consulter(req.utilisateur, req.query);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/journal/repartition */
export async function repartition(req, res, next) {
  try {
    const repartitions = await auditService.repartition(req.utilisateur);
    return res.json({ success: true, data: { repartitions } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/journal/export — CSV */
export async function exporter(req, res, next) {
  try {
    const csv = await auditService.exporter(req.utilisateur, req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="journal-audit.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/journal/dossiers/:id — chronologie complète d'un dossier */
export async function historiqueDossier(req, res, next) {
  try {
    const historique = await auditService.historiqueDossier(req.params.id);
    return res.json({ success: true, data: { historique } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/journal/purger  body: { jours } */
export async function purger(req, res, next) {
  try {
    const supprimees = await auditService.purger(req.utilisateur, (req.body || {}).jours);
    return res.json({ success: true, data: { supprimees } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/corbeille?table_source= */
export async function listerCorbeille(req, res, next) {
  try {
    const elements = await auditService.listerCorbeille(req.utilisateur, req.query);
    return res.json({ success: true, data: { elements } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/corbeille/:id/restaurer */
export async function restaurer(req, res, next) {
  try {
    const restaure = await auditService.restaurer(req.utilisateur, req.params.id);
    return res.json({ success: true, data: { restaure } });
  } catch (err) {
    return next(err);
  }
}
