// ─────────────────────────────────────────────────────────────
// Modèle "candidat" — requêtes SQL brutes (driver pg), paramétrées.
// Toutes les opérations sont scopées à un établissement.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

// Colonnes RÉELLES. Elles servent aussi aux `RETURNING` : y glisser une
// expression dérivée la ferait entrer dans la corbeille, puis échouer à
// la restauration — `statut_contact` n'existe pas dans la table.
const COLONNES = `id, personne_id, numero_etudiant, nom, prenom, date_naissance, lieu_naissance,
                  sexe, telephone, email, etablissement_id, date_creation`;

// `statut_contact` est DÉRIVÉ, jamais stocké : il n'est rien d'autre que
// « telephone IS NULL ». En faire une colonne inviterait les deux à
// diverger — un étudiant marqué joignable sans numéro, ou l'inverse.
const COLONNES_VUE = `${COLONNES},
                  CASE WHEN telephone IS NULL OR telephone = ''
                       THEN 'en_attente_numero' ELSE 'joignable' END AS statut_contact`;

/**
 * Liste les candidats d'un établissement, avec recherche optionnelle.
 * @param {{ etablissement_id: string, recherche?: string, limit?: number, offset?: number }} opts
 */
export async function lister({ etablissement_id, recherche = '', limit = 50, offset = 0 }) {
  const params = [etablissement_id];
  let filtreRecherche = '';

  if (recherche) {
    params.push(`%${recherche}%`);
    filtreRecherche = `AND (nom ILIKE $${params.length} OR prenom ILIKE $${params.length}
                           OR numero_etudiant ILIKE $${params.length})`;
  }

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${COLONNES_VUE}
       FROM candidats
      WHERE etablissement_id = $1 ${filtreRecherche}
      ORDER BY nom, prenom
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/** Compte les candidats d'un établissement. */
export async function compter(etablissement_id) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM candidats WHERE etablissement_id = $1`,
    [etablissement_id]
  );
  return rows[0].total;
}

/** Récupère un candidat par id (sans filtre d'établissement). */
export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES_VUE} FROM candidats WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Vérifie l'unicité du numéro étudiant au sein d'un établissement.
 * @param {string} etablissement_id
 * @param {string} numero_etudiant
 * @param {string} [exclureId] - id à exclure (cas de modification)
 */
export async function numeroExiste(etablissement_id, numero_etudiant, exclureId = null) {
  const params = [etablissement_id, numero_etudiant];
  let clause = '';
  if (exclureId) {
    params.push(exclureId);
    clause = `AND id <> $${params.length}`;
  }
  const { rows } = await query(
    `SELECT 1 FROM candidats
      WHERE etablissement_id = $1 AND numero_etudiant = $2 ${clause}
      LIMIT 1`,
    params
  );
  return rows.length > 0;
}

/** Crée un candidat. `client` permet de l'inscrire dans une transaction. */
export async function creer(data, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO candidats
       (personne_id, numero_etudiant, nom, prenom, date_naissance, lieu_naissance,
        sexe, telephone, email, etablissement_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${COLONNES}`,
    [
      data.personne_id,
      data.numero_etudiant,
      data.nom,
      data.prenom,
      data.date_naissance || null,
      data.lieu_naissance || null,
      data.sexe || null,
      data.telephone || null,
      data.email || null,
      data.etablissement_id,
    ]
  );
  return rows[0];
}

/** Met à jour un candidat. */
export async function modifier(id, data) {
  const { rows } = await query(
    `UPDATE candidats SET
        numero_etudiant = $2,
        nom = $3,
        prenom = $4,
        date_naissance = $5,
        lieu_naissance = $6,
        sexe = $7,
        telephone = $8,
        email = $9
      WHERE id = $1
      RETURNING ${COLONNES}`,
    [
      id,
      data.numero_etudiant,
      data.nom,
      data.prenom,
      data.date_naissance || null,
      data.lieu_naissance || null,
      data.sexe || null,
      data.telephone || null,
      data.email || null,
    ]
  );
  return rows[0] || null;
}

/** Supprime un candidat. Lève une erreur pg 23503 si des dossiers y sont liés. */
export async function supprimer(id) {
  const { rowCount } = await query(`DELETE FROM candidats WHERE id = $1`, [id]);
  return rowCount > 0;
}
