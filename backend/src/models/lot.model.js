// ─────────────────────────────────────────────────────────────
// Modèle "lot de transmission" — envoi groupé d'une promotion.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `l.id, l.reference, l.promotion_id, l.etablissement_id,
                  l.agent_emetteur_id, l.agent_ministere_id, l.effectif,
                  l.statut, l.motif_rejet, l.rapport_controles,
                  l.date_transmission, l.date_traitement`;

const JOINTS = `e.nom AS etablissement_nom, e.code AS etablissement_code,
                p.libelle AS promotion_libelle, p.niveau, p.date_deliberation,
                fi.nom AS filiere_nom, fi.type_diplome, fi.duree_annees,
                a.libelle AS annee_libelle,
                ag.nom AS agent_nom, ag.prenom AS agent_prenom`;

const FROM = `FROM lots_transmission l
              JOIN etablissements e     ON e.id = l.etablissement_id
              JOIN promotions p         ON p.id = l.promotion_id
              JOIN filieres fi          ON fi.id = p.filiere_id
              JOIN annees_academiques a ON a.id = p.annee_id
         LEFT JOIN utilisateurs ag      ON ag.id = l.agent_emetteur_id`;

/** File d'attente du ministère : un lot par ligne, pas 250 dossiers. */
export async function lister({ statut = null, etablissement_id = null } = {}) {
  const params = [];
  const filtres = [];
  if (statut) {
    params.push(statut);
    filtres.push(`l.statut = $${params.length}`);
  }
  if (etablissement_id) {
    params.push(etablissement_id);
    filtres.push(`l.etablissement_id = $${params.length}`);
  }
  const where = filtres.length ? `WHERE ${filtres.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT ${COLONNES}, ${JOINTS},
            (SELECT COUNT(*)::int FROM dossiers d WHERE d.lot_id = l.id) AS dossiers_total,
            (SELECT COUNT(*)::int FROM dossiers d WHERE d.lot_id = l.id AND d.statut = 'valide') AS dossiers_valides,
            (SELECT COUNT(*)::int FROM dossiers d WHERE d.lot_id = l.id AND d.statut = 'rejete') AS dossiers_rejetes,
            (SELECT COUNT(*)::int FROM dossiers d WHERE d.lot_id = l.id AND d.statut = 'certifie') AS dossiers_certifies,
            -- Ce qui reste à faire, et ce qui presse : la file du
            -- ministère doit pouvoir se trier sur l'urgence, pas
            -- seulement sur la date d'arrivée.
            (SELECT COUNT(*)::int FROM dossiers d
              WHERE d.lot_id = l.id AND d.statut IN ('soumis', 'en_examen')) AS dossiers_en_attente,
            (SELECT COUNT(*)::int FROM dossiers d
              WHERE d.lot_id = l.id AND d.priorite = 'urgente'
                AND d.statut IN ('soumis', 'en_examen')) AS dossiers_urgents,
            (SELECT MIN(d.date_echeance) FROM dossiers d
              WHERE d.lot_id = l.id AND d.priorite = 'urgente'
                AND d.statut IN ('soumis', 'en_examen')) AS echeance_la_plus_proche
       ${FROM} ${where}
      -- Un lot qui contient une urgence remonte, quelle que soit sa
      -- date d'arrivée : c'est tout l'objet de la priorité.
      ORDER BY (SELECT COUNT(*) FROM dossiers d
                 WHERE d.lot_id = l.id AND d.priorite = 'urgente'
                   AND d.statut IN ('soumis', 'en_examen')) DESC,
               l.date_transmission DESC`,
    params
  );
  return rows;
}

export async function trouverParId(id) {
  const { rows } = await query(
    `SELECT ${COLONNES}, ${JOINTS},
            (SELECT COUNT(*)::int FROM dossiers d WHERE d.lot_id = l.id) AS dossiers_total,
            (SELECT COUNT(*)::int FROM dossiers d WHERE d.lot_id = l.id AND d.statut = 'valide') AS dossiers_valides,
            (SELECT COUNT(*)::int FROM dossiers d WHERE d.lot_id = l.id AND d.statut = 'rejete') AS dossiers_rejetes,
            (SELECT COUNT(*)::int FROM dossiers d WHERE d.lot_id = l.id AND d.statut = 'certifie') AS dossiers_certifies,
            -- Ce qui reste à faire, et ce qui presse : la file du
            -- ministère doit pouvoir se trier sur l'urgence, pas
            -- seulement sur la date d'arrivée.
            (SELECT COUNT(*)::int FROM dossiers d
              WHERE d.lot_id = l.id AND d.statut IN ('soumis', 'en_examen')) AS dossiers_en_attente,
            (SELECT COUNT(*)::int FROM dossiers d
              WHERE d.lot_id = l.id AND d.priorite = 'urgente'
                AND d.statut IN ('soumis', 'en_examen')) AS dossiers_urgents,
            (SELECT MIN(d.date_echeance) FROM dossiers d
              WHERE d.lot_id = l.id AND d.priorite = 'urgente'
                AND d.statut IN ('soumis', 'en_examen')) AS echeance_la_plus_proche
       ${FROM}
      WHERE l.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Dossiers d'un lot, enrichis de tout ce dont les contrôles automatiques
 * ont besoin. Une seule requête : à 12 000 dossiers, une requête par
 * dossier serait rédhibitoire.
 */
export async function listerDossiers(lot_id) {
  const { rows } = await query(
    `SELECT d.id, d.reference, d.statut, d.type_diplome, d.mention,
            d.date_obtention, d.filiere, d.annee_academique, d.motif_rejet,
            d.priorite, d.motif_urgence, d.date_echeance,
            c.id AS candidat_id, c.numero_etudiant, c.nom, c.prenom,
            c.date_naissance, c.telephone, c.personne_id,
            i.moyenne, i.statut AS statut_inscription
       FROM dossiers d
       JOIN candidats c ON c.id = d.candidat_id
  LEFT JOIN inscriptions i ON i.candidat_id = d.candidat_id AND i.promotion_id = d.promotion_id
      WHERE d.lot_id = $1
      -- Ordre de travail, pas ordre alphabétique : les urgents d'abord,
      -- et parmi eux les échéances les plus proches. Un agent qui
      -- instruit par tranches traite le haut de la liste ; il faut donc
      -- que le haut de la liste soit ce qui presse.
      ORDER BY (d.priorite = 'urgente') DESC,
               d.date_echeance ASC NULLS LAST,
               c.nom, c.prenom`,
    [lot_id]
  );
  return rows;
}

export async function creer(data, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO lots_transmission
       (reference, promotion_id, etablissement_id, agent_emetteur_id, effectif)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [data.reference, data.promotion_id, data.etablissement_id, data.agent_emetteur_id, data.effectif]
  );
  return rows[0].id;
}

export async function changerStatut(id, { statut, motif_rejet, agent_ministere_id, rapport_controles }, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rowCount } = await executer(
    `UPDATE lots_transmission
        SET statut = $2::text,
            motif_rejet = COALESCE($3, motif_rejet),
            agent_ministere_id = COALESCE($4, agent_ministere_id),
            rapport_controles = COALESCE($5::jsonb, rapport_controles),
            date_traitement = CASE
                WHEN $2::text IN ('valide', 'partiellement_traite', 'rejete', 'certifie')
                THEN now() ELSE date_traitement END
      WHERE id = $1`,
    [
      id,
      statut,
      motif_rejet || null,
      agent_ministere_id || null,
      rapport_controles ? JSON.stringify(rapport_controles) : null,
    ]
  );
  return rowCount > 0;
}

/** Diplômes déjà délivrés aux candidats du lot — détection des doublons. */
export async function diplomesExistants(lot_id) {
  const { rows } = await query(
    `SELECT dip.candidat_id, dip.type_diplome_existant
       FROM (
           SELECT d2.candidat_id, d2.type_diplome AS type_diplome_existant
             FROM diplomes dp
             JOIN dossiers d2 ON d2.id = dp.dossier_id
            WHERE dp.statut = 'actif'
              AND d2.candidat_id IN (SELECT candidat_id FROM dossiers WHERE lot_id = $1)
              AND d2.lot_id IS DISTINCT FROM $1
       ) dip`,
    [lot_id]
  );
  return rows;
}

/** Répartition des lots par statut, pour le tableau de bord ministère. */
export async function compterParStatut() {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total FROM lots_transmission GROUP BY statut`
  );
  return rows;
}
