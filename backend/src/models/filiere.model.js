// ─────────────────────────────────────────────────────────────
// Modèle "filière" — cursus rattaché à une faculté.
// L'établissement propriétaire n'est atteignable que par jointure sur
// `facultes` : toutes les lectures le remontent pour permettre au service
// de contrôler l'isolation.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `f.id, f.faculte_id, f.nom, f.code, f.type_diplome, f.duree_annees,
                  f.statut, f.date_creation`;

export async function lister({ etablissement_id, faculte_id = null, statut = null }) {
  const params = [etablissement_id];
  let filtres = '';
  if (faculte_id) {
    params.push(faculte_id);
    filtres += ` AND f.faculte_id = $${params.length}`;
  }
  if (statut) {
    params.push(statut);
    filtres += ` AND f.statut = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT ${COLONNES}, fa.nom AS faculte_nom, fa.etablissement_id
       FROM filieres f
       JOIN facultes fa ON fa.id = f.faculte_id
      WHERE fa.etablissement_id = $1 ${filtres}
      ORDER BY fa.nom, f.nom`,
    params
  );
  return rows;
}

/** Remonte la filière et l'établissement propriétaire (via la faculté). */
export async function trouverParId(id) {
  const { rows } = await query(
    `SELECT ${COLONNES}, fa.nom AS faculte_nom, fa.etablissement_id
       FROM filieres f
       JOIN facultes fa ON fa.id = f.faculte_id
      WHERE f.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function creer({ faculte_id, nom, code, type_diplome, duree_annees, statut }) {
  const { rows } = await query(
    `INSERT INTO filieres (faculte_id, nom, code, type_diplome, duree_annees, statut)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, faculte_id, nom, code, type_diplome, duree_annees, statut, date_creation`,
    [faculte_id, nom, code, type_diplome, duree_annees, statut]
  );
  return rows[0];
}

export async function modifier(id, { nom, code, type_diplome, duree_annees, statut }) {
  const { rows } = await query(
    `UPDATE filieres SET nom = $2, code = $3, type_diplome = $4, duree_annees = $5, statut = $6
      WHERE id = $1
      RETURNING id, faculte_id, nom, code, type_diplome, duree_annees, statut, date_creation`,
    [id, nom, code, type_diplome, duree_annees, statut]
  );
  return rows[0] || null;
}

/** Nombre de promotions rattachées — sert à refuser une suppression. */
export async function compterPromotions(id) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM promotions WHERE filiere_id = $1`,
    [id]
  );
  return rows[0].total;
}

export async function supprimer(id) {
  const { rowCount } = await query(`DELETE FROM filieres WHERE id = $1`, [id]);
  return rowCount > 0;
}
