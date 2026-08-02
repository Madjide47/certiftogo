// ─────────────────────────────────────────────────────────────
// Requêtes des tableaux de bord (CDC chapitre 27).
//
// Toutes les agrégations vivent ici, en SQL : calculer côté Node
// obligerait à charger des dizaines de milliers de lignes pour en
// compter quelques-unes.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

// ── Ministère ──────────────────────────────────────────────────────

/** Volumes de certification : total, aujourd'hui, semaine, mois. */
export async function volumesCertification() {
  const { rows } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE statut <> 'revoque')::int                        AS total_actifs,
        COUNT(*) FILTER (WHERE statut = 'revoque')::int                          AS total_revoques,
        COUNT(*) FILTER (WHERE statut = 'en_attente_ancrage')::int               AS en_attente_ancrage,
        COUNT(*) FILTER (WHERE date_certification >= date_trunc('day', now()))::int   AS aujourd_hui,
        COUNT(*) FILTER (WHERE date_certification >= date_trunc('week', now()))::int  AS cette_semaine,
        COUNT(*) FILTER (WHERE date_certification >= date_trunc('month', now()))::int AS ce_mois,
        COUNT(*)::int                                                            AS total
       FROM diplomes`
  );
  return rows[0];
}

/** Établissements les plus actifs — classement du ministère. */
export async function topEtablissements(limite = 10) {
  const { rows } = await query(
    `SELECT e.code, e.nom,
            COUNT(d.id)::int AS diplomes,
            COUNT(d.id) FILTER (WHERE d.statut = 'revoque')::int AS revoques,
            MAX(d.date_certification) AS derniere_certification
       FROM etablissements e
       LEFT JOIN diplomes d ON d.etablissement_id = e.id
      GROUP BY e.code, e.nom
     HAVING COUNT(d.id) > 0
      ORDER BY diplomes DESC
      LIMIT $1`,
    [limite]
  );
  return rows;
}

/**
 * Délai moyen entre la transmission d'un dossier et sa certification.
 * C'est l'indicateur de performance du ministère : il mesure ce que
 * l'usager attend réellement.
 */
export async function delaiCertification(etablissement_id = null) {
  const params = [];
  let filtre = '';
  if (etablissement_id) {
    params.push(etablissement_id);
    filtre = `AND do2.etablissement_id = $1`;
  }
  const { rows } = await query(
    `SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (d.date_certification - do2.date_transmission)) / 86400)::numeric, 2) AS jours_moyen,
        ROUND(MIN(EXTRACT(EPOCH FROM (d.date_certification - do2.date_transmission)) / 86400)::numeric, 2) AS jours_min,
        ROUND(MAX(EXTRACT(EPOCH FROM (d.date_certification - do2.date_transmission)) / 86400)::numeric, 2) AS jours_max,
        COUNT(*)::int AS echantillon
       FROM diplomes d
       JOIN dossiers do2 ON do2.id = d.dossier_id
      WHERE do2.date_transmission IS NOT NULL ${filtre}`,
    params
  );
  return rows[0];
}

/** Taux de rejet, avec les motifs agrégés. */
export async function tauxRejet(etablissement_id = null) {
  const params = [];
  let filtre = '';
  if (etablissement_id) {
    params.push(etablissement_id);
    filtre = `WHERE etablissement_id = $1`;
  }
  const { rows } = await query(
    `SELECT
        COUNT(*)::int AS total_instruits,
        COUNT(*) FILTER (WHERE statut = 'rejete')::int AS rejetes,
        CASE WHEN COUNT(*) = 0 THEN 0
             ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE statut = 'rejete') / COUNT(*), 2)
        END AS taux_pourcent
       FROM dossiers ${filtre}`,
    params
  );
  return rows[0];
}

/** Motifs de rejet les plus fréquents — dit à l'établissement quoi corriger. */
export async function motifsRejet(etablissement_id = null, limite = 10) {
  const params = [];
  let filtre = `WHERE statut = 'rejete' AND motif_rejet IS NOT NULL`;
  if (etablissement_id) {
    params.push(etablissement_id);
    filtre += ` AND etablissement_id = $1`;
  }
  params.push(limite);
  const { rows } = await query(
    `SELECT motif_rejet AS motif, COUNT(*)::int AS occurrences
       FROM dossiers ${filtre}
      GROUP BY motif_rejet
      ORDER BY occurrences DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function repartitionDiplomes(etablissement_id = null) {
  const params = [];
  let filtre = '';
  if (etablissement_id) {
    params.push(etablissement_id);
    filtre = `AND d.etablissement_id = $1`;
  }
  const { rows } = await query(
    `SELECT COALESCE(do2.type_diplome, 'non_precise') AS type_diplome,
            COALESCE(do2.filiere, 'non_precisee')     AS filiere,
            COUNT(*)::int AS total
       FROM diplomes d
       JOIN dossiers do2 ON do2.id = d.dossier_id
      WHERE TRUE ${filtre}
      GROUP BY 1, 2
      ORDER BY total DESC`,
    params
  );
  return rows;
}

/** Vérifications publiques par jour, sur une fenêtre glissante. */
export async function verificationsParJour(jours = 30) {
  const { rows } = await query(
    `SELECT date_trunc('day', date_verification)::date AS jour,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE resultat = 'authentique')::int AS authentiques,
            COUNT(*) FILTER (WHERE resultat = 'introuvable')::int AS introuvables,
            COUNT(*) FILTER (WHERE resultat = 'revoque')::int AS revoques
       FROM verifications_log
      WHERE date_verification >= now() - ($1 || ' days')::interval
      GROUP BY 1
      ORDER BY 1 DESC`,
    [String(jours)]
  );
  return rows;
}

/** Coût blockchain cumulé, en gaz et en wei. */
export async function coutBlockchain() {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS transactions,
            COUNT(*) FILTER (WHERE statut = 'confirmee')::int AS confirmees,
            COUNT(*) FILTER (WHERE statut = 'echouee')::int AS echouees,
            COALESCE(SUM(gas_used::numeric), 0)::text AS gas_total,
            COALESCE(SUM(gas_used::numeric * gas_price::numeric), 0)::text AS cout_wei
       FROM transactions_blockchain`
  );
  return rows[0];
}

// ── Établissement ──────────────────────────────────────────────────

export async function lotsParStatut(etablissement_id) {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total, SUM(effectif)::int AS etudiants
       FROM lots_transmission
      WHERE etablissement_id = $1
      GROUP BY statut`,
    [etablissement_id]
  );
  return rows;
}

export async function promotionsParStatut(etablissement_id) {
  const { rows } = await query(
    `SELECT p.statut, COUNT(*)::int AS total
       FROM promotions p
       JOIN filieres fi ON fi.id = p.filiere_id
       JOIN facultes fa ON fa.id = fi.faculte_id
      WHERE fa.etablissement_id = $1
      GROUP BY p.statut`,
    [etablissement_id]
  );
  return rows;
}

// ── Candidat ───────────────────────────────────────────────────────

/** Combien de fois les diplômes d'une personne ont été vérifiés. */
export async function verificationsDeMesDiplomes(personne_id) {
  const { rows } = await query(
    `SELECT d.reference,
            COUNT(v.id)::int AS verifications,
            MAX(v.date_verification) AS derniere_verification
       FROM diplomes d
       LEFT JOIN verifications_log v ON v.diplome_id = d.id
      WHERE d.candidat_id IN (SELECT id FROM candidats WHERE personne_id = $1)
      GROUP BY d.reference
      ORDER BY verifications DESC`,
    [personne_id]
  );
  return rows;
}

// ── Administrateur ─────────────────────────────────────────────────

export async function santeBase() {
  const { rows } = await query(
    `SELECT
        (SELECT COUNT(*)::int FROM utilisateurs WHERE actif) AS comptes_actifs,
        (SELECT COUNT(*)::int FROM sessions
          WHERE date_revocation IS NULL AND date_expiration > now()) AS sessions_ouvertes,
        (SELECT COUNT(*)::int FROM etablissements WHERE statut = 'actif') AS etablissements_actifs,
        (SELECT COUNT(*)::int FROM file_attente_ancrage
          WHERE statut IN ('en_attente', 'en_cours', 'echouee')) AS file_ancrage,
        (SELECT COUNT(*)::int FROM file_attente_ancrage WHERE statut = 'abandonnee') AS ancrages_abandonnes,
        (SELECT COUNT(*)::int FROM notifications
          WHERE statut IN ('en_attente', 'echouee') AND canal <> 'in_app') AS notifications_en_attente,
        pg_database_size(current_database()) AS taille_base_octets`
  );
  return rows[0];
}
