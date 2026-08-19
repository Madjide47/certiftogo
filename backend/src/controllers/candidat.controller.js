// ─────────────────────────────────────────────────────────────
// Contrôleur "candidat" — module établissement.
// L'établissement courant provient du JWT (req.utilisateur.etablissement_id).
// ─────────────────────────────────────────────────────────────
import * as candidatService from '../services/candidat.service.js';
import * as fiche from '../services/fiche-etudiant.service.js';

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

/**
 * GET /api/candidats/:id/fiche
 *
 * Tout ce que le système sait de cet étudiant, en une lecture : état
 * civil, parcours, dossiers, diplômes, pièces et ce qui manque.
 */
export async function ficheEtudiant(req, res, next) {
  try {
    const data = await fiche.pourEtablissement(req.params.id, req.utilisateur);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}
