// ─────────────────────────────────────────────────────────────
// Modèle "utilisateur" — requêtes SQL brutes (driver pg).
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

/**
 * Recherche un utilisateur actif par son numéro de téléphone.
 * @param {string} telephone
 * @returns {Promise<object|null>}
 */
export async function trouverParTelephone(telephone) {
  const { rows } = await query(
    `SELECT id, nom, prenom, telephone, role,
            etablissement_id, ministere_id, candidat_id, actif, date_creation
       FROM utilisateurs
      WHERE telephone = $1`,
    [telephone]
  );
  return rows[0] || null;
}

/**
 * Recherche un utilisateur par son identifiant.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function trouverParId(id) {
  const { rows } = await query(
    `SELECT id, nom, prenom, telephone, role,
            etablissement_id, ministere_id, candidat_id, actif, date_creation
       FROM utilisateurs
      WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────
// Gestion administrative des comptes (module admin système).
// ─────────────────────────────────────────────────────────────

/** Liste tous les utilisateurs, avec le libellé du rattachement. */
export async function lister({ role = null } = {}) {
  const params = [];
  let filtre = '';
  if (role) {
    params.push(role);
    filtre = `WHERE u.role = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT u.id, u.nom, u.prenom, u.telephone, u.role,
            u.etablissement_id, u.ministere_id, u.candidat_id,
            u.actif, u.date_creation,
            e.nom AS etablissement_nom, m.nom AS ministere_nom
       FROM utilisateurs u
       LEFT JOIN etablissements e ON e.id = u.etablissement_id
       LEFT JOIN ministeres m ON m.id = u.ministere_id
       ${filtre}
      ORDER BY u.date_creation DESC`,
    params
  );
  return rows;
}

/** Crée un utilisateur (le rattachement est validé côté service). */
export async function creer(data) {
  const { rows } = await query(
    `INSERT INTO utilisateurs
       (nom, prenom, telephone, role, etablissement_id, ministere_id, candidat_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, nom, prenom, telephone, role,
               etablissement_id, ministere_id, candidat_id, actif, date_creation`,
    [
      data.nom,
      data.prenom,
      data.telephone,
      data.role,
      data.etablissement_id || null,
      data.ministere_id || null,
      data.candidat_id || null,
    ]
  );
  return rows[0];
}

/** Active ou désactive un compte. */
export async function definirActif(id, actif) {
  const { rows } = await query(
    `UPDATE utilisateurs SET actif = $2 WHERE id = $1
     RETURNING id, nom, prenom, telephone, role,
               etablissement_id, ministere_id, candidat_id, actif, date_creation`,
    [id, actif]
  );
  return rows[0] || null;
}
