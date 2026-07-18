// ─────────────────────────────────────────────────────────────
// Configuration de la connexion PostgreSQL (pool partagé).
// On utilise le driver `pg` avec des requêtes SQL paramétrées.
// ─────────────────────────────────────────────────────────────
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Deux modes de configuration : URL complète OU paramètres séparés.
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
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
