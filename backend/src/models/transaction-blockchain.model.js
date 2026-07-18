// ─────────────────────────────────────────────────────────────
// Modèle "transaction blockchain" — trace des ancrages on-chain d'un diplôme
// (certification, révocation). Écriture dans une transaction si client fourni.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const exec = (client) => (client ? (t, p) => client.query(t, p) : query);

/** Enregistre une transaction blockchain rattachée à un diplôme. */
export async function creer(data, client) {
  const { rows } = await exec(client)(
    `INSERT INTO transactions_blockchain
       (diplome_id, transaction_hash, block_number, adresse_contrat, statut)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      data.diplome_id,
      data.transaction_hash || null,
      data.block_number ?? null,
      data.adresse_contrat || null,
      data.statut || 'en_attente',
    ]
  );
  return rows[0];
}

/** Liste les transactions d'un diplôme (plus récentes d'abord). */
export async function listerParDiplome(diplome_id) {
  const { rows } = await query(
    `SELECT * FROM transactions_blockchain
      WHERE diplome_id = $1
      ORDER BY date_transaction DESC`,
    [diplome_id]
  );
  return rows;
}
