// ─────────────────────────────────────────────────────────────
// Modèle "inscription" — présence d'un étudiant dans une promotion.
// Table historisée : un étudiant cumule une inscription par année d'études.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `i.id, i.candidat_id, i.promotion_id, i.statut, i.moyenne,
                  i.mention, i.date_inscription,
                  i.priorite, i.motif_urgence, i.date_echeance`;

export async function listerParPromotion(promotion_id) {
  const { rows } = await query(
    `SELECT ${COLONNES},
            c.numero_etudiant, c.nom, c.prenom, c.sexe, c.telephone
       FROM inscriptions i
       JOIN candidats c ON c.id = i.candidat_id
      WHERE i.promotion_id = $1
      ORDER BY c.nom, c.prenom`,
    [promotion_id]
  );
  return rows;
}

/** Parcours complet d'un étudiant, de la plus ancienne année à la plus récente. */
export async function listerParCandidat(candidat_id) {
  const { rows } = await query(
    `SELECT ${COLONNES},
            p.libelle AS promotion_libelle, p.niveau,
            fi.nom AS filiere_nom, a.libelle AS annee_libelle
       FROM inscriptions i
       JOIN promotions p ON p.id = i.promotion_id
       JOIN filieres fi  ON fi.id = p.filiere_id
       JOIN annees_academiques a ON a.id = p.annee_id
      WHERE i.candidat_id = $1
      ORDER BY a.libelle, p.niveau`,
    [candidat_id]
  );
  return rows;
}

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM inscriptions i WHERE i.id = $1`, [id]);
  return rows[0] || null;
}

export async function creer({ candidat_id, promotion_id, statut, moyenne, mention }, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO inscriptions (candidat_id, promotion_id, statut, moyenne, mention)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, candidat_id, promotion_id, statut, moyenne, mention, date_inscription`,
    [candidat_id, promotion_id, statut, moyenne ?? null, mention ?? null]
  );
  return rows[0];
}

/** Enregistre le résultat d'un étudiant (statut, moyenne, mention). */
export async function enregistrerResultat(id, { statut, moyenne, mention }) {
  const { rows } = await query(
    `UPDATE inscriptions SET statut = $2, moyenne = $3, mention = $4
      WHERE id = $1
      RETURNING id, candidat_id, promotion_id, statut, moyenne, mention, date_inscription`,
    [id, statut, moyenne, mention]
  );
  return rows[0] || null;
}

/**
 * Urgence déclarée par l'établissement, avant transmission. Elle sera
 * recopiée sur le dossier engendré : l'information est connue ici, elle
 * doit voyager jusqu'à celui qui instruit.
 */
export async function definirPriorite(id, { priorite, motif_urgence, date_echeance }) {
  const { rows } = await query(
    `UPDATE inscriptions
        SET priorite = $2,
            motif_urgence = $3,
            date_echeance = $4
      WHERE id = $1
      RETURNING id, candidat_id, promotion_id, statut, priorite, motif_urgence, date_echeance`,
    [id, priorite, motif_urgence || null, date_echeance || null]
  );
  return rows[0] || null;
}

export async function supprimer(id) {
  const { rowCount } = await query(`DELETE FROM inscriptions WHERE id = $1`, [id]);
  return rowCount > 0;
}
