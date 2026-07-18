// ─────────────────────────────────────────────────────────────
// Service "vérification" — vérification publique d'un diplôme (sans compte).
// Recherche par empreinte SHA-256 (64 hex) OU par référence DIP-AAAA-XXXXX,
// journalise la tentative, et renvoie un résultat public (sans données
// sensibles comme la signature ou le snapshot complet).
// ─────────────────────────────────────────────────────────────
import * as diplomeModel from '../models/diplome.model.js';
import * as verificationModel from '../models/verification.model.js';
import * as blockchain from './blockchain.service.js';

const METHODES = ['hash', 'qr', 'pdf'];
const RE_HASH = /^[0-9a-f]{64}$/i;

/** Vue publique d'un diplôme (champs non sensibles uniquement). */
function vuePublique(d, resultat) {
  return {
    resultat, // 'authentique' | 'revoque'
    reference: d.reference,
    statut: d.statut,
    titulaire: `${d.candidat_prenom || ''} ${d.candidat_nom || ''}`.trim(),
    type_diplome: d.type_diplome,
    mention: d.mention,
    filiere: d.filiere,
    etablissement: d.etablissement_nom,
    date_certification: d.date_certification,
    hash: d.hash_sha256,
    transaction_id: d.transaction_id,
    motif_revocation: d.statut === 'revoque' ? d.motif_revocation : null,
  };
}

/**
 * Vérifie un diplôme par sa valeur (hash ou référence).
 * @param {string} valeur - empreinte SHA-256 ou référence DIP-AAAA-XXXXX
 * @param {{ methode?: string, ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>} résultat public
 */
export async function verifier(valeur, { methode = 'hash', ip = null, userAgent = null } = {}) {
  const cle = typeof valeur === 'string' ? valeur.trim() : '';
  const methodeValide = METHODES.includes(methode) ? methode : 'hash';

  let diplome = null;
  if (cle) {
    diplome = RE_HASH.test(cle)
      ? await diplomeModel.trouverParHash(cle.toLowerCase())
      : await diplomeModel.trouverParReference(cle.toUpperCase());
  }

  const resultat = !diplome ? 'introuvable' : diplome.statut === 'revoque' ? 'revoque' : 'authentique';

  // Journalisation (best-effort : ne bloque pas la réponse en cas d'échec).
  try {
    await verificationModel.enregistrer({
      diplome_id: diplome?.id || null,
      hash_recherche: cle.slice(0, 120),
      methode: methodeValide,
      adresse_ip: ip,
      user_agent: userAgent,
      resultat,
    });
  } catch {
    /* on n'échoue pas la vérification si le log échoue */
  }

  if (!diplome) return { resultat: 'introuvable' };

  const vue = vuePublique(diplome, resultat);
  vue.ancrage_blockchain = await lireAncrage(diplome.hash_sha256);
  return vue;
}

/**
 * Lit l'état ancré on-chain (mode onchain). Best-effort : si le nœud est
 * injoignable ou le mode est "mock", renvoie un objet indicatif sans échouer.
 * @returns {Promise<{ verifie: boolean, valide?: boolean, revoque?: boolean,
 *   date_certification?: number|null } | null>}
 */
async function lireAncrage(hash) {
  if (!blockchain.estOnChain()) {
    return { verifie: false, mode: 'mock' };
  }
  try {
    const onchain = await blockchain.verifierOnChain(hash);
    if (!onchain || !onchain.existe) return { verifie: true, ancre: false };
    return {
      verifie: true,
      ancre: true,
      valide: onchain.valide,
      revoque: onchain.revoque,
      date_certification: onchain.dateCertification,
    };
  } catch {
    // Nœud injoignable : on ne bloque pas la vérification DB.
    return { verifie: false, indisponible: true };
  }
}
