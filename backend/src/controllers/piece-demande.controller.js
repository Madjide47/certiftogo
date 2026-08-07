// ─────────────────────────────────────────────────────────────
// Contrôleur "pièces d'une demande d'intégration".
//
// Le déposant n'a pas de compte : son autorisation tient au couple
// référence + jeton, lu ici une fois pour toutes et transformé en
// demande authentifiée avant d'atteindre le service.
// ─────────────────────────────────────────────────────────────
import * as pieces from '../services/piece-demande.service.js';
import * as gouvernance from '../services/gouvernance.service.js';

/** Le jeton voyage en en-tête, ou dans le corps pour les envois multipart. */
function jetonDe(req) {
  return req.get('X-Jeton-Depot') || (req.body || {}).jeton_depot || req.query.jeton;
}

/** GET /api/demandes-integration/pieces/catalogue — public */
export function catalogue(req, res) {
  return res.json({
    success: true,
    data: {
      types: pieces.catalogue(),
      taille_max_octets: pieces.TAILLE_MAX_OCTETS,
    },
  });
}

/** POST /api/demandes-integration/:reference/pieces — public (jeton) */
export async function deposer(req, res, next) {
  try {
    const demande = await gouvernance.recupererParJeton(req.params.reference, jetonDe(req));
    const piece = await pieces.deposer(demande, req.body || {}, req.file);
    return res.status(201).json({
      success: true,
      data: { piece, manquants: await pieces.manquants(demande) },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/demandes-integration/:reference/pieces — public (jeton) */
export async function lister(req, res, next) {
  try {
    const demande = await gouvernance.recupererParJeton(req.params.reference, jetonDe(req));
    return res.json({
      success: true,
      data: {
        statut: demande.statut,
        pieces: await pieces.lister(demande.id),
        manquants: await pieces.manquants(demande),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/demandes-integration/:reference/pieces/:id — public (jeton) */
export async function supprimer(req, res, next) {
  try {
    const demande = await gouvernance.recupererParJeton(req.params.reference, jetonDe(req));
    const data = await pieces.supprimer(demande, req.params.id);
    return res.json({ success: true, data: { ...data, manquants: await pieces.manquants(demande) } });
  } catch (err) {
    return next(err);
  }
}

// ── Ministère ──────────────────────────────────────────────────────

/** GET /api/ministere/demandes/:id/pieces */
export async function listerPourMinistere(req, res, next) {
  try {
    const demande = await gouvernance.recupererDemande(req.params.id);
    return res.json({
      success: true,
      data: { pieces: await pieces.lister(demande.id), manquants: await pieces.manquants(demande) },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/ministere/demandes/pieces/:id/contenu */
export async function contenu(req, res, next) {
  try {
    const { donnees, nom_fichier, type_mime } = await pieces.contenu(req.params.id);
    res.setHeader('Content-Type', type_mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(nom_fichier)}`
    );
    res.setHeader('Content-Length', donnees.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(donnees);
  } catch (err) {
    return next(err);
  }
}
