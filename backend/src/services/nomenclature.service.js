// ─────────────────────────────────────────────────────────────
// Nomenclatures — types de diplôme et mentions (P-11).
//
// Ces listes vivaient dans cinq contraintes CHECK et dans un tableau
// JavaScript. Deux sources de vérité pour une même règle : la base
// refusait ce que le code acceptait, ou l'inverse. Elles vivent
// désormais en base, et ce service en est le seul lecteur applicatif.
//
// Le cache est indispensable : sans lui, valider un import de 12 000
// lignes ferait 24 000 requêtes pour relire cinq valeurs. Il est court
// et rechargeable — une nomenclature change par arrêté, pas par minute.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import { nettoyerTexte, versEntier } from '../utils/validators.js';

const DUREE_CACHE_MS = 5 * 60 * 1000;

const cache = {
  types: null,
  mentions: null,
  echeance: 0,
};

/**
 * Valeurs de démarrage.
 *
 * Elles ne sont PAS une seconde source de vérité : elles ne servent que
 * si la base est injoignable au tout premier appel, pour qu'une panne de
 * lecture ne fasse pas refuser toutes les mentions du pays. Elles sont
 * remplacées dès la première lecture réussie.
 */
const REPLI = {
  types: ['bts', 'licence', 'master', 'doctorat', 'certificat'],
  mentions: ['passable', 'assez_bien', 'bien', 'tres_bien', 'excellent'],
};

async function charger() {
  if (cache.types && Date.now() < cache.echeance) return;

  try {
    const [types, mentions] = await Promise.all([
      query(`SELECT code, libelle, niveau, actif FROM types_diplome ORDER BY niveau, code`),
      query(`SELECT code, libelle, seuil_min, ordre, actif FROM mentions ORDER BY ordre`),
    ]);
    cache.types = types.rows;
    cache.mentions = mentions.rows;
    cache.echeance = Date.now() + DUREE_CACHE_MS;
  } catch (err) {
    if (!cache.types) {
      logger.error(`[nomenclature] Lecture impossible, valeurs de repli : ${err.message}`);
      cache.types = REPLI.types.map((code) => ({ code, libelle: code, actif: true }));
      cache.mentions = REPLI.mentions.map((code) => ({ code, libelle: code, actif: true }));
      cache.echeance = Date.now() + 30_000; // on retentera vite
    }
    // Cache déjà chaud : on le garde plutôt que d'échouer.
  }
}

/** Force la relecture — après l'ajout d'un type par le ministère. */
export function invaliderCache() {
  cache.echeance = 0;
}

/** Types de diplôme. `actifsSeuls` pour alimenter un formulaire. */
export async function typesDiplome({ actifsSeuls = false } = {}) {
  await charger();
  return actifsSeuls ? cache.types.filter((t) => t.actif) : cache.types;
}

export async function mentions({ actifsSeuls = false } = {}) {
  await charger();
  return actifsSeuls ? cache.mentions.filter((m) => m.actif) : cache.mentions;
}

/** Codes seuls — ce que la validation compare. */
export async function codesTypesDiplome() {
  return (await typesDiplome()).map((t) => t.code);
}

export async function codesMentions() {
  return (await mentions()).map((m) => m.code);
}

/**
 * Un code inactif reste VALIDE : des diplômes déjà certifiés le portent,
 * et un import rétroactif doit pouvoir le mentionner. « Inactif » retire
 * des formulaires, il ne réécrit pas le passé.
 */
export async function estTypeDiplomeValide(code) {
  if (!code) return true;
  return (await codesTypesDiplome()).includes(code);
}

export async function estMentionValide(code) {
  if (!code) return true;
  return (await codesMentions()).includes(code);
}

// ── Écriture, réservée au ministère ────────────────────────────────

/**
 * Ajoute un type de diplôme.
 *
 * C'est l'objet même de P-11 : un arrêté crée un « DUT » et la
 * plateforme le connaît le jour même, sans migration ni redéploiement.
 */
export async function ajouterTypeDiplome({ code, libelle, niveau }) {
  const codeNet = nettoyerTexte(code)?.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const libelleNet = nettoyerTexte(libelle);

  if (!codeNet || !libelleNet) {
    throw new ErreurApp(400, 'CHAMP_REQUIS', 'Un code et un libellé sont requis.');
  }
  if (codeNet.length > 30) {
    throw new ErreurApp(400, 'CODE_TROP_LONG', 'Le code ne peut pas dépasser 30 caractères.');
  }

  const rang = versEntier(niveau) ?? 0;
  const { rows } = await avecErreursSql(
    () =>
      query(
        `INSERT INTO types_diplome (code, libelle, niveau) VALUES ($1, $2, $3)
         RETURNING code, libelle, niveau, actif`,
        [codeNet, libelleNet, rang]
      ),
    {
      types_diplome_pkey: [
        409,
        'TYPE_EXISTANT',
        'Ce type de diplôme existe déjà. Réactivez-le plutôt que d\'en créer un second.',
      ],
    }
  );

  invaliderCache();
  return rows[0];
}

/**
 * Active ou retire un type de la nomenclature.
 *
 * Retirer n'efface RIEN : des diplômes certifiés portent ce type et leur
 * hash est ancré sur la blockchain. Le type disparaît des formulaires,
 * pas du passé.
 */
export async function definirActifTypeDiplome(code, actif) {
  const { rows } = await query(
    `UPDATE types_diplome SET actif = $2 WHERE code = $1
     RETURNING code, libelle, niveau, actif`,
    [nettoyerTexte(code), actif !== false]
  );
  if (!rows[0]) throw new ErreurApp(404, 'TYPE_INTROUVABLE', 'Type de diplôme inconnu.');

  invaliderCache();
  return rows[0];
}
