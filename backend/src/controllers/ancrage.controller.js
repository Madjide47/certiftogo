// ─────────────────────────────────────────────────────────────
// Contrôleur "ancrage" — certification de masse et supervision de la file.
// ─────────────────────────────────────────────────────────────
import * as ancrageService from '../services/ancrage.service.js';

/** POST /api/ministere/lots/:id/certifier */
export async function certifierLot(req, res, next) {
  try {
    const data = await ancrageService.certifierLot(req.params.id, req.utilisateur.ministere_id);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/lots/:id/ancrage — « 8 245 / 12 000 ancrés » */
export async function progression(req, res, next) {
  try {
    const progression_ = await ancrageService.progression(req.params.id);
    return res.json({ success: true, data: { progression: progression_ } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/ancrage — état de la file et coûts cumulés */
export async function etat(req, res, next) {
  try {
    const data = await ancrageService.etat();
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/ancrage/abandonnees — dead letter queue */
export async function abandonnees(req, res, next) {
  try {
    const taches = await ancrageService.listerAbandonnees();
    return res.json({ success: true, data: { taches } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/ancrage/:id/relancer */
export async function relancer(req, res, next) {
  try {
    const tache = await ancrageService.relancer(req.params.id);
    return res.json({ success: true, data: { tache } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/ancrage/traiter — déclenche une tranche à la demande */
export async function traiter(req, res, next) {
  try {
    const resultat = await ancrageService.traiterMaintenant((req.body || {}).taille);
    return res.json({ success: true, data: resultat });
  } catch (err) {
    return next(err);
  }
}
