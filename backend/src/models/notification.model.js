// ─────────────────────────────────────────────────────────────
// Modèle "notification" et préférences de réception.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, evenement, canal, priorite, destinataire_id,
                  destinataire_telephone, destinataire_email, sujet, corps, donnees,
                  entite, entite_id, etablissement_id, statut, lue, tentatives,
                  max_tentatives, derniere_erreur, date_creation, date_envoi, date_lecture`;

export async function creer(notification, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO notifications
       (evenement, canal, priorite, destinataire_id, destinataire_telephone,
        destinataire_email, sujet, corps, donnees, entite, entite_id, etablissement_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
     RETURNING ${COLONNES}`,
    [
      notification.evenement,
      notification.canal,
      notification.priorite || 'normale',
      notification.destinataire_id || null,
      notification.destinataire_telephone || null,
      notification.destinataire_email || null,
      notification.sujet,
      notification.corps,
      notification.donnees ? JSON.stringify(notification.donnees) : null,
      notification.entite || null,
      notification.entite_id || null,
      notification.etablissement_id || null,
    ]
  );
  return rows[0];
}

/** Boîte de réception d'un utilisateur (centre in-app). */
export async function listerPour(destinataire_id, { non_lues = false, limit = 50 } = {}) {
  const params = [destinataire_id];
  let filtre = '';
  if (non_lues) filtre = 'AND lue = FALSE';
  params.push(limit);

  const { rows } = await query(
    `SELECT ${COLONNES} FROM notifications
      WHERE destinataire_id = $1 AND canal = 'in_app' ${filtre}
      ORDER BY date_creation DESC
      LIMIT $2`,
    params
  );
  return rows;
}

export async function compterNonLues(destinataire_id) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM notifications
      WHERE destinataire_id = $1 AND canal = 'in_app' AND lue = FALSE`,
    [destinataire_id]
  );
  return rows[0].total;
}

export async function marquerLue(id, destinataire_id) {
  const { rows } = await query(
    `UPDATE notifications SET lue = TRUE, date_lecture = now()
      WHERE id = $1 AND destinataire_id = $2
      RETURNING ${COLONNES}`,
    [id, destinataire_id]
  );
  return rows[0] || null;
}

export async function toutMarquerLu(destinataire_id) {
  const { rowCount } = await query(
    `UPDATE notifications SET lue = TRUE, date_lecture = now()
      WHERE destinataire_id = $1 AND canal = 'in_app' AND lue = FALSE`,
    [destinataire_id]
  );
  return rowCount;
}

/** Notifications restant à expédier (hors in-app, déjà « livrées »). */
export async function aExpedier(taille = 20) {
  const { rows } = await query(
    `SELECT ${COLONNES} FROM notifications
      WHERE statut IN ('en_attente', 'echouee')
        AND canal <> 'in_app'
        AND tentatives < max_tentatives
      ORDER BY CASE priorite WHEN 'haute' THEN 1 WHEN 'normale' THEN 2 ELSE 3 END,
               date_creation
      LIMIT $1`,
    [taille]
  );
  return rows;
}

export async function marquerEnvoyee(id) {
  await query(
    `UPDATE notifications
        SET statut = 'envoyee', date_envoi = now(), derniere_erreur = NULL,
            tentatives = tentatives + 1
      WHERE id = $1`,
    [id]
  );
}

export async function marquerEchouee(id, erreur) {
  const { rows } = await query(
    `UPDATE notifications
        SET tentatives = tentatives + 1,
            derniere_erreur = $2,
            statut = CASE WHEN tentatives + 1 >= max_tentatives THEN 'abandonnee' ELSE 'echouee' END
      WHERE id = $1
      RETURNING statut, tentatives`,
    [id, String(erreur).slice(0, 2000)]
  );
  return rows[0] || null;
}

export async function repartition() {
  const { rows } = await query(
    `SELECT canal, statut, COUNT(*)::int AS total
       FROM notifications GROUP BY canal, statut ORDER BY canal, statut`
  );
  return rows;
}

// ── Préférences ────────────────────────────────────────────────────

export async function listerPreferences(utilisateur_id) {
  const { rows } = await query(
    `SELECT evenement, canal, actif FROM preferences_notification
      WHERE utilisateur_id = $1 ORDER BY evenement, canal`,
    [utilisateur_id]
  );
  return rows;
}

export async function definirPreference(utilisateur_id, evenement, canal, actif) {
  const { rows } = await query(
    `INSERT INTO preferences_notification (utilisateur_id, evenement, canal, actif)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (utilisateur_id, evenement, canal)
     DO UPDATE SET actif = EXCLUDED.actif, date_maj = now()
     RETURNING evenement, canal, actif`,
    [utilisateur_id, evenement, canal, actif]
  );
  return rows[0];
}

/** Refus explicites d'un utilisateur, pour filtrer avant création. */
export async function refus(utilisateur_id) {
  const { rows } = await query(
    `SELECT evenement, canal FROM preferences_notification
      WHERE utilisateur_id = $1 AND actif = FALSE`,
    [utilisateur_id]
  );
  return rows;
}
