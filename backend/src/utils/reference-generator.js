// ─────────────────────────────────────────────────────────────
// Composition du code officiel d'un établissement.
//
// Les générateurs de références métier vivaient ici. Ils tiraient un
// suffixe au hasard sur cinq chiffres, ce qui ne résiste pas au volume :
// voir `services/reference.service.js` et la migration 020, qui les
// remplacent par un compteur atomique. Ce fichier ne garde que ce qui
// n'a rien à voir avec la numérotation.
// ─────────────────────────────────────────────────────────────

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
