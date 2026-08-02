// ─────────────────────────────────────────────────────────────
// Limitation de débit (CDC §23.4).
//
// Compteurs en mémoire, fenêtre glissante. C'est suffisant pour un
// processus unique et sans dépendance externe ; avec plusieurs instances
// derrière un répartiteur, il faudra un compteur partagé (Redis) car
// chaque instance compterait de son côté. La limite est documentée
// plutôt que masquée.
//
// Trois surfaces à protéger :
//   • l'envoi d'OTP — sinon on fait sonner le téléphone d'un tiers ;
//   • la vérification d'OTP — sinon on force un code à 6 chiffres ;
//   • la vérification publique — sinon on énumère les diplômes.
// ─────────────────────────────────────────────────────────────
import { logger } from '../utils/logger.js';

const compteurs = new Map();

// Purge périodique : sans elle la mémoire croît avec le nombre d'IP vues.
const PURGE_MS = 5 * 60 * 1000;
let minuteurPurge = null;

function demarrerPurge() {
  if (minuteurPurge) return;
  minuteurPurge = setInterval(() => {
    const maintenant = Date.now();
    for (const [cle, entree] of compteurs) {
      if (entree.expire <= maintenant) compteurs.delete(cle);
    }
  }, PURGE_MS);
  // N'empêche pas le processus de s'arrêter (utile en test).
  if (typeof minuteurPurge.unref === 'function') minuteurPurge.unref();
}

/**
 * @param {object} options
 * @param {number} options.max        requêtes autorisées dans la fenêtre
 * @param {number} options.fenetreMs  durée de la fenêtre
 * @param {string} options.nom        identifiant du seau (isole les compteurs)
 * @param {(req) => string} [options.cle]  clé de regroupement (IP par défaut)
 * @param {string} [options.message]
 */
export function limiter({ max, fenetreMs, nom, cle, message }) {
  demarrerPurge();

  return (req, res, next) => {
    // Neutralisé en test : la suite enchaîne des dizaines d'appels
    // légitimes que la limite bloquerait.
    if (process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_TEST !== 'on') {
      return next();
    }

    const identifiant = cle ? cle(req) : req.ip || req.socket?.remoteAddress || 'inconnu';
    const cleComplete = `${nom}:${identifiant}`;
    const maintenant = Date.now();

    let entree = compteurs.get(cleComplete);
    if (!entree || entree.expire <= maintenant) {
      entree = { compte: 0, expire: maintenant + fenetreMs };
      compteurs.set(cleComplete, entree);
    }

    entree.compte += 1;

    const restant = Math.max(0, max - entree.compte);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(restant));

    if (entree.compte > max) {
      const attente = Math.ceil((entree.expire - maintenant) / 1000);
      res.setHeader('Retry-After', String(attente));
      logger.warn(`[rate-limit] ${cleComplete} bloqué (${entree.compte}/${max}).`);

      return res.status(429).json({
        success: false,
        error: {
          code: 'TROP_DE_REQUETES',
          message:
            message || `Trop de requêtes. Réessayez dans ${attente} seconde(s).`,
        },
      });
    }

    return next();
  };
}

/** Remet les compteurs à zéro (tests). */
export function reinitialiser() {
  compteurs.clear();
}

// ── Seaux prêts à l'emploi ─────────────────────────────────────────

/** Envoi d'OTP : par NUMÉRO, pour ne pas laisser harceler un tiers. */
export const limiteEnvoiOtp = limiter({
  nom: 'otp-envoi',
  max: 5,
  fenetreMs: 15 * 60 * 1000,
  cle: (req) => String(req.body?.telephone || req.ip || 'inconnu'),
  message: 'Trop de demandes de code pour ce numéro. Patientez quelques minutes.',
});

/** Vérification d'OTP : par IP, contre le forçage d'un code. */
export const limiteVerificationOtp = limiter({
  nom: 'otp-verif',
  max: 10,
  fenetreMs: 15 * 60 * 1000,
  message: 'Trop de tentatives de connexion. Patientez quelques minutes.',
});

/** Vérification publique : généreuse, mais borne l'énumération massive. */
export const limiteVerificationPublique = limiter({
  nom: 'verification',
  max: 60,
  fenetreMs: 60 * 1000,
  message: 'Trop de vérifications. Réessayez dans une minute.',
});

/** Dépôt de demande d'intégration : endpoint public non authentifié. */
export const limiteDemandeIntegration = limiter({
  nom: 'demande',
  max: 3,
  fenetreMs: 60 * 60 * 1000,
  message: 'Trop de demandes déposées depuis cette adresse.',
});
