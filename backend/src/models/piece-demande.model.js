// ─────────────────────────────────────────────────────────────
// Modèle "pièces d'une demande d'intégration" — SQL seul.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, demande_id, type_piece, libelle, nom_fichier, chemin,
                  type_mime, taille_octets, empreinte, date_depot`;

export async function creer(piece) {
  const { rows } = await query(
    `INSERT INTO pieces_demande
       (demande_id, type_piece, libelle, nom_fichier, chemin, type_mime,
        taille_octets, empreinte)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLONNES}`,
    [
      piece.demande_id,
      piece.type_piece,
      piece.libelle || null,
      piece.nom_fichier,
      piece.chemin,
      piece.type_mime,
      piece.taille_octets,
      piece.empreinte,
    ]
  );
  return rows[0];
}

export async function trouverParId(id) {
  const { rows } = await query(`SELECT ${COLONNES} FROM pieces_demande WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function listerParDemande(demande_id) {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM pieces_demande
      WHERE demande_id = $1 ORDER BY type_piece, date_depot`,
    [demande_id]
  );
  return rows;
}

/** Codes des types déjà déposés — sert à dire ce qui manque encore. */
export async function typesDeposes(demande_id) {
  const { rows } = await query(
    `SELECT DISTINCT type_piece FROM pieces_demande WHERE demande_id = $1`,
    [demande_id]
  );
  return rows.map((r) => r.type_piece);
}

export async function supprimer(id) {
  const { rows } = await query(
    `DELETE FROM pieces_demande WHERE id = $1 RETURNING ${COLONNES}`,
    [id]
  );
  return rows[0] || null;
}
