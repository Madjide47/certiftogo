// ─────────────────────────────────────────────────────────────
// Contrôleur "promotion" — cohortes et inscriptions.
// L'établissement courant provient du JWT (req.utilisateur.etablissement_id).
// ─────────────────────────────────────────────────────────────
import * as promotionService from '../services/promotion.service.js';
import * as priorite from '../services/priorite.service.js';

const etab = (req) => req.utilisateur.etablissement_id;

/** GET /api/promotions?annee_id=&filiere_id=&statut= */
export async function lister(req, res, next) {
  try {
    const { annee_id, filiere_id, statut } = req.query;
    const promotions = await promotionService.lister(etab(req), { annee_id, filiere_id, statut });
    return res.json({ success: true, data: { promotions } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/promotions/:id */
export async function recuperer(req, res, next) {
  try {
    const promotion = await promotionService.recuperer(req.params.id, etab(req));
    return res.json({ success: true, data: { promotion } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/promotions */
export async function creer(req, res, next) {
  try {
    const promotion = await promotionService.creer(etab(req), req.body || {});
    return res.status(201).json({ success: true, data: { promotion } });
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/promotions/:id */
export async function modifier(req, res, next) {
  try {
    const promotion = await promotionService.modifier(req.params.id, etab(req), req.body || {});
    return res.json({ success: true, data: { promotion } });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/promotions/:id/statut */
export async function changerStatut(req, res, next) {
  try {
    const promotion = await promotionService.changerStatut(
      req.params.id,
      etab(req),
      (req.body || {}).statut
    );
    return res.json({ success: true, data: { promotion } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/promotions/:id */
export async function supprimer(req, res, next) {
  try {
    await promotionService.supprimer(req.params.id, etab(req));
    return res.json({ success: true, data: { supprime: true } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/promotions/:id/inscriptions */
export async function listerInscriptions(req, res, next) {
  try {
    const inscriptions = await promotionService.listerInscriptions(req.params.id, etab(req));
    return res.json({ success: true, data: { inscriptions } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/promotions/:id/inscriptions */
export async function inscrire(req, res, next) {
  try {
    const inscription = await promotionService.inscrire(req.params.id, etab(req), req.body || {});
    return res.status(201).json({ success: true, data: { inscription } });
  } catch (err) {
    return next(err);
  }
}

/** PUT /api/promotions/:id/inscriptions/:inscriptionId */
export async function enregistrerResultat(req, res, next) {
  try {
    const inscription = await promotionService.enregistrerResultat(
      req.params.id,
      req.params.inscriptionId,
      etab(req),
      req.body || {}
    );
    return res.json({ success: true, data: { inscription } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/promotions/:id/inscriptions/:inscriptionId */
export async function desinscrire(req, res, next) {
  try {
    await promotionService.desinscrire(req.params.id, req.params.inscriptionId, etab(req));
    return res.json({ success: true, data: { supprime: true } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/promotions/:id/import?simulation=true — fichier Excel ou CSV */
export async function importer(req, res, next) {
  try {
    const simulation = String(req.query.simulation || '') === 'true';

    if (simulation) {
      const rapport = await promotionService.analyserImport(req.params.id, etab(req), req.file);
      return res.json({ success: true, data: { simulation: true, rapport } });
    }

    const rapport = await promotionService.executerImport(req.params.id, etab(req), req.file);
    return res.status(201).json({ success: true, data: { simulation: false, rapport } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/promotions/modele-import — gabarit Excel à remplir */
export async function modeleImport(req, res, next) {
  try {
    const fichier = await promotionService.genererModeleImport();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="modele-import-certiftogo.xlsx"');
    return res.send(fichier);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/promotions/parcours/:candidatId */
export async function parcoursEtudiant(req, res, next) {
  try {
    const parcours = await promotionService.parcoursEtudiant(req.params.candidatId, etab(req));
    return res.json({ success: true, data: { parcours } });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/promotions/:id/inscriptions/:inscriptionId/priorite
 *
 * Avant transmission, le dossier n'existe pas encore : l'urgence se
 * déclare sur l'inscription, et suivra le dossier qu'elle engendrera.
 */
export async function definirPrioriteInscription(req, res, next) {
  try {
    const inscription = await priorite.definirPourInscription(
      req.params.inscriptionId,
      req.utilisateur,
      req.body || {}
    );
    return res.json({ success: true, data: { inscription } });
  } catch (err) {
    return next(err);
  }
}
