// ─────────────────────────────────────────────────────────────
// Modèle "fiche étudiant" — les lectures transversales d'une personne.
//
// Les modèles existants répondent chacun à une question de leur module :
// les dossiers d'un établissement, les diplômes d'une personne, les
// inscriptions d'une promotion. Aucun ne répond à « tout ce qui concerne
// CET étudiant », qui est pourtant la question que se pose l'agent quand
// il ouvre une fiche.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

/**
 * Fiche étudiant enrichie de son établissement d'inscription.
 *
 * `candidat.trouverParId` ne rapporte que l'`etablissement_id` : afficher
 * un UUID en tête d'une fiche destinée à être lue n'aiderait personne.
 */
export async function candidatAvecEtablissement(candidat_id) {
  const { rows } = await query(
    `SELECT c.id, c.personne_id, c.numero_etudiant, c.nom, c.prenom,
            c.date_naissance, c.lieu_naissance, c.sexe, c.telephone, c.email,
            c.etablissement_id, c.date_creation,
            e.nom AS etablissement_nom, e.code AS etablissement_code
       FROM candidats c
       JOIN etablissements e ON e.id = c.etablissement_id
      WHERE c.id = $1`,
    [candidat_id]
  );
  return rows[0] || null;
}

/** Dossiers d'un étudiant, du plus récent au plus ancien. */
export async function dossiersDuCandidat(candidat_id) {
  const { rows } = await query(
    `SELECT d.id, d.reference, d.statut, d.type_diplome, d.mention,
            d.filiere, d.parcours, d.annee_academique, d.date_obtention,
            d.motif_rejet, d.date_transmission, d.date_traitement,
            d.priorite, d.motif_urgence, d.date_echeance,
            l.reference AS lot_reference, l.statut AS lot_statut,
            p.libelle AS promotion_libelle
       FROM dossiers d
  LEFT JOIN lots_transmission l ON l.id = d.lot_id
  LEFT JOIN promotions p        ON p.id = d.promotion_id
      WHERE d.candidat_id = $1
      ORDER BY d.date_transmission DESC NULLS LAST, d.reference DESC`,
    [candidat_id]
  );
  return rows;
}

/**
 * Diplômes de la PERSONNE, pas de la fiche étudiant.
 *
 * Un diplômé peut avoir fréquenté deux établissements : ses diplômes
 * sont attachés à des fiches `candidats` distinctes, mais c'est bien le
 * même titulaire. Une fiche qui n'en montrerait que la moitié laisserait
 * croire à un parcours plus court qu'il n'est.
 */
export async function diplomesDeLaPersonne(personne_id) {
  const { rows } = await query(
    `SELECT dip.id, dip.reference, dip.statut, dip.version,
            dip.hash_sha256, dip.pdf_url, dip.qr_code_url,
            dip.date_certification, dip.date_revocation, dip.motif_revocation,
            dos.type_diplome, dos.mention, dos.filiere, dos.annee_academique,
            e.nom AS etablissement_nom
       FROM diplomes dip
       JOIN dossiers dos     ON dos.id = dip.dossier_id
       JOIN candidats c      ON c.id = dip.candidat_id
       JOIN etablissements e ON e.id = dip.etablissement_id
      WHERE c.personne_id = $1
      ORDER BY dip.date_certification DESC`,
    [personne_id]
  );
  return rows;
}

/** Les autres fiches de la même personne — un étudiant, plusieurs écoles. */
export async function fichesDeLaPersonne(personne_id, sauf_candidat_id) {
  const { rows } = await query(
    `SELECT c.id, c.numero_etudiant, c.date_creation,
            e.nom AS etablissement_nom, e.code AS etablissement_code
       FROM candidats c
       JOIN etablissements e ON e.id = c.etablissement_id
      WHERE c.personne_id = $1 AND c.id <> $2
      ORDER BY c.date_creation`,
    [personne_id, sauf_candidat_id]
  );
  return rows;
}

/** Vérifications publiques subies par les diplômes de la personne. */
export async function consultationsDeLaPersonne(personne_id) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total, MAX(v.date_verification) AS derniere
       FROM verifications_log v
       JOIN diplomes dip ON dip.id = v.diplome_id
       JOIN candidats c  ON c.id = dip.candidat_id
      WHERE c.personne_id = $1`,
    [personne_id]
  );
  return rows[0] || { total: 0, derniere: null };
}
