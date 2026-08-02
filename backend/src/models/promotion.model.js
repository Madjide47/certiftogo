// ─────────────────────────────────────────────────────────────
// Modèle "promotion" — cohorte (filière, niveau, année académique).
// L'établissement propriétaire remonte par jointure filiere → faculte.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `p.id, p.filiere_id, p.annee_id, p.session_id, p.libelle, p.niveau,
                  p.effectif_prevu, p.statut, p.date_creation`;

const JOINTURES = `
       JOIN filieres fi  ON fi.id = p.filiere_id
       JOIN facultes fa  ON fa.id = fi.faculte_id
       JOIN annees_academiques a ON a.id = p.annee_id
  LEFT JOIN sessions_academiques s ON s.id = p.session_id`;

const CHAMPS_JOINTS = `fi.nom AS filiere_nom, fi.code AS filiere_code,
                       fi.type_diplome, fi.duree_annees,
                       fa.id AS faculte_id, fa.nom AS faculte_nom,
                       fa.etablissement_id,
                       a.libelle AS annee_libelle, a.statut AS annee_statut,
                       s.type AS session_type`;

export async function lister({ etablissement_id, annee_id = null, filiere_id = null, statut = null }) {
  const params = [etablissement_id];
  let filtres = '';
  for (const [colonne, valeur] of [
    ['p.annee_id', annee_id],
    ['p.filiere_id', filiere_id],
    ['p.statut', statut],
  ]) {
    if (valeur) {
      params.push(valeur);
      filtres += ` AND ${colonne} = $${params.length}`;
    }
  }

  const { rows } = await query(
    `SELECT ${COLONNES}, ${CHAMPS_JOINTS},
            (SELECT COUNT(*)::int FROM inscriptions i WHERE i.promotion_id = p.id) AS effectif_inscrit
       FROM promotions p ${JOINTURES}
      WHERE fa.etablissement_id = $1 ${filtres}
      ORDER BY a.libelle DESC, fi.nom, p.niveau`,
    params
  );
  return rows;
}

export async function trouverParId(id) {
  const { rows } = await query(
    `SELECT ${COLONNES}, ${CHAMPS_JOINTS},
            (SELECT COUNT(*)::int FROM inscriptions i WHERE i.promotion_id = p.id) AS effectif_inscrit
       FROM promotions p ${JOINTURES}
      WHERE p.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function creer({ filiere_id, annee_id, session_id, libelle, niveau, effectif_prevu, statut }) {
  const { rows } = await query(
    `INSERT INTO promotions (filiere_id, annee_id, session_id, libelle, niveau, effectif_prevu, statut)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [filiere_id, annee_id, session_id, libelle, niveau, effectif_prevu, statut]
  );
  return trouverParId(rows[0].id);
}

export async function modifier(id, { session_id, libelle, niveau, effectif_prevu }) {
  const { rowCount } = await query(
    `UPDATE promotions SET session_id = $2, libelle = $3, niveau = $4, effectif_prevu = $5
      WHERE id = $1`,
    [id, session_id, libelle, niveau, effectif_prevu]
  );
  return rowCount > 0 ? trouverParId(id) : null;
}

export async function changerStatut(id, statut) {
  const { rowCount } = await query(`UPDATE promotions SET statut = $2 WHERE id = $1`, [id, statut]);
  return rowCount > 0 ? trouverParId(id) : null;
}

export async function compterInscriptions(id) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM inscriptions WHERE promotion_id = $1`,
    [id]
  );
  return rows[0].total;
}

export async function supprimer(id) {
  const { rowCount } = await query(`DELETE FROM promotions WHERE id = $1`, [id]);
  return rowCount > 0;
}
