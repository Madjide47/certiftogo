// ─────────────────────────────────────────────────────────────
// Petit utilitaire pour jouer un fichier .sql contre la base.
// Usage : node scripts/run-sql.js <chemin/vers/fichier.sql>
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool } from '../src/config/database.js';

const fichier = process.argv[2];

if (!fichier) {
  console.error('Usage : node scripts/run-sql.js <fichier.sql>');
  process.exit(1);
}

const chemin = resolve(process.cwd(), fichier);

try {
  const sql = readFileSync(chemin, 'utf8');
  await pool.query(sql);
  console.log(`✅ Fichier SQL exécuté avec succès : ${fichier}`);
} catch (err) {
  console.error(`❌ Échec de l'exécution de ${fichier} :`, err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
