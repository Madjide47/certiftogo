// ─────────────────────────────────────────────────────────────
// Modèle "demande d'intégration" — porte d'entrée d'un établissement.
// Déposée sans compte, instruite par le ministère.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, reference, nom, type, ville, adresse, email, telephone,
                  responsable_nom, responsable_prenom, responsable_telephone,
                  types_diplomes_demandes, message, statut, motif_refus,
                  etablissement_id, agent_ministere_id,
                  date_soumission, date_traitement`;

export async function lister({ statut = null } = {}) {
  const params = [];
  let filtre = '';
  if (statut) {
    params.push(statut);
    filtre = `WHERE statut = $1`;
  }
  const { rows } = await query(
    `SELECT ${COLONNES} FROM demandes_integration ${filtre}
      ORDER BY date_soumission DESC`,
    params
  );
  return rows;
}

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM demandes_integration WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** Suivi public : l'établissement consulte sa demande par sa référence. */
export async function trouverParReference(reference) {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM demandes_integration WHERE reference = $1`,
    [reference]
  );
  return rows[0] || null;
}

export async function creer(data) {
  const { rows } = await query(
    `INSERT INTO demandes_integration
       (reference, nom, type, ville, adresse, email, telephone,
        responsable_nom, responsable_prenom, responsable_telephone,
        types_diplomes_demandes, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${COLONNES}`,
    [
      data.reference,
      data.nom,
      data.type,
      data.ville,
      data.adresse || null,
      data.email,
      data.telephone,
      data.responsable_nom,
      data.responsable_prenom,
      data.responsable_telephone,
      data.types_diplomes_demandes || null,
      data.message || null,
    ]
  );
  return rows[0];
}

/** Enregistre la décision du ministère (examen, acceptation, refus). */
export async function statuer(id, { statut, motif_refus, etablissement_id, agent_ministere_id }, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `UPDATE demandes_integration
        SET statut = $2::text,
            motif_refus = $3,
            etablissement_id = COALESCE($4, etablissement_id),
            agent_ministere_id = $5,
            -- $2 est explicitement typé : sans cela PostgreSQL le déduit à
            -- la fois du SET et du CASE, et refuse la requête.
            date_traitement = CASE WHEN $2::text IN ('acceptee', 'refusee')
                                   THEN now() ELSE date_traitement END
      WHERE id = $1
      RETURNING ${COLONNES}`,
    [id, statut, motif_refus || null, etablissement_id || null, agent_ministere_id || null]
  );
  return rows[0] || null;
}

/** Répartition par statut, pour la file d'attente du ministère. */
export async function compterParStatut() {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total FROM demandes_integration GROUP BY statut`
  );
  return rows;
}
