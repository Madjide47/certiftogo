// ─────────────────────────────────────────────────────────────
// Contrôleur "dossier" — module établissement.
// ─────────────────────────────────────────────────────────────
import * as dossierService from '../services/dossier.service.js';

/** GET /api/dossiers?statut=&limit=&offset= */
export async function lister(req, res, next) {
  try {
    const { statut, limit, offset } = req.query;
    const dossiers = await dossierService.lister(req.utilisateur.etablissement_id, {
      statut,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({ success: true, data: { dossiers } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/dossiers/:id */
export async function recuperer(req, res, next) {
  try {
    const dossier = await dossierService.recuperer(req.params.id, req.utilisateur.etablissement_id);
    return res.json({ success: true, data: { dossier } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/dossiers */
export async function creer(req, res, next) {
  try {
    const dossier = await dossierService.creer(
      req.utilisateur.etablissement_id,
      req.utilisateur.utilisateur_id,
      req.body || {}
    );
    return res.status(201).json({ success: true, data: { dossier } });
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/dossiers/:id */
export async function modifier(req, res, next) {
  try {
    const dossier = await dossierService.modifier(
      req.params.id,
      req.utilisateur.etablissement_id,
      req.body || {}
    );
    return res.json({ success: true, data: { dossier } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/dossiers/:id/transmettre */
export async function transmettre(req, res, next) {
  try {
    const dossier = await dossierService.transmettre(
      req.params.id,
      req.utilisateur.etablissement_id,
      req.utilisateur.utilisateur_id
    );
    return res.json({ success: true, data: { dossier } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/dossiers/:id */
export async function supprimer(req, res, next) {
  try {
    await dossierService.supprimer(req.params.id, req.utilisateur.etablissement_id);
    return res.json({ success: true, data: { supprime: true } });
  } catch (err) {
    return next(err);
  }
}
