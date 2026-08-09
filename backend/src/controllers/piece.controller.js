// ─────────────────────────────────────────────────────────────
// Contrôleur "pièces justificatives".
// Traduit HTTP ↔ service ; toute la règle métier est dans le service.
// ─────────────────────────────────────────────────────────────
import * as pieces from '../services/piece-jointe.service.js';

/** Catalogue des types de pièces — alimente les listes déroulantes. */
export function catalogue(req, res) {
  return res.json({
    success: true,
    data: {
      types: Object.entries(pieces.TYPES_PIECE).map(([code, t]) => ({ code, ...t })),
      taille_max_octets: pieces.TAILLE_MAX_OCTETS,
      formats: ['PDF', 'JPEG', 'PNG'],
    },
  });
}

export async function listerPourCandidat(req, res, next) {
  try {
    const liste = await pieces.listerPourCandidat(req.params.id, req.utilisateur);
    return res.json({ success: true, data: { pieces: liste } });
  } catch (err) {
    return next(err);
  }
}

/**
 * Grille de dépôt d'un étudiant : une case par nature attendue. C'est
 * elle que l'écran affiche — la liste plate ne montrait que le déposé,
 * jamais le manquant.
 */
export async function grilleCandidat(req, res, next) {
  try {
    return res.json({
      success: true,
      data: await pieces.grilleCandidat(req.params.id, req.utilisateur),
    });
  } catch (err) {
    return next(err);
  }
}

export async function grillePromotion(req, res, next) {
  try {
    return res.json({
      success: true,
      data: await pieces.grillePromotion(req.params.id, req.utilisateur),
    });
  } catch (err) {
    return next(err);
  }
}

export async function deposerPourCandidat(req, res, next) {
  try {
    const piece = await pieces.deposerPourCandidat(
      req.params.id,
      req.utilisateur,
      req.body || {},
      req.file
    );
    return res.status(201).json({ success: true, data: { piece } });
  } catch (err) {
    return next(err);
  }
}

export async function listerPourPromotion(req, res, next) {
  try {
    const liste = await pieces.listerPourPromotion(req.params.id, req.utilisateur);
    return res.json({ success: true, data: { pieces: liste } });
  } catch (err) {
    return next(err);
  }
}

export async function deposerPourPromotion(req, res, next) {
  try {
    const piece = await pieces.deposerPourPromotion(
      req.params.id,
      req.utilisateur,
      req.body || {},
      req.file
    );
    return res.status(201).json({ success: true, data: { piece } });
  } catch (err) {
    return next(err);
  }
}

/**
 * Sert le document lui-même. `inline` par défaut : l'agent du ministère
 * doit pouvoir OUVRIR la pièce, pas seulement la télécharger — c'est ce
 * geste que l'instruction enregistre.
 */
export async function contenu(req, res, next) {
  try {
    const { donnees, nom_fichier, type_mime } = await pieces.contenu(
      req.params.id,
      req.utilisateur
    );

    const disposition = String(req.query.telecharger || '') === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', type_mime);
    // Le nom est encodé : un accent brut dans un en-tête HTTP casse la
    // réponse chez certains clients.
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(nom_fichier)}`
    );
    res.setHeader('Content-Length', donnees.length);
    // Une pièce justificative n'a rien à faire dans un cache partagé.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(donnees);
  } catch (err) {
    return next(err);
  }
}

export async function supprimer(req, res, next) {
  try {
    return res.json({
      success: true,
      data: await pieces.supprimer(req.params.id, req.utilisateur),
    });
  } catch (err) {
    return next(err);
  }
}

// ── Ministère ──────────────────────────────────────────────────────

export async function listerPourLot(req, res, next) {
  try {
    return res.json({ success: true, data: await pieces.listerPourLot(req.params.id) });
  } catch (err) {
    return next(err);
  }
}

export async function listerPourDossier(req, res, next) {
  try {
    return res.json({ success: true, data: await pieces.listerPourDossier(req.params.id) });
  } catch (err) {
    return next(err);
  }
}

export async function decider(req, res, next) {
  try {
    const piece = await pieces.decider(req.params.id, req.utilisateur, req.body || {});
    return res.json({ success: true, data: { piece } });
  } catch (err) {
    return next(err);
  }
}
