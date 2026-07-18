// ─────────────────────────────────────────────────────────────
// Service "hash" — empreinte SHA-256 déterministe des données d'un diplôme.
// La sérialisation est *canonique* (clés triées récursivement) afin que le
// même contenu produise toujours la même empreinte, indépendamment de l'ordre
// des propriétés. C'est cette empreinte qui est signée et ancrée en blockchain.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

/** Sérialise une valeur JSON de façon canonique (clés d'objet triées). */
export function serialiserCanonique(valeur) {
  if (valeur === null || typeof valeur !== 'object') {
    return JSON.stringify(valeur ?? null);
  }
  if (Array.isArray(valeur)) {
    return `[${valeur.map(serialiserCanonique).join(',')}]`;
  }
  const cles = Object.keys(valeur).sort();
  const paires = cles.map((c) => `${JSON.stringify(c)}:${serialiserCanonique(valeur[c])}`);
  return `{${paires.join(',')}}`;
}

/** Calcule le hash SHA-256 (hex, 64 caractères) d'un objet de données. */
export function calculerHash(donnees) {
  const canonique = serialiserCanonique(donnees);
  return crypto.createHash('sha256').update(canonique, 'utf8').digest('hex');
}
