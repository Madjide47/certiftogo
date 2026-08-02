// ─────────────────────────────────────────────────────────────
// Joue les migrations du dossier migrations/ dans l'ordre lexical.
//
// Chaque fichier appliqué est enregistré dans la table `schema_migrations`
// et n'est plus rejoué : la base existante et ses données sont préservées.
//
// Usage :
//   node scripts/run-migrations.js           → joue les migrations en attente
//   node scripts/run-migrations.js --reset   → ⚠️ rejoue TOUT (base écrasée)
// ─────────────────────────────────────────────────────────────
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOSSIER_MIGRATIONS = resolve(__dirname, '../migrations');
const reset = process.argv.includes('--reset');

/** Liste les migrations triées par nom (le préfixe numérique fait foi). */
function listerMigrations() {
  return readdirSync(DOSSIER_MIGRATIONS)
    .filter((fichier) => fichier.endsWith('.sql'))
    .sort();
}

/** Indique si une table existe déjà dans la base courante. */
async function tableExiste(nom) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS oid', [nom]);
  return rows[0].oid !== null;
}

try {
  const migrations = listerMigrations();

  if (migrations.length === 0) {
    console.error('❌ Aucune migration trouvée dans migrations/');
    process.exit(1);
  }

  if (reset) {
    // Le suivi est effacé : toutes les migrations repartent de zéro. Chaque
    // fichier commence par ses propres DROP, la base est donc reconstruite.
    await pool.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
    console.log('♻️  Mode --reset : la base va être reconstruite intégralement.');
  }

  const suiviPresent = await tableExiste('schema_migrations');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT PRIMARY KEY,
        applique_le TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Base antérieure au suivi de version : le schéma initial y est déjà en
  // place. On le marque comme appliqué au lieu de le rejouer — sinon ses
  // DROP TABLE effaceraient les données existantes.
  if (!suiviPresent && !reset && (await tableExiste('etablissements'))) {
    await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migrations[0]]);
    console.log(`📌 Base existante détectée — ${migrations[0]} marqué comme déjà appliqué.`);
  }

  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  const appliquees = new Set(rows.map((ligne) => ligne.version));
  const enAttente = migrations.filter((fichier) => !appliquees.has(fichier));

  if (enAttente.length === 0) {
    console.log('✅ Base à jour — aucune migration en attente.');
  }

  for (const fichier of enAttente) {
    const sql = readFileSync(join(DOSSIER_MIGRATIONS, fichier), 'utf8');
    const client = await pool.connect();
    try {
      // Une migration est atomique : soit elle passe entièrement, soit la
      // base reste dans son état précédent.
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [fichier]);
      await client.query('COMMIT');
      console.log(`✅ ${fichier}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${fichier} — ${err.message}`);
    } finally {
      client.release();
    }
  }
} catch (err) {
  console.error(`❌ Migration interrompue : ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
