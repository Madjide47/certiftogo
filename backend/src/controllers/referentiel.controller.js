// ─────────────────────────────────────────────────────────────
// Contrôleur "référentiel" — années académiques et sessions.
// Lecture ouverte à tout compte authentifié, écriture réservée au ministère.
// ─────────────────────────────────────────────────────────────
import * as referentielService from '../services/referentiel.service.js';

/** GET /api/referentiel/annees?statut= */
export async function listerAnnees(req, res, next) {
  try {
    const annees = await referentielService.listerAnnees({ statut: req.query.statut });
    return res.json({ success: true, data: { annees } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/referentiel/annees/:id */
export async function recupererAnnee(req, res, next) {
  try {
    const annee = await referentielService.recupererAnnee(req.params.id);
    return res.json({ success: true, data: { annee } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/referentiel/annees */
export async function creerAnnee(req, res, next) {
  try {
    const annee = await referentielService.creerAnnee(req.body || {});
    return res.status(201).json({ success: true, data: { annee } });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/referentiel/annees/:id/statut */
export async function changerStatutAnnee(req, res, next) {
  try {
    const annee = await referentielService.changerStatutAnnee(
      req.params.id,
      (req.body || {}).statut
    );
    return res.json({ success: true, data: { annee } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/referentiel/annees/:id */
export async function supprimerAnnee(req, res, next) {
  try {
    await referentielService.supprimerAnnee(req.params.id);
    return res.json({ success: true, data: { supprime: true } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/referentiel/annees/:id/sessions */
export async function listerSessions(req, res, next) {
  try {
    const sessions = await referentielService.listerSessions(req.params.id);
    return res.json({ success: true, data: { sessions } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/referentiel/annees/:id/sessions */
export async function creerSession(req, res, next) {
  try {
    const session = await referentielService.creerSession(req.params.id, req.body || {});
    return res.status(201).json({ success: true, data: { session } });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/referentiel/sessions/:id/statut */
export async function changerStatutSession(req, res, next) {
  try {
    const session = await referentielService.changerStatutSession(
      req.params.id,
      (req.body || {}).statut
    );
    return res.json({ success: true, data: { session } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/referentiel/sessions/:id */
export async function supprimerSession(req, res, next) {
  try {
    await referentielService.supprimerSession(req.params.id);
    return res.json({ success: true, data: { supprime: true } });
  } catch (err) {
    return next(err);
  }
}
