// ─────────────────────────────────────────────────────────────
// Modèle "diplôme" — requêtes SQL brutes (driver pg), paramétrées.
// Un diplôme est la version certifiée (ministère) d'un dossier validé.
// Les fonctions d'écriture acceptent un client optionnel pour s'exécuter
// dans une transaction (voir withTransaction).
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';

// Choisit l'exécuteur : client de transaction si fourni, sinon pool global.
const exec = (client) => (client ? (t, p) => client.query(t, p) : query);

// Colonnes diplôme + infos candidat / établissement jointes.
const SELECT_DIPLOME = `
  d.id, d.reference, d.dossier_id, d.candidat_id, d.etablissement_id, d.ministere_id,
  d.donnees_signees, d.hash_sha256, d.signature_numerique, d.transaction_id,
  d.qr_code_url, d.pdf_url, d.statut, d.motif_revocation,
  d.date_certification, d.date_revocation,
  c.nom AS candidat_nom, c.prenom AS candidat_prenom,
  c.numero_etudiant AS candidat_numero_etudiant,
  e.nom AS etablissement_nom,
  dos.reference AS dossier_reference, dos.type_diplome, dos.mention, dos.filiere`;

const FROM_DIPLOME = `
  FROM diplomes d
  JOIN candidats c ON c.id = d.candidat_id
  JOIN etablissements e ON e.id = d.etablissement_id
  JOIN dossiers dos ON dos.id = d.dossier_id`;

/** Liste les diplômes (vue ministère), filtre statut optionnel. */
export async function lister({ statut = null, limit = 50, offset = 0 } = {}) {
  const params = [];
  let filtre = '';
  if (statut) {
    params.push(statut);
    filtre = `WHERE d.statut = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${SELECT_DIPLOME} ${FROM_DIPLOME} ${filtre}
      ORDER BY d.date_certification DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/** Récupère un diplôme par id (avec infos jointes). */
export async function trouverParId(id, client) {
  const { rows } = await exec(client)(
    `SELECT ${SELECT_DIPLOME} ${FROM_DIPLOME} WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Récupère un diplôme par empreinte SHA-256 (vérification publique). */
export async function trouverParHash(hash) {
  const { rows } = await query(
    `SELECT ${SELECT_DIPLOME} ${FROM_DIPLOME} WHERE d.hash_sha256 = $1`,
    [hash]
  );
  return rows[0] || null;
}

/** Récupère un diplôme par sa référence DIP-AAAA-XXXXX. */
export async function trouverParReference(reference) {
  const { rows } = await query(
    `SELECT ${SELECT_DIPLOME} ${FROM_DIPLOME} WHERE d.reference = $1`,
    [reference]
  );
  return rows[0] || null;
}

/** Liste les diplômes d'un candidat (son portefeuille). */
export async function listerParCandidat(candidat_id) {
  const { rows } = await query(
    `SELECT ${SELECT_DIPLOME} ${FROM_DIPLOME}
      WHERE d.candidat_id = $1
      ORDER BY d.date_certification DESC`,
    [candidat_id]
  );
  return rows;
}

/** Répartition des diplômes d'un candidat par statut. */
export async function compterParCandidat(candidat_id) {
  const { rows } = await query(
    `SELECT statut, COUNT(*)::int AS total
       FROM diplomes
      WHERE candidat_id = $1
      GROUP BY statut`,
    [candidat_id]
  );
  return rows;
}

/** Récupère le diplôme rattaché à un dossier (ou null). */
export async function trouverParDossier(dossier_id, client) {
  const { rows } = await exec(client)(
    `SELECT ${SELECT_DIPLOME} ${FROM_DIPLOME} WHERE d.dossier_id = $1`,
    [dossier_id]
  );
  return rows[0] || null;
}

/** Vérifie l'unicité d'une référence de diplôme. */
export async function referenceExiste(reference) {
  const { rows } = await query(`SELECT 1 FROM diplomes WHERE reference = $1 LIMIT 1`, [reference]);
  return rows.length > 0;
}

/** Insère un diplôme certifié. */
export async function creer(data, client) {
  const { rows } = await exec(client)(
    `INSERT INTO diplomes
       (reference, dossier_id, candidat_id, etablissement_id, ministere_id,
        donnees_signees, hash_sha256, signature_numerique, transaction_id,
        qr_code_url, pdf_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      data.reference,
      data.dossier_id,
      data.candidat_id,
      data.etablissement_id,
      data.ministere_id,
      JSON.stringify(data.donnees_signees),
      data.hash_sha256,
      data.signature_numerique,
      data.transaction_id || null,
      data.qr_code_url || null,
      data.pdf_url || null,
    ]
  );
  return trouverParId(rows[0].id, client);
}

/** Révoque un diplôme (statut actif → revoque). */
export async function revoquer(id, motif, client) {
  const { rows } = await exec(client)(
    `UPDATE diplomes SET
        statut = 'revoque',
        motif_revocation = $2,
        date_revocation = now()
      WHERE id = $1 AND statut = 'actif'
      RETURNING id`,
    [id, motif]
  );
  return rows[0] ? trouverParId(id, client) : null;
}
