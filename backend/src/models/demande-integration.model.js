// ─────────────────────────────────────────────────────────────
// Modèle "demande d'intégration" — porte d'entrée d'un établissement.
// Déposée sans compte, instruite par le ministère.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

// `jeton_depot` reste HORS de cette liste : il n'est rendu qu'une fois, à
// la création, et ne doit ressortir d'aucune lecture ordinaire.
const COLONNES = `id, reference, nom, type, statut_juridique, ville, adresse,
                  email, telephone, site_web,
                  representant_nom, representant_prenom, representant_fonction,
                  representant_telephone, representant_email,
                  responsable_nom, responsable_prenom, responsable_telephone,
                  contact_technique_nom, contact_technique_telephone,
                  contact_technique_email,
                  types_diplomes_demandes, message, statut, motif_refus,
                  etablissement_id, agent_ministere_id,
                  date_soumission, date_transmission, date_traitement`;

export async function lister({ statut = null } = {}) {
  const params = [];
  // Sans filtre, les BROUILLONS restent invisibles : un dossier en cours
  // de constitution n'a pas été déposé, le ministère n'a rien à en faire.
  let filtre = `WHERE statut <> 'brouillon'`;
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
       (reference, nom, type, statut_juridique, ville, adresse, email, telephone,
        site_web, representant_nom, representant_prenom, representant_fonction,
        representant_telephone, representant_email,
        responsable_nom, responsable_prenom, responsable_telephone,
        contact_technique_nom, contact_technique_telephone, contact_technique_email,
        types_diplomes_demandes, message, statut, jeton_depot, date_transmission)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
     RETURNING ${COLONNES}`,
    [
      data.reference,
      data.nom,
      data.type,
      data.statut_juridique || null,
      data.ville,
      data.adresse || null,
      data.email,
      data.telephone,
      data.site_web || null,
      data.representant_nom || null,
      data.representant_prenom || null,
      data.representant_fonction || null,
      data.representant_telephone || null,
      data.representant_email || null,
      data.responsable_nom,
      data.responsable_prenom,
      data.responsable_telephone,
      data.contact_technique_nom || null,
      data.contact_technique_telephone || null,
      data.contact_technique_email || null,
      data.types_diplomes_demandes || null,
      data.message || null,
      data.statut || 'soumise',
      data.jeton_depot || null,
      // Un brouillon n'a pas de date de transmission : il n'est pas parti.
      // Calculée ici plutôt qu'en SQL — réutiliser le paramètre `statut`
      // dans un CASE ferait déduire deux types pour le même placeholder.
      (data.statut || 'soumise') === 'brouillon' ? null : new Date(),
    ]
  );
  return rows[0];
}

/**
 * Retrouve une demande par sa référence ET son jeton.
 *
 * Les deux ensemble : la référence seule se devine, le jeton seul ne dit
 * pas de quel dossier il s'agit. C'est ce qui autorise un déposant sans
 * compte à compléter SON dossier, et lui seul.
 */
export async function trouverParJeton(reference, jeton) {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM demandes_integration
      WHERE reference = $1 AND jeton_depot = $2`,
    [reference, jeton]
  );
  return rows[0] || null;
}

/** Dépôt effectif : brouillon → soumise. */
export async function transmettre(id) {
  const { rows } = await query(
    `UPDATE demandes_integration
        SET statut = 'soumise', date_transmission = now()
      WHERE id = $1 AND statut = 'brouillon'
      RETURNING ${COLONNES}`,
    [id]
  );
  return rows[0] || null;
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
