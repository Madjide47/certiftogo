// ─────────────────────────────────────────────────────────────
// Contrôleur "ministère" — instruction des dossiers transmis.
// ─────────────────────────────────────────────────────────────
import * as ministereService from '../services/dossier-ministere.service.js';
import * as diplomeService from '../services/diplome.service.js';

/** GET /api/ministere/dossiers?statut=&limit=&offset= */
export async function listerDossiers(req, res, next) {
  try {
    const { statut, limit, offset } = req.query;
    const dossiers = await ministereService.lister({
      statut,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({ success: true, data: { dossiers } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/dossiers/statistiques */
export async function statistiques(req, res, next) {
  try {
    const stats = await ministereService.statistiques();
    return res.json({ success: true, data: { statistiques: stats } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/etablissements */
export async function listerEtablissements(req, res, next) {
  try {
    const etablissements = await ministereService.listerEtablissements();
    return res.json({ success: true, data: { etablissements } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/dossiers/:id */
export async function recupererDossier(req, res, next) {
  try {
    const dossier = await ministereService.recuperer(req.params.id);
    return res.json({ success: true, data: { dossier } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/dossiers/:id/examiner */
export async function examiner(req, res, next) {
  try {
    const dossier = await ministereService.prendreEnExamen(
      req.params.id,
      req.utilisateur.utilisateur_id
    );
    return res.json({ success: true, data: { dossier } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/dossiers/:id/valider */
export async function valider(req, res, next) {
  try {
    const dossier = await ministereService.valider(
      req.params.id,
      req.utilisateur.utilisateur_id
    );
    return res.json({ success: true, data: { dossier } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/dossiers/:id/rejeter  body: { motif } */
export async function rejeter(req, res, next) {
  try {
    const dossier = await ministereService.rejeter(
      req.params.id,
      req.utilisateur.utilisateur_id,
      req.body?.motif
    );
    return res.json({ success: true, data: { dossier } });
  } catch (err) {
    return next(err);
  }
}

// ── Diplômes (certification / révocation) ──────────────────────

/** POST /api/ministere/dossiers/:id/certifier */
export async function certifier(req, res, next) {
  try {
    const diplome = await diplomeService.certifier(
      req.params.id,
      req.utilisateur.ministere_id
    );
    return res.status(201).json({ success: true, data: { diplome } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/diplomes?statut=&limit=&offset= */
export async function listerDiplomes(req, res, next) {
  try {
    const { statut, limit, offset } = req.query;
    const diplomes = await diplomeService.lister({
      statut,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({ success: true, data: { diplomes } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/diplomes/:id */
export async function recupererDiplome(req, res, next) {
  try {
    const diplome = await diplomeService.recuperer(req.params.id);
    return res.json({ success: true, data: { diplome } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/diplomes/:id/revoquer  body: { motif } */
export async function revoquerDiplome(req, res, next) {
  try {
    const diplome = await diplomeService.revoquer(req.params.id, req.body?.motif);
    return res.json({ success: true, data: { diplome } });
  } catch (err) {
    return next(err);
  }
}
