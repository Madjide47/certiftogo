// ─────────────────────────────────────────────────────────────
// Configuration de la connexion PostgreSQL (pool partagé).
// On utilise le driver `pg` avec des requêtes SQL paramétrées.
// ─────────────────────────────────────────────────────────────
import pg from 'pg';
import dotenv from 'dotenv';
import { parse as analyserUrl } from 'pg-connection-string';

dotenv.config();

const { Pool } = pg;

/**
 * Configuration issue d'une URL de connexion, SANS retomber sur les
 * variables PG* de l'environnement.
 *
 * `{ connectionString }` seul ne suffit pas : `pg` complète les champs
 * absents de l'URL avec `PGHOST`, `PGPORT`, `PGUSER`… Or la procédure de
 * déploiement consiste précisément à viser une base distante DEPUIS un
 * poste local, dont le `.env` porte les valeurs du Docker local. Une URL
 * sans port explicite héritait donc de `PGPORT=5433`, et la connexion
 * partait vers les serveurs de l'hébergeur sur un port qu'ils n'écoutent
 * pas — `ETIMEDOUT`, sans que rien ne désigne la cause.
 *
 * On résout donc l'URL nous-mêmes, et on ne laisse aucun trou à combler.
 */
function depuisUrl(url) {
  const c = analyserUrl(url);
  return {
    host: c.host,
    port: Number(c.port) || 5432,
    database: c.database,
    user: c.user,
    password: c.password,
    // Un hébergeur managé impose TLS. Son certificat est signé par une
    // autorité interne que le poste client ne connaît pas : on chiffre
    // sans exiger la chaîne de confiance, faute de quoi la connexion est
    // refusée. À durcir le jour où l'autorité est distribuée.
    ssl: c.ssl || /sslmode=(require|prefer|verify)/.test(url) ? { rejectUnauthorized: false } : false,
  };
}

// Deux modes de configuration : URL complète OU paramètres séparés.
const poolConfig = process.env.DATABASE_URL
  ? depuisUrl(process.env.DATABASE_URL)
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE || 'certiftogo',
      user: process.env.PGUSER || 'certiftogo',
      password: process.env.PGPASSWORD || 'certiftogo_dev',
    };

export const pool = new Pool(poolConfig);

// Log discret d'une erreur inattendue sur un client inactif du pool.
pool.on('error', (err) => {
  console.error('[db] Erreur inattendue sur le pool PostgreSQL :', err.message);
});

/**
 * Exécute une requête SQL paramétrée.
 * @param {string} text - Requête SQL avec placeholders $1, $2, ...
 * @param {Array} [params] - Valeurs des paramètres
 * @returns {Promise<import('pg').QueryResult>}
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Exécute une suite de requêtes dans une transaction (BEGIN/COMMIT/ROLLBACK).
 * @param {(client: import('pg').PoolClient) => Promise<any>} travail
 * @returns {Promise<any>} la valeur renvoyée par `travail`
 */
export async function withTransaction(travail) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await travail(client);
    await client.query('COMMIT');
    return resultat;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Vérifie que la base répond (utilisé par la route /health). */
export async function verifierConnexion() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

export default pool;
