// ─────────────────────────────────────────────────────────────
// Modèle "admin" — agrégats globaux pour le tableau de bord admin système.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

/** Compteurs globaux de la plateforme. */
export async function statistiquesGlobales() {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*) FROM utilisateurs)                          AS utilisateurs,
       (SELECT COUNT(*) FROM utilisateurs WHERE actif)              AS utilisateurs_actifs,
       (SELECT COUNT(*) FROM etablissements)                        AS etablissements,
       (SELECT COUNT(*) FROM etablissements WHERE statut = 'actif') AS etablissements_actifs,
       (SELECT COUNT(*) FROM candidats)                             AS candidats,
       (SELECT COUNT(*) FROM dossiers)                              AS dossiers,
       (SELECT COUNT(*) FROM diplomes)                              AS diplomes,
       (SELECT COUNT(*) FROM diplomes WHERE statut = 'actif')       AS diplomes_actifs,
       (SELECT COUNT(*) FROM diplomes WHERE statut = 'revoque')     AS diplomes_revoques,
       (SELECT COUNT(*) FROM verifications_log)                     AS verifications`
  );
  // pg renvoie des COUNT en chaînes : on convertit en nombres.
  return Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)]));
}
