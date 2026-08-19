// ─────────────────────────────────────────────────────────────
// Modèle "file d'attente d'ancrage".
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, diplome_id, lot_id, operation, charge_utile, cle_idempotence,
                  statut, priorite, tentatives, max_tentatives, derniere_erreur,
                  prochaine_tentative, transaction_hash, date_creation, date_traitement`;

/**
 * Enfile une tâche. `ON CONFLICT DO NOTHING` sur la clé d'idempotence :
 * réclamer deux fois le même ancrage ne crée qu'un seul travail.
 */
export async function enfiler(tache, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO file_attente_ancrage
       (diplome_id, lot_id, operation, charge_utile, cle_idempotence, priorite)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (cle_idempotence) DO NOTHING
     RETURNING ${COLONNES}`,
    [
      tache.diplome_id,
      tache.lot_id || null,
      tache.operation,
      JSON.stringify(tache.charge_utile),
      tache.cle_idempotence,
      tache.priorite ?? 5,
    ]
  );
  return rows[0] || null;
}

/**
 * Réserve un lot de tâches dues.
 *
 * `FOR UPDATE SKIP LOCKED` permet à plusieurs workers de consommer la
 * même file sans se marcher dessus : chacun saute les lignes déjà prises
 * par un autre.
 */
export async function reserver(taille = 10) {
  const { rows } = await query(
    `UPDATE file_attente_ancrage
        SET statut = 'en_cours', tentatives = tentatives + 1
      WHERE id IN (
          SELECT id FROM file_attente_ancrage
           WHERE statut IN ('en_attente', 'echouee')
             AND prochaine_tentative <= now()
           ORDER BY priorite, prochaine_tentative
           LIMIT $1
           FOR UPDATE SKIP LOCKED
      )
      RETURNING ${COLONNES}`,
    [taille]
  );
  return rows;
}

export async function marquerConfirmee(id, transaction_hash, client = null) {
  const executer = client ? client.query.bind(client) : query;
  await executer(
    `UPDATE file_attente_ancrage
        SET statut = 'confirmee', transaction_hash = $2, derniere_erreur = NULL,
            date_traitement = now()
      WHERE id = $1`,
    [id, transaction_hash]
  );
}

/**
 * Report exponentiel : 2^tentatives minutes, plafonné à une heure.
 * Au-delà du nombre maximal, la tâche part en file d'abandon (DLQ).
 */
export async function marquerEchouee(id, erreur) {
  const { rows } = await query(
    `UPDATE file_attente_ancrage
        SET statut = CASE WHEN tentatives >= max_tentatives THEN 'abandonnee' ELSE 'echouee' END,
            derniere_erreur = $2,
            prochaine_tentative = now() + LEAST(POWER(2, tentatives) * INTERVAL '1 minute',
                                                INTERVAL '1 hour'),
            date_traitement = CASE WHEN tentatives >= max_tentatives THEN now() ELSE date_traitement END
      WHERE id = $1
      RETURNING statut, tentatives, max_tentatives`,
    [id, String(erreur).slice(0, 2000)]
  );
  return rows[0] || null;
}

/** Progression d'un lot : « 8 245 / 12 000 ancrés ». */
export async function progressionLot(lot_id) {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total
       FROM file_attente_ancrage WHERE lot_id = $1 GROUP BY statut`,
    [lot_id]
  );
  return rows;
}

/** Vue de supervision : état global de la file. */
export async function etatFile() {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total,
            MIN(prochaine_tentative) AS prochaine
       FROM file_attente_ancrage GROUP BY statut`
  );
  return rows;
}

/** Tâches abandonnées — la dead letter queue, à traiter manuellement. */
export async function listerAbandonnees() {
  const { rows } = await query(
    `SELECT f.id, f.diplome_id, f.lot_id, f.operation, f.statut, f.priorite,
            f.tentatives, f.max_tentatives, f.derniere_erreur,
            f.prochaine_tentative, f.date_creation, f.date_traitement,
            d.reference AS diplome_reference
       FROM file_attente_ancrage f
       JOIN diplomes d ON d.id = f.diplome_id
      WHERE f.statut = 'abandonnee'
      ORDER BY f.date_traitement DESC NULLS LAST`
  );
  return rows;
}

/** Remet une tâche abandonnée en file, compteur remis à zéro. */
export async function relancer(id) {
  const { rows } = await query(
    `UPDATE file_attente_ancrage
        SET statut = 'en_attente', tentatives = 0, derniere_erreur = NULL,
            prochaine_tentative = now()
      WHERE id = $1 AND statut = 'abandonnee'
      RETURNING ${COLONNES}`,
    [id]
  );
  return rows[0] || null;
}

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM file_attente_ancrage WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** Coût cumulé du gaz, par établissement — base du suivi budgétaire. */
export async function coutParEtablissement() {
  const { rows } = await query(
    `SELECT e.code, e.nom,
            COUNT(t.id)::int AS transactions,
            COALESCE(SUM(t.gas_used::numeric), 0)::text AS gas_total,
            COALESCE(SUM(t.gas_used::numeric * t.gas_price::numeric), 0)::text AS cout_wei
       FROM transactions_blockchain t
       JOIN diplomes d      ON d.id = t.diplome_id
       JOIN etablissements e ON e.id = d.etablissement_id
      WHERE t.gas_used IS NOT NULL
      GROUP BY e.code, e.nom
      ORDER BY transactions DESC`
  );
  return rows;
}
