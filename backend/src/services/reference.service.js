// ─────────────────────────────────────────────────────────────
// Attribution des références métier — CT-AAAA-XXXXX (dossier),
// DIP-AAAA-XXXXX (diplôme), DI-AAAA-XXXXX (demande d'intégration),
// LOT-AAAA-XXXXX (lot de transmission).
//
// Le tirage aléatoire sur cinq chiffres a été abandonné : voir la
// migration 020 pour le raisonnement complet. En résumé, 100 000
// valeurs ne suffisent pas à numéroter 12 000 dossiers sans collision,
// et « vérifier puis insérer » laisse une fenêtre entre les deux.
//
// Le compteur est incrémenté en une seule écriture, qui verrouille sa
// ligne le temps de la transaction. Deux établissements qui transmettent
// simultanément obtiennent donc deux plages disjointes.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';
import { ErreurApp } from '../utils/errors.js';

const PREFIXES = ['CT', 'DIP', 'DI', 'LOT'];

/** Longueur minimale du suffixe. Au-delà, la référence s'allonge. */
const LARGEUR = 5;

/**
 * Réserve `nombre` références consécutives et les rend formatées.
 *
 * Réserver un bloc plutôt que boucler n'est pas une optimisation de
 * confort : une promotion de 12 000 demanderait sinon 12 000 allers-
 * retours, chacun susceptible d'entrer en concurrence avec un autre
 * établissement. Ici, un seul.
 *
 * Les numéros sont consommés même si la transaction appelante échoue
 * ensuite. C'est délibéré : un trou dans la numérotation ne gêne
 * personne, une référence réattribuée casserait un QR code déjà imprimé.
 *
 * @param {'CT'|'DIP'|'DI'|'LOT'} prefixe
 * @param {number} [nombre=1]
 * @param {import('pg').PoolClient} [client] - pour rester dans une transaction
 * @param {number} [annee]
 * @returns {Promise<string[]>}
 */
export async function reserver(prefixe, nombre = 1, client = null, annee = new Date().getFullYear()) {
  if (!PREFIXES.includes(prefixe)) {
    throw new ErreurApp(500, 'PREFIXE_INCONNU', `Préfixe de référence inconnu : ${prefixe}.`);
  }
  if (!Number.isInteger(nombre) || nombre < 1) {
    throw new ErreurApp(500, 'NOMBRE_INVALIDE', 'Le nombre de références à réserver doit être un entier positif.');
  }

  const executer = client ? client.query.bind(client) : query;

  // `ON CONFLICT DO UPDATE` couvre les deux cas d'un seul geste : la
  // première référence de l'année crée la ligne, les suivantes
  // l'incrémentent. Une lecture préalable rouvrirait la fenêtre qu'on
  // cherche justement à fermer.
  const { rows } = await executer(
    `INSERT INTO compteurs_reference (prefixe, annee, dernier)
     VALUES ($1, $2, $3)
     ON CONFLICT (prefixe, annee)
       DO UPDATE SET dernier = compteurs_reference.dernier + $3,
                     modifie_le = now()
     RETURNING dernier`,
    [prefixe, annee, nombre]
  );

  const dernier = Number(rows[0].dernier);
  const premier = dernier - nombre + 1;

  return Array.from({ length: nombre }, (_, i) =>
    `${prefixe}-${annee}-${String(premier + i).padStart(LARGEUR, '0')}`
  );
}

/** Réserve une référence unique. */
export async function reserverUne(prefixe, client = null, annee = new Date().getFullYear()) {
  const [reference] = await reserver(prefixe, 1, client, annee);
  return reference;
}
