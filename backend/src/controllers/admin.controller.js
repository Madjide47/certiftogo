// ─────────────────────────────────────────────────────────────
// Contrôleur "admin système".
// ─────────────────────────────────────────────────────────────
import * as adminService from '../services/admin.service.js';

/** GET /api/admin/statistiques */
export async function statistiques(req, res, next) {
  try {
    const stats = await adminService.statistiques();
    return res.json({ success: true, data: { statistiques: stats } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/configuration */
export async function configuration(req, res, next) {
  try {
    return res.json({ success: true, data: { configuration: adminService.configuration() } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/utilisateurs?role= */
export async function listerUtilisateurs(req, res, next) {
  try {
    const utilisateurs = await adminService.listerUtilisateurs({ role: req.query.role });
    return res.json({ success: true, data: { utilisateurs } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/admin/utilisateurs */
export async function creerUtilisateur(req, res, next) {
  try {
    const utilisateur = await adminService.creerUtilisateur(req.body || {});
    return res.status(201).json({ success: true, data: { utilisateur } });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/admin/utilisateurs/:id/actif  body: { actif } */
export async function definirActifUtilisateur(req, res, next) {
  try {
    const utilisateur = await adminService.definirActifUtilisateur(
      req.params.id,
      req.body?.actif
    );
    return res.json({ success: true, data: { utilisateur } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/etablissements */
export async function listerEtablissements(req, res, next) {
  try {
    const etablissements = await adminService.listerEtablissements();
    return res.json({ success: true, data: { etablissements } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/admin/etablissements */
export async function creerEtablissement(req, res, next) {
  try {
    const etablissement = await adminService.creerEtablissement(req.body || {});
    return res.status(201).json({ success: true, data: { etablissement } });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/admin/etablissements/:id/statut  body: { statut } */
export async function definirStatutEtablissement(req, res, next) {
  try {
    const etablissement = await adminService.definirStatutEtablissement(
      req.params.id,
      req.body?.statut
    );
    return res.json({ success: true, data: { etablissement } });
  } catch (err) {
    return next(err);
  }
}
