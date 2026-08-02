// ─────────────────────────────────────────────────────────────
// Modèle "personne" — identité nationale d'un diplômé.
//
// Une personne existe indépendamment des établissements : c'est elle qui
// porte le compte de connexion et le portefeuille de diplômes.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, nom, prenom, date_naissance, lieu_naissance, sexe,
                  telephone, email, date_creation`;

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM personnes WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** Le téléphone est l'identifiant naturel d'une personne (quand il est connu). */
export async function trouverParTelephone(telephone) {
  if (!telephone) return null;
  const { rows } = await query(`SELECT ${COLONNES} FROM personnes WHERE telephone = $1`, [
    telephone,
  ]);
  return rows[0] || null;
}

export async function creer(data, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO personnes (nom, prenom, date_naissance, lieu_naissance, sexe, telephone, email)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLONNES}`,
    [
      data.nom,
      data.prenom,
      data.date_naissance || null,
      data.lieu_naissance || null,
      data.sexe || null,
      data.telephone || null,
      data.email || null,
    ]
  );
  return rows[0];
}

/** Fiches étudiant d'une personne, tous établissements confondus. */
export async function listerFiches(personne_id) {
  const { rows } = await query(
    `SELECT c.id, c.numero_etudiant, c.etablissement_id, e.nom AS etablissement_nom
       FROM candidats c
       JOIN etablissements e ON e.id = c.etablissement_id
      WHERE c.personne_id = $1
      ORDER BY e.nom`,
    [personne_id]
  );
  return rows;
}
