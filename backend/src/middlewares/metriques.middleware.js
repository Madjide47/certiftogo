// ─────────────────────────────────────────────────────────────
// Métriques d'exploitation (CDC §27.4).
//
// Compteurs en mémoire, remis à zéro au redémarrage : l'objectif est de
// répondre à « la plateforme va-t-elle bien en ce moment ? », pas de
// tenir un historique — c'est le rôle du journal d'audit.
//
// On garde les 500 derniers temps de réponse pour calculer une médiane
// et un 95e centile : une moyenne seule masque les requêtes lentes.
// ─────────────────────────────────────────────────────────────

const TAILLE_ECHANTILLON = 500;

const etat = {
  demarrage: Date.now(),
  total: 0,
  erreurs_client: 0, // 4xx
  erreurs_serveur: 0, // 5xx
  durees: [],
  parRoute: new Map(),
};

/** Normalise le chemin : /api/lots/<uuid> → /api/lots/:id */
function motif(req) {
  const chemin = (req.baseUrl || '') + (req.route?.path || req.path || '');
  return chemin
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n') || '/';
}

export function metriques(req, res, suite) {
  const debut = process.hrtime.bigint();

  res.on('finish', () => {
    const duree = Number(process.hrtime.bigint() - debut) / 1e6; // ms

    etat.total += 1;
    if (res.statusCode >= 500) etat.erreurs_serveur += 1;
    else if (res.statusCode >= 400) etat.erreurs_client += 1;

    etat.durees.push(duree);
    if (etat.durees.length > TAILLE_ECHANTILLON) etat.durees.shift();

    const cle = `${req.method} ${motif(req)}`;
    const ligne = etat.parRoute.get(cle) || { appels: 0, duree_totale: 0, erreurs: 0 };
    ligne.appels += 1;
    ligne.duree_totale += duree;
    if (res.statusCode >= 400) ligne.erreurs += 1;
    etat.parRoute.set(cle, ligne);
  });

  return suite();
}

function centile(valeurs, part) {
  if (valeurs.length === 0) return null;
  const triees = [...valeurs].sort((a, b) => a - b);
  const index = Math.min(triees.length - 1, Math.floor(part * triees.length));
  return Math.round(triees[index] * 100) / 100;
}

/** Instantané destiné au tableau de bord administrateur. */
export function instantane() {
  const routes = [...etat.parRoute.entries()]
    .map(([route, l]) => ({
      route,
      appels: l.appels,
      duree_moyenne_ms: Math.round((l.duree_totale / l.appels) * 100) / 100,
      erreurs: l.erreurs,
    }))
    .sort((a, b) => b.appels - a.appels)
    .slice(0, 10);

  return {
    uptime_secondes: Math.round((Date.now() - etat.demarrage) / 1000),
    requetes_total: etat.total,
    erreurs_client: etat.erreurs_client,
    erreurs_serveur: etat.erreurs_serveur,
    taux_erreur_serveur:
      etat.total === 0 ? 0 : Math.round((etat.erreurs_serveur / etat.total) * 10000) / 100,
    temps_reponse_ms: {
      median: centile(etat.durees, 0.5),
      p95: centile(etat.durees, 0.95),
      echantillon: etat.durees.length,
    },
    routes_les_plus_appelees: routes,
  };
}

export function reinitialiser() {
  etat.total = 0;
  etat.erreurs_client = 0;
  etat.erreurs_serveur = 0;
  etat.durees = [];
  etat.parRoute.clear();
}
