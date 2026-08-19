// ─────────────────────────────────────────────────────────────
// Contexte de requête (AsyncLocalStorage).
//
// La journalisation a besoin de savoir QUI agit, depuis quelle adresse
// et avec quel navigateur. Faire descendre `req` jusque dans chaque
// service polluerait toutes les signatures — et on finirait par oublier
// de le passer quelque part, donc par perdre la trace.
//
// AsyncLocalStorage transporte ces informations le long de la chaîne
// asynchrone : le middleware les dépose, les services les lisent.
// ─────────────────────────────────────────────────────────────
import { AsyncLocalStorage } from 'node:async_hooks';

const stockage = new AsyncLocalStorage();

/** Middleware : ouvre un contexte pour toute la durée de la requête. */
export function contexteRequete(req, res, suite) {
  stockage.run(
    {
      // `req.utilisateur` n'est posé qu'après authJWT ; on lit donc `req`
      // paresseusement plutôt que d'en copier une photo trop tôt.
      req,
      adresse_ip: req.ip || req.socket?.remoteAddress || null,
      user_agent: req.headers['user-agent'] || null,
    },
    () => suite()
  );
}

/** Contexte courant, ou null hors requête (scripts, tests unitaires). */
export function contexteCourant() {
  const contexte = stockage.getStore();
  if (!contexte) return null;

  const u = contexte.req?.utilisateur || null;
  return {
    adresse_ip: contexte.adresse_ip,
    user_agent: contexte.user_agent,
    utilisateur_id: u?.utilisateur_id || null,
    role: u?.role || null,
    etablissement_id: u?.etablissement_id || null,
    utilisateur: u,
  };
}

export default { contexteRequete, contexteCourant };
