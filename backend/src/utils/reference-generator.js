// ─────────────────────────────────────────────────────────────
// Génération des références métier (dossiers, diplômes).
// Formats : CT-AAAA-XXXXX (dossier) et DIP-AAAA-XXXXX (diplôme).
// (Utilisé à partir de la Phase 3 ; défini ici pour cohérence.)
// ─────────────────────────────────────────────────────────────

function suffixeAleatoire(longueur = 5) {
  const max = 10 ** longueur;
  return String(Math.floor(Math.random() * max)).padStart(longueur, '0');
}

/** Référence de dossier : CT-AAAA-XXXXX */
export function genererReferenceDossier(annee = new Date().getFullYear()) {
  return `CT-${annee}-${suffixeAleatoire()}`;
}

/** Référence de diplôme : DIP-AAAA-XXXXX */
export function genererReferenceDiplome(annee = new Date().getFullYear()) {
  return `DIP-${annee}-${suffixeAleatoire()}`;
}
