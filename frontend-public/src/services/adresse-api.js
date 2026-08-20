// ─────────────────────────────────────────────────────────────
// Adresse de l'API, déduite à l'EXÉCUTION.
//
// POURQUOI ELLE N'EST PLUS FIGÉE À LA COMPILATION
// Vite inscrit `import.meta.env` en dur dans le bundle. L'adresse de
// l'API y devenait donc une constante de build : changer de réseau —
// passer du Wi-Fi au partage de connexion, ou l'inverse — laissait les
// fronts appeler une adresse qui ne répondait plus. Plus rien ne
// fonctionnait, pas même la connexion, et la seule issue était de tout
// reconstruire.
//
// Or l'information est déjà là, gratuitement : la page a été servie par
// une machine, et l'API tourne sur cette même machine. On la lit dans
// `window.location` plutôt que de la deviner à l'avance. Ouvrir le
// back-office sur `localhost`, sur `192.168.1.72` ou sur n'importe quelle
// autre adresse fonctionne alors sans rien reconstruire.
//
// `VITE_API_URL` reste prioritaire quand elle est fournie : un
// déploiement réel sépare l'API et le front sur deux domaines, et là
// seule une valeur explicite peut le dire.
// ─────────────────────────────────────────────────────────────

/** Port de l'API. Configurable au build pour un déploiement particulier. */
const PORT_API = import.meta.env.VITE_API_PORT || '4000';

export function adresseApi() {
  const explicite = import.meta.env.VITE_API_URL;
  if (explicite) return explicite;

  // Hors navigateur (tests, rendu serveur) : repli sur la boucle locale.
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return `http://localhost:${PORT_API}/api`;
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${PORT_API}/api`;
}

/** Racine des fichiers servis en statique (PDF, QR) : l'API sans `/api`. */
export function adresseFichiers() {
  return adresseApi().replace(/\/api\/?$/, '');
}

/**
 * Adresse d'un fichier à partir du chemin stocké en base.
 *
 * Les URL de PDF et de QR sont figées à la certification, avec l'origine
 * qu'avait le serveur ce jour-là. Elle ne veut rien dire ailleurs : sur un
 * autre appareil, `localhost` désigne cet appareil. On ne retient donc que
 * le chemin. La base dit *quel* fichier, le client sait *où* il est servi.
 */
export function urlFichier(chemin) {
  if (!chemin) return null;

  // La racine peut être VIDE : quand l'API est servie sur la même origine
  // (`VITE_API_URL=/api`, relayée par nginx), retirer le `/api` ne laisse
  // rien. Le fichier se demande alors en chemin relatif, ce qui est
  // exactement ce qu'on veut — même hôte, même port.
  const racine = adresseFichiers();

  // Il faut néanmoins une base valide pour isoler le chemin d'une URL
  // absolue figée en base : `new URL(x, '')` lève.
  const base =
    racine || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

  try {
    return `${racine}${new URL(chemin, base).pathname}`;
  } catch {
    return `${racine}${chemin.startsWith('/') ? chemin : `/${chemin}`}`;
  }
}
