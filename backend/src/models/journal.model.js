// ─────────────────────────────────────────────────────────────
// Modèle "journal d'audit", historique des dossiers et corbeille.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

const COLONNES = `id, utilisateur_id, auteur_libelle, role, action, entite, entite_id,
                  valeurs_avant, valeurs_apres, details, adresse_ip, user_agent,
                  resultat, message, transaction_hash, etablissement_id, date_action`;

// ── Journal ────────────────────────────────────────────────────────

export async function enregistrer(entree, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO journal_audit
       (utilisateur_id, auteur_libelle, role, action, entite, entite_id,
        valeurs_avant, valeurs_apres, adresse_ip, user_agent,
        resultat, message, transaction_hash, etablissement_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      entree.utilisateur_id || null,
      entree.auteur_libelle || null,
      entree.role || null,
      entree.action,
      entree.entite || null,
      entree.entite_id || null,
      entree.valeurs_avant ? JSON.stringify(entree.valeurs_avant) : null,
      entree.valeurs_apres ? JSON.stringify(entree.valeurs_apres) : null,
      entree.adresse_ip || null,
      entree.user_agent || null,
      entree.resultat || 'succes',
      entree.message || null,
      entree.transaction_hash || null,
      entree.etablissement_id || null,
    ]
  );
  return rows[0].id;
}

export async function lister({
  action = null,
  entite = null,
  entite_id = null,
  utilisateur_id = null,
  etablissement_id = null,
  resultat = null,
  depuis = null,
  jusqua = null,
  limit = 100,
  offset = 0,
} = {}) {
  const params = [];
  const filtres = [];
  const ajouter = (colonne, valeur, operateur = '=') => {
    if (!valeur) return;
    params.push(valeur);
    filtres.push(`${colonne} ${operateur} $${params.length}`);
  };

  ajouter('action', action);
  ajouter('entite', entite);
  ajouter('entite_id', entite_id);
  ajouter('utilisateur_id', utilisateur_id);
  ajouter('etablissement_id', etablissement_id);
  ajouter('resultat', resultat);
  ajouter('date_action', depuis, '>=');
  ajouter('date_action', jusqua, '<=');

  const where = filtres.length ? `WHERE ${filtres.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT ${COLONNES} FROM journal_audit ${where}
      ORDER BY date_action DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function compter(filtres = {}) {
  const params = [];
  const clauses = [];
  for (const [colonne, valeur] of Object.entries({
    action: filtres.action,
    entite: filtres.entite,
    utilisateur_id: filtres.utilisateur_id,
    etablissement_id: filtres.etablissement_id,
    resultat: filtres.resultat,
  })) {
    if (!valeur) continue;
    params.push(valeur);
    clauses.push(`${colonne} = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM journal_audit ${where}`,
    params
  );
  return rows[0].total;
}

/** Actions les plus fréquentes — vue de supervision. */
export async function repartitionActions({ limite = 20 } = {}) {
  const { rows } = await query(
    `SELECT action, resultat, COUNT(*)::int AS total
       FROM journal_audit
      GROUP BY action, resultat
      ORDER BY total DESC
      LIMIT $1`,
    [limite]
  );
  return rows;
}

/** Purge des entrées au-delà de la durée de conservation. */
export async function purger(joursConservation) {
  const { rowCount } = await query(
    `DELETE FROM journal_audit WHERE date_action < now() - ($1 || ' days')::interval`,
    [String(joursConservation)]
  );
  return rowCount;
}

// ── Historique des statuts d'un dossier ────────────────────────────

export async function enregistrerChangementStatut(entree, client = null) {
  const executer = client ? client.query.bind(client) : query;
  await executer(
    `INSERT INTO historique_statuts_dossier
       (dossier_id, statut_avant, statut_apres, utilisateur_id, auteur_libelle, motif, lot_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entree.dossier_id,
      entree.statut_avant || null,
      entree.statut_apres,
      entree.utilisateur_id || null,
      entree.auteur_libelle || null,
      entree.motif || null,
      entree.lot_id || null,
    ]
  );
}

export async function historiqueDossier(dossier_id) {
  const { rows } = await query(
    `SELECT id, statut_avant, statut_apres, utilisateur_id, auteur_libelle,
            motif, lot_id, date_changement
       FROM historique_statuts_dossier
      WHERE dossier_id = $1
      ORDER BY date_changement`,
    [dossier_id]
  );
  return rows;
}

// ── Corbeille ──────────────────────────────────────────────────────

export async function deposerCorbeille(entree, client = null) {
  const executer = client ? client.query.bind(client) : query;
  const { rows } = await executer(
    `INSERT INTO corbeille
       (table_source, enregistrement_id, donnees, libelle, supprime_par,
        auteur_libelle, etablissement_id, motif)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      entree.table_source,
      entree.enregistrement_id,
      JSON.stringify(entree.donnees),
      entree.libelle || null,
      entree.supprime_par || null,
      entree.auteur_libelle || null,
      entree.etablissement_id || null,
      entree.motif || null,
    ]
  );
  return rows[0].id;
}

export async function listerCorbeille({ table_source = null, etablissement_id = null, restaure = false } = {}) {
  const params = [restaure];
  const filtres = ['restaure = $1'];
  if (table_source) {
    params.push(table_source);
    filtres.push(`table_source = $${params.length}`);
  }
  if (etablissement_id) {
    params.push(etablissement_id);
    filtres.push(`etablissement_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT id, table_source, enregistrement_id, donnees, libelle,
            auteur_libelle, motif, restaure, date_suppression, date_restauration
       FROM corbeille
      WHERE ${filtres.join(' AND ')}
      ORDER BY date_suppression DESC`,
    params
  );
  return rows;
}

export async function trouverCorbeille(id) {
  const { rows } = await query(`SELECT * FROM corbeille WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function marquerRestaure(id, client = null) {
  const executer = client ? client.query.bind(client) : query;
  await executer(
    `UPDATE corbeille SET restaure = TRUE, date_restauration = now() WHERE id = $1`,
    [id]
  );
}
