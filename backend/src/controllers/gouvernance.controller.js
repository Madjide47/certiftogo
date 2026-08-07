// ─────────────────────────────────────────────────────────────
// Contrôleur "gouvernance" — établissements, habilitations,
// demandes d'intégration et agents.
// ─────────────────────────────────────────────────────────────
import * as gouvernanceService from '../services/gouvernance.service.js';

const agentId = (req) => req.utilisateur?.utilisateur_id || null;

// ── Ministère : établissements et habilitations ────────────────────

/** POST /api/ministere/etablissements */
export async function creerEtablissement(req, res, next) {
  try {
    const resultat = await gouvernanceService.creerEtablissement(req.body || {}, agentId(req));
    return res.status(201).json({ success: true, data: resultat });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/etablissements/:id/habilitations */
export async function listerHabilitations(req, res, next) {
  try {
    const habilitations = await gouvernanceService.listerHabilitations(req.params.id);
    return res.json({ success: true, data: { habilitations } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/etablissements/:id/habilitations */
export async function accorderHabilitation(req, res, next) {
  try {
    const habilitation = await gouvernanceService.accorderHabilitation(
      req.params.id,
      req.body || {}
    );
    return res.status(201).json({ success: true, data: { habilitation } });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/ministere/habilitations/:id/statut */
export async function changerStatutHabilitation(req, res, next) {
  try {
    const habilitation = await gouvernanceService.changerStatutHabilitation(
      req.params.id,
      (req.body || {}).statut
    );
    return res.json({ success: true, data: { habilitation } });
  } catch (err) {
    return next(err);
  }
}

// ── Demandes d'intégration ─────────────────────────────────────────

/** POST /api/demandes-integration — public, sans compte */
export async function deposerDemande(req, res, next) {
  try {
    const demande = await gouvernanceService.deposerDemande(req.body || {});
    return res.status(201).json({
      success: true,
      data: {
        reference: demande.reference,
        statut: demande.statut,
        // Rendu UNE seule fois : il n'est stocké nulle part ailleurs et
        // aucune lecture ultérieure ne le renvoie.
        jeton_depot: demande.jeton_depot,
        message:
          demande.statut === 'brouillon'
            ? 'Dossier ouvert. Joignez les pièces obligatoires, puis transmettez-le au ministère.'
            : "Demande enregistrée. Conservez la référence : elle permet d'en suivre l'instruction.",
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/demandes-integration/:reference/transmettre — public (jeton) */
export async function transmettreDemande(req, res, next) {
  try {
    const demande = await gouvernanceService.transmettreDemande(
      req.params.reference,
      (req.body || {}).jeton_depot || req.get('X-Jeton-Depot')
    );
    return res.json({
      success: true,
      data: {
        reference: demande.reference,
        statut: demande.statut,
        message: 'Dossier transmis au ministère. Suivez son instruction avec votre référence.',
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/demandes-integration/:reference — public */
export async function suivreDemande(req, res, next) {
  try {
    const demande = await gouvernanceService.suivreDemande(req.params.reference);
    return res.json({ success: true, data: { demande } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/demandes?statut= */
export async function listerDemandes(req, res, next) {
  try {
    const data = await gouvernanceService.listerDemandes({ statut: req.query.statut });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/demandes/:id/examiner */
export async function examinerDemande(req, res, next) {
  try {
    const demande = await gouvernanceService.examinerDemande(req.params.id, agentId(req));
    return res.json({ success: true, data: { demande } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/demandes/:id/accepter */
export async function accepterDemande(req, res, next) {
  try {
    const resultat = await gouvernanceService.accepterDemande(
      req.params.id,
      agentId(req),
      req.body || {}
    );
    return res.status(201).json({ success: true, data: resultat });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/ministere/demandes/:id/refuser */
export async function refuserDemande(req, res, next) {
  try {
    const demande = await gouvernanceService.refuserDemande(
      req.params.id,
      agentId(req),
      (req.body || {}).motif
    );
    return res.json({ success: true, data: { demande } });
  } catch (err) {
    return next(err);
  }
}

// ── Agents d'un établissement ──────────────────────────────────────

/** GET /api/structure/agents */
export async function listerAgents(req, res, next) {
  try {
    const agents = await gouvernanceService.listerAgents(req.utilisateur.etablissement_id);
    return res.json({ success: true, data: { agents } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/structure/agents — réservé à l'agent principal */
export async function creerAgent(req, res, next) {
  try {
    const agent = await gouvernanceService.creerAgent(req.utilisateur, req.body || {});
    return res.status(201).json({ success: true, data: { agent } });
  } catch (err) {
    return next(err);
  }
}
