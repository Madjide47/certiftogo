// ─────────────────────────────────────────────────────────────
// Contrôleur "candidat" — module établissement.
// L'établissement courant provient du JWT (req.utilisateur.etablissement_id).
// ─────────────────────────────────────────────────────────────
import * as candidatService from '../services/candidat.service.js';

/** GET /api/candidats?recherche=&limit=&offset= */
export async function lister(req, res, next) {
  try {
    const etablissement_id = req.utilisateur.etablissement_id;
    const { recherche, limit, offset } = req.query;
    const candidats = await candidatService.lister(etablissement_id, {
      recherche,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({ success: true, data: { candidats } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/candidats/:id */
export async function recuperer(req, res, next) {
  try {
    const candidat = await candidatService.recuperer(req.params.id, req.utilisateur.etablissement_id);
    return res.json({ success: true, data: { candidat } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/candidats */
export async function creer(req, res, next) {
  try {
    const candidat = await candidatService.creer(req.utilisateur.etablissement_id, req.body || {});
    return res.status(201).json({ success: true, data: { candidat } });
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/candidats/:id */
export async function modifier(req, res, next) {
  try {
    const candidat = await candidatService.modifier(
      req.params.id,
      req.utilisateur.etablissement_id,
      req.body || {}
    );
    return res.json({ success: true, data: { candidat } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/candidats/:id */
export async function supprimer(req, res, next) {
  try {
    await candidatService.supprimer(req.params.id, req.utilisateur.etablissement_id);
    return res.json({ success: true, data: { supprime: true } });
  } catch (err) {
    return next(err);
  }
}
