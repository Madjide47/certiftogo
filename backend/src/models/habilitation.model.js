// ─────────────────────────────────────────────────────────────
// Modèle "habilitation" — droit de délivrer un type de diplôme.
// C'est ce qui rend possibles les contrôles automatiques à la
// réception d'un lot par le ministère.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, etablissement_id, type_diplome, reference_arrete,
                  date_debut, date_fin, statut, date_creation`;

export async function lister(etablissement_id, { statut = null } = {}) {
  const params = [etablissement_id];
  let filtre = '';
  if (statut) {
    params.push(statut);
    filtre = `AND statut = $2`;
  }
  const { rows } = await query(
    `SELECT ${COLONNES} FROM habilitations
      WHERE etablissement_id = $1 ${filtre}
      ORDER BY type_diplome`,
    params
  );
  return rows;
}

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM habilitations WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Cœur du contrôle automatique : l'établissement a-t-il le droit, à cette
 * date, de délivrer ce type de diplôme ?
 */
export async function estHabilite(etablissement_id, type_diplome, date = null) {
  const { rows } = await query(
    `SELECT 1 FROM habilitations
      WHERE etablissement_id = $1
        AND type_diplome = $2
        AND statut = 'active'
        AND date_debut <= COALESCE($3::date, CURRENT_DATE)
        AND (date_fin IS NULL OR date_fin >= COALESCE($3::date, CURRENT_DATE))
      LIMIT 1`,
    [etablissement_id, type_diplome, date]
  );
  return rows.length > 0;
}

export async function creer(data, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO habilitations
       (etablissement_id, type_diplome, reference_arrete, date_debut, date_fin, statut)
     VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
     RETURNING ${COLONNES}`,
    [
      data.etablissement_id,
      data.type_diplome,
      data.reference_arrete || null,
      data.date_debut || null,
      data.date_fin || null,
      data.statut || 'active',
    ]
  );
  return rows[0];
}

export async function changerStatut(id, statut) {
  const { rows } = await query(
    `UPDATE habilitations SET statut = $2 WHERE id = $1 RETURNING ${COLONNES}`,
    [id, statut]
  );
  return rows[0] || null;
}
