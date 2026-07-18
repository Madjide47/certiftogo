// ─────────────────────────────────────────────────────────────
// Modèle "dossier" — requêtes SQL brutes (driver pg), paramétrées.
// Un dossier est une candidature de diplôme saisie par un établissement.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

// Colonnes du dossier + infos candidat jointes (préfixées candidat_*).
const SELECT_AVEC_CANDIDAT = `
  d.id, d.reference, d.etablissement_id, d.candidat_id, d.filiere, d.parcours,
  d.mention, d.date_obtention, d.type_diplome, d.annee_academique, d.notes,
  d.statut, d.motif_rejet, d.date_transmission, d.date_traitement,
  c.nom AS candidat_nom, c.prenom AS candidat_prenom,
  c.numero_etudiant AS candidat_numero_etudiant`;

/**
 * Liste les dossiers d'un établissement (filtre statut optionnel).
 * @param {{ etablissement_id: string, statut?: string, limit?: number, offset?: number }} opts
 */
export async function lister({ etablissement_id, statut = null, limit = 50, offset = 0 }) {
  const params = [etablissement_id];
  let filtreStatut = '';
  if (statut) {
    params.push(statut);
    filtreStatut = `AND d.statut = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${SELECT_AVEC_CANDIDAT}
       FROM dossiers d
       JOIN candidats c ON c.id = d.candidat_id
      WHERE d.etablissement_id = $1 ${filtreStatut}
      ORDER BY COALESCE(d.date_transmission, d.date_traitement) DESC NULLS LAST, d.reference DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/** Récupère un dossier par id (avec infos candidat). */
export async function trouverParId(id) {
  const { rows } = await query(
    `SELECT ${SELECT_AVEC_CANDIDAT}
       FROM dossiers d
       JOIN candidats c ON c.id = d.candidat_id
      WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Répartition des dossiers d'un établissement par statut. */
export async function compterParStatut(etablissement_id) {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total
       FROM dossiers
      WHERE etablissement_id = $1
      GROUP BY statut`,
    [etablissement_id]
  );
  return rows; // [{ statut, total }, ...]
}

/** Vérifie l'existence d'une référence (unicité globale). */
export async function referenceExiste(reference) {
  const { rows } = await query(`SELECT 1 FROM dossiers WHERE reference = $1 LIMIT 1`, [reference]);
  return rows.length > 0;
}

/** Crée un dossier (statut brouillon par défaut côté colonne). */
export async function creer(data) {
  const { rows } = await query(
    `INSERT INTO dossiers
       (reference, etablissement_id, candidat_id, filiere, parcours, mention,
        date_obtention, type_diplome, annee_academique, notes, agent_etablissement_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      data.reference,
      data.etablissement_id,
      data.candidat_id,
      data.filiere || null,
      data.parcours || null,
      data.mention || null,
      data.date_obtention || null,
      data.type_diplome || null,
      data.annee_academique || null,
      data.notes ? JSON.stringify(data.notes) : null,
      data.agent_etablissement_id || null,
    ]
  );
  return trouverParId(rows[0].id);
}

/** Met à jour les champs métier d'un dossier (hors statut). */
export async function modifier(id, data) {
  const { rows } = await query(
    `UPDATE dossiers SET
        candidat_id = $2,
        filiere = $3,
        parcours = $4,
        mention = $5,
        date_obtention = $6,
        type_diplome = $7,
        annee_academique = $8,
        notes = $9
      WHERE id = $1
      RETURNING id`,
    [
      id,
      data.candidat_id,
      data.filiere || null,
      data.parcours || null,
      data.mention || null,
      data.date_obtention || null,
      data.type_diplome || null,
      data.annee_academique || null,
      data.notes ? JSON.stringify(data.notes) : null,
    ]
  );
  return rows[0] ? trouverParId(id) : null;
}

/** Transmet un dossier au ministère : statut brouillon → soumis. */
export async function transmettre(id, agent_etablissement_id) {
  const { rows } = await query(
    `UPDATE dossiers SET
        statut = 'soumis',
        date_transmission = now(),
        agent_etablissement_id = $2
      WHERE id = $1
      RETURNING id`,
    [id, agent_etablissement_id]
  );
  return rows[0] ? trouverParId(id) : null;
}

/** Supprime un dossier. */
export async function supprimer(id) {
  const { rowCount } = await query(`DELETE FROM dossiers WHERE id = $1`, [id]);
  return rowCount > 0;
}

// ─────────────────────────────────────────────────────────────
// Vues côté ministère : les dossiers de TOUS les établissements
// (le ministère instruit les dossiers transmis, il n'est pas isolé
// par établissement). On joint le nom de l'établissement émetteur.
// ─────────────────────────────────────────────────────────────

const SELECT_MINISTERE = `
  d.id, d.reference, d.etablissement_id, d.candidat_id, d.filiere, d.parcours,
  d.mention, d.date_obtention, d.type_diplome, d.annee_academique, d.notes,
  d.statut, d.motif_rejet, d.date_transmission, d.date_traitement,
  c.nom AS candidat_nom, c.prenom AS candidat_prenom,
  c.numero_etudiant AS candidat_numero_etudiant,
  e.nom AS etablissement_nom`;

/**
 * Liste les dossiers vus par le ministère (tous établissements).
 * Par défaut, exclut les brouillons (non transmis). Filtre statut optionnel.
 * @param {{ statut?: string, limit?: number, offset?: number }} opts
 */
export async function listerPourMinistere({ statut = null, limit = 50, offset = 0 } = {}) {
  const params = [];
  let filtre = `d.statut <> 'brouillon'`;
  if (statut) {
    params.push(statut);
    filtre = `d.statut = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${SELECT_MINISTERE}
       FROM dossiers d
       JOIN candidats c ON c.id = d.candidat_id
       JOIN etablissements e ON e.id = d.etablissement_id
      WHERE ${filtre}
      ORDER BY d.date_transmission DESC NULLS LAST, d.reference DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/** Récupère un dossier (vue ministère, avec établissement émetteur). */
export async function trouverParIdMinistere(id) {
  const { rows } = await query(
    `SELECT ${SELECT_MINISTERE}
       FROM dossiers d
       JOIN candidats c ON c.id = d.candidat_id
       JOIN etablissements e ON e.id = d.etablissement_id
      WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Répartition de TOUS les dossiers transmis par statut (vue ministère). */
export async function compterParStatutMinistere() {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total
       FROM dossiers
      WHERE statut <> 'brouillon'
      GROUP BY statut`
  );
  return rows;
}

/**
 * Change le statut d'un dossier côté ministère.
 * @param {string} id
 * @param {{ statut: string, motif_rejet?: string|null,
 *           agent_ministere_id?: string|null, marquerTraitement?: boolean }} opts
 */
/**
 * Fixe le statut d'un dossier — variante utilisable dans une transaction
 * (client optionnel). Utilisée par la certification/révocation.
 */
export async function definirStatut(id, statut, client) {
  const exec = client ? (t, p) => client.query(t, p) : query;
  const { rows } = await exec(
    `UPDATE dossiers SET statut = $2 WHERE id = $1 RETURNING id`,
    [id, statut]
  );
  return rows[0] || null;
}

export async function changerStatut(
  id,
  { statut, motif_rejet = null, agent_ministere_id = null, marquerTraitement = false }
) {
  const { rows } = await query(
    `UPDATE dossiers SET
        statut = $2,
        motif_rejet = $3,
        agent_ministere_id = COALESCE($4, agent_ministere_id),
        date_traitement = CASE WHEN $5 THEN now() ELSE date_traitement END
      WHERE id = $1
      RETURNING id`,
    [id, statut, motif_rejet, agent_ministere_id, marquerTraitement]
  );
  return rows[0] ? trouverParIdMinistere(id) : null;
}
