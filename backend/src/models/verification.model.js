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
