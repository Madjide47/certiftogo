// ─────────────────────────────────────────────────────────────
// Modèle "vérification" — journalise chaque tentative de vérification
// publique dans `verifications_log` (à des fins de statistiques/audit).
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

/** Enregistre une ligne de log de vérification. */
export async function enregistrer(data) {
  const { rows } = await query(
    `INSERT INTO verifications_log
       (diplome_id, hash_recherche, methode, adresse_ip, user_agent, resultat)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      data.diplome_id || null,
      data.hash_recherche || null,
      data.methode || 'hash',
      data.adresse_ip || null,
      data.user_agent || null,
      data.resultat,
    ]
  );
  return rows[0];
}

/**
 * Nombre de consultations d'un diplôme, et date de la dernière.
 *
 * Le titulaire a le droit de savoir combien de fois son diplôme a été
 * vérifié. Il n'a PAS à savoir par qui : ni l'adresse IP, ni le
 * navigateur du tiers ne sortent d'ici. Un employeur qui vérifie un
 * candidat ne doit pas être identifiable par ce candidat.
 */
export async function compterParDiplome(diplome_ids = []) {
  if (diplome_ids.length === 0) return new Map();
  const { rows } = await query(
    `SELECT diplome_id, COUNT(*)::int AS total, MAX(date_verification) AS derniere
       FROM verifications_log
      WHERE diplome_id = ANY($1::uuid[])
      GROUP BY diplome_id`,
    [diplome_ids]
  );
  return new Map(rows.map((r) => [r.diplome_id, { total: r.total, derniere: r.derniere }]));
}

/**
 * Dernière consultation notifiée au titulaire, pour ne pas l'inonder.
 * Un employeur qui recharge la page trois fois ne doit pas produire
 * trois notifications.
 */
export async function derniereNotificationConsultation(diplome_id, fenetreHeures) {
  const { rows } = await query(
    `SELECT 1 FROM notifications
      WHERE evenement = 'qr_consulte' AND entite_id = $1
        AND date_creation > now() - ($2 || ' hours')::interval
      LIMIT 1`,
    [diplome_id, String(fenetreHeures)]
  );
  return rows.length > 0;
}
