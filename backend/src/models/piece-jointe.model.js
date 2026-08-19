// ─────────────────────────────────────────────────────────────
// Modèle "pièces jointes" — accès SQL, aucune règle métier.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, candidat_id, promotion_id, etablissement_id, type_piece, libelle,
                  nom_fichier, chemin, type_mime, taille_octets, empreinte, statut,
                  motif_rejet, deposee_par_id, agent_ministere_id,
                  date_depot, date_consultation, date_decision`;

export async function creer(piece, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO pieces_jointes
       (candidat_id, promotion_id, etablissement_id, type_piece, libelle,
        nom_fichier, chemin, type_mime, taille_octets, empreinte, deposee_par_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${COLONNES}`,
    [
      piece.candidat_id || null,
      piece.promotion_id || null,
      piece.etablissement_id,
      piece.type_piece,
      piece.libelle || null,
      piece.nom_fichier,
      piece.chemin,
      piece.type_mime,
      piece.taille_octets,
      piece.empreinte,
      piece.deposee_par_id || null,
    ]
  );
  return rows[0];
}

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM pieces_jointes WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function listerParCandidat(candidat_id) {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM pieces_jointes
      WHERE candidat_id = $1 ORDER BY type_piece, date_depot DESC`,
    [candidat_id]
  );
  return rows;
}

export async function listerParPromotion(promotion_id) {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM pieces_jointes
      WHERE promotion_id = $1 ORDER BY type_piece, date_depot DESC`,
    [promotion_id]
  );
  return rows;
}

/**
 * Toutes les pièces rattachées à un lot : celles de la promotion et
 * celles de chacun des étudiants qui le composent. C'est la vue dont le
 * ministère a besoin pour instruire.
 */
export async function listerParLot(lot_id) {
  const { rows } = await query(
    `SELECT p.id, p.candidat_id, p.promotion_id, p.etablissement_id, p.type_piece,
            p.libelle, p.nom_fichier, p.type_mime, p.taille_octets, p.empreinte,
            p.statut, p.motif_rejet, p.date_depot, p.date_consultation, p.date_decision,
            c.nom AS candidat_nom, c.prenom AS candidat_prenom,
            c.numero_etudiant, d.reference AS dossier_reference, d.id AS dossier_id
       FROM pieces_jointes p
       LEFT JOIN candidats c ON c.id = p.candidat_id
       LEFT JOIN dossiers  d ON d.candidat_id = p.candidat_id AND d.lot_id = $1
      WHERE p.promotion_id = (SELECT promotion_id FROM lots_transmission WHERE id = $1)
         OR p.candidat_id IN (SELECT candidat_id FROM dossiers WHERE lot_id = $1)
      ORDER BY p.candidat_id NULLS FIRST, c.nom, c.prenom, p.type_piece`,
    [lot_id]
  );
  return rows;
}

/**
 * Les pièces qui fondent UN dossier : celles de son titulaire, plus les
 * actes collectifs de la promotion dont il relève. Un dossier ne se juge
 * pas sur le seul relevé de notes — sans le procès-verbal, rien ne dit
 * qu'un jury a délibéré.
 */
export async function listerParDossier(dossier_id) {
  const { rows } = await query(
    `SELECT p.id, p.candidat_id, p.promotion_id, p.etablissement_id, p.type_piece,
            p.libelle, p.nom_fichier, p.type_mime, p.taille_octets, p.empreinte,
            p.statut, p.motif_rejet, p.date_depot, p.date_consultation, p.date_decision,
            c.nom AS candidat_nom, c.prenom AS candidat_prenom, c.numero_etudiant
       FROM pieces_jointes p
       LEFT JOIN candidats c ON c.id = p.candidat_id
      WHERE p.candidat_id = (SELECT candidat_id FROM dossiers WHERE id = $1)
         OR p.promotion_id = (SELECT l.promotion_id
                                FROM dossiers d
                                JOIN lots_transmission l ON l.id = d.lot_id
                               WHERE d.id = $1)
      ORDER BY p.candidat_id NULLS FIRST, p.type_piece, p.date_depot DESC`,
    [dossier_id]
  );
  return rows;
}

/** Synthèse par statut, pour dire en un coup d'œil ce qui reste à examiner. */
export async function compterParStatutPourLot(lot_id) {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total
       FROM pieces_jointes
      WHERE promotion_id = (SELECT promotion_id FROM lots_transmission WHERE id = $1)
         OR candidat_id IN (SELECT candidat_id FROM dossiers WHERE lot_id = $1)
      GROUP BY statut`,
    [lot_id]
  );
  return Object.fromEntries(rows.map((r) => [r.statut, r.total]));
}

/** Types de pièces présents pour chaque candidat d'un lot. */
export async function typesParCandidatPourLot(lot_id) {
  const { rows } = await query(
    `SELECT candidat_id, array_agg(DISTINCT type_piece) AS types
       FROM pieces_jointes
      WHERE candidat_id IN (SELECT candidat_id FROM dossiers WHERE lot_id = $1)
      GROUP BY candidat_id`,
    [lot_id]
  );
  return new Map(rows.map((r) => [r.candidat_id, r.types]));
}

export async function marquerVue(id, agent_ministere_id) {
  const { rows } = await query(
    `UPDATE pieces_jointes
        SET statut = 'vue', agent_ministere_id = $2, date_consultation = now()
      WHERE id = $1 AND statut = 'deposee'
      RETURNING ${COLONNES}`,
    [id, agent_ministere_id]
  );
  return rows[0] || null;
}

export async function decider(id, { statut, motif_rejet, agent_ministere_id }) {
  const { rows } = await query(
    `UPDATE pieces_jointes
        SET statut = $2, motif_rejet = $3, agent_ministere_id = $4,
            date_decision = now(),
            date_consultation = COALESCE(date_consultation, now())
      WHERE id = $1
      RETURNING ${COLONNES}`,
    [id, statut, motif_rejet || null, agent_ministere_id || null]
  );
  return rows[0] || null;
}

export async function supprimer(id) {
  const { rows } = await query(
    `DELETE FROM pieces_jointes WHERE id = $1 RETURNING ${COLONNES}`,
    [id]
  );
  return rows[0] || null;
}
