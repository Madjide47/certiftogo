// ─────────────────────────────────────────────────────────────
// Contrôleur "structure" — facultés et filières.
// L'établissement courant provient du JWT (req.utilisateur.etablissement_id).
// ─────────────────────────────────────────────────────────────
import * as structureService from '../services/structure.service.js';

const etab = (req) => req.utilisateur.etablissement_id;

/** GET /api/structure/facultes?statut= */
export async function listerFacultes(req, res, next) {
  try {
    const facultes = await structureService.listerFacultes(etab(req), { statut: req.query.statut });
    return res.json({ success: true, data: { facultes } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/structure/facultes/:id */
export async function recupererFaculte(req, res, next) {
  try {
    const faculte = await structureService.recupererFaculte(req.params.id, etab(req));
    return res.json({ success: true, data: { faculte } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/structure/facultes */
export async function creerFaculte(req, res, next) {
  try {
    const faculte = await structureService.creerFaculte(etab(req), req.body || {});
    return res.status(201).json({ success: true, data: { faculte } });
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/structure/facultes/:id */
export async function modifierFaculte(req, res, next) {
  try {
    const faculte = await structureService.modifierFaculte(req.params.id, etab(req), req.body || {});
    return res.json({ success: true, data: { faculte } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/structure/facultes/:id */
export async function supprimerFaculte(req, res, next) {
  try {
    await structureService.supprimerFaculte(req.params.id, etab(req));
    return res.json({ success: true, data: { supprime: true } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/structure/filieres?faculte_id=&statut= */
export async function listerFilieres(req, res, next) {
  try {
    const filieres = await structureService.listerFilieres(etab(req), {
      faculte_id: req.query.faculte_id,
      statut: req.query.statut,
    });
    return res.json({ success: true, data: { filieres } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/structure/filieres/:id */
export async function recupererFiliere(req, res, next) {
  try {
    const filiere = await structureService.recupererFiliere(req.params.id, etab(req));
    return res.json({ success: true, data: { filiere } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/structure/filieres */
export async function creerFiliere(req, res, next) {
  try {
    const filiere = await structureService.creerFiliere(etab(req), req.body || {});
    return res.status(201).json({ success: true, data: { filiere } });
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/structure/filieres/:id */
export async function modifierFiliere(req, res, next) {
  try {
    const filiere = await structureService.modifierFiliere(req.params.id, etab(req), req.body || {});
    return res.json({ success: true, data: { filiere } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/structure/filieres/:id */
export async function supprimerFiliere(req, res, next) {
  try {
    await structureService.supprimerFiliere(req.params.id, etab(req));
    return res.json({ success: true, data: { supprime: true } });
  } catch (err) {
    return next(err);
  }
}
