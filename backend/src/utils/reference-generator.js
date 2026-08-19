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

/** Référence de demande d'intégration : DI-AAAA-XXXXX */
export function genererReferenceDemande(annee = new Date().getFullYear()) {
  return `DI-${annee}-${suffixeAleatoire()}`;
}

/**
 * Initiales d'un nom d'établissement, pour composer son code officiel.
 * Miroir exact de la logique de la migration 005, afin qu'un établissement
 * créé aujourd'hui reçoive un code de la même forme que ceux repris.
 *
 *   « Institut Africain d'Informatique » → « IAI »
 *   « École Nationale d'Administration » → « ENA »
 */
export function initialesEtablissement(nom) {
  const sansAccent = String(nom || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const initiales = sansAccent
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/)
    .filter((mot) => mot.length > 2)
    .map((mot) => mot[0].toUpperCase())
    .join('');

  return (initiales || 'ETB').slice(0, 4);
}
