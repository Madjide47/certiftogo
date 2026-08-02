// ─────────────────────────────────────────────────────────────
// Tests d'intégration de l'API (test runner intégré Node : `node --test`).
// Une base dédiée `certiftogo_test` est (re)créée avant l'exécution.
// Lancer : npm test  (nécessite PostgreSQL accessible ; PGPORT=5433 en démo).
// ─────────────────────────────────────────────────────────────
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import request from 'supertest';
import app from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5433,
  user: process.env.PGUSER || 'certiftogo',
  password: process.env.PGPASSWORD || 'certiftogo_dev',
};
const pool = new pg.Pool({ ...cfg, database: 'certiftogo_test' });

const api = () => request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function login(telephone) {
  await api().post('/api/auth/request-otp').send({ telephone });
  const { rows } = await pool.query(
    `SELECT code FROM codes_otp WHERE telephone=$1 AND utilise=FALSE
       AND date_expiration>now() ORDER BY date_creation DESC LIMIT 1`,
    [telephone]
  );
  const res = await api().post('/api/auth/verify-otp').send({ telephone, code: rows[0].code });
  return res.body.data.token;
}

// ── Provisioning de la base de test ────────────────────────────
before(async () => {
  const admin = new pg.Client({ ...cfg, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS certiftogo_test WITH (FORCE)`);
  await admin.query(`CREATE DATABASE certiftogo_test`);
  await admin.end();

  const db = new pg.Client({ ...cfg, database: 'certiftogo_test' });
  await db.connect();
  // Toutes les migrations, dans l'ordre (la base de test est neuve à chaque fois).
  const dossierMigrations = path.join(__dirname, '../migrations');
  for (const fichier of fs.readdirSync(dossierMigrations).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(path.join(dossierMigrations, fichier), 'utf8'));
  }
  await db.query(fs.readFileSync(path.join(__dirname, '../seeds/seed_dev.sql'), 'utf8'));
  await db.end();
});

describe('Authentification OTP', () => {
  test('refuse un numéro inconnu (404)', async () => {
    const res = await api().post('/api/auth/request-otp').send({ telephone: '+22800000000' });
    assert.equal(res.status, 404);
  });

  test('connecte avec un code valide et expose le rôle via /me', async () => {
    const token = await login('+22890000002');
    assert.ok(token);
    const me = await api().get('/api/auth/me').set(auth(token));
    assert.equal(me.status, 200);
    assert.equal(me.body.data.utilisateur.role, 'etablissement');
  });

  test('rejette un code OTP invalide (401)', async () => {
    await api().post('/api/auth/request-otp').send({ telephone: '+22890000002' });
    const res = await api().post('/api/auth/verify-otp').send({ telephone: '+22890000002', code: '000000' });
    assert.equal(res.status, 401);
  });
});

describe("Contrôle d'accès (RBAC)", () => {
  test('route protégée sans token → 401', async () => {
    assert.equal((await api().get('/api/candidats')).status, 401);
  });
  test('établissement interdit sur route admin → 403', async () => {
    const t = await login('+22890000002');
    assert.equal((await api().get('/api/admin/statistiques').set(auth(t))).status, 403);
  });
  test('admin autorisé sur ses routes → 200', async () => {
    const t = await login('+22890000003');
    assert.equal((await api().get('/api/admin/statistiques').set(auth(t))).status, 200);
  });
});

describe('Vérification publique', () => {
  test('référence inexistante → introuvable (sans auth)', async () => {
    const res = await api().get('/api/verification/DIP-0000-00000');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.resultat, 'introuvable');
  });
});

describe('Parcours complet : saisie → certification → vérification → révocation', () => {
  test('déroule le cycle métier de bout en bout', async () => {
    const tEtab = await login('+22890000002');
    const cands = await api().get('/api/candidats').set(auth(tEtab));
    const candidat = cands.body.data.candidats[0];
    assert.ok(candidat, 'un candidat de seed doit exister');

    const creation = await api().post('/api/dossiers').set(auth(tEtab)).send({
      candidat_id: candidat.id,
      type_diplome: 'licence',
      mention: 'bien',
      filiere: 'Génie Logiciel',
      date_obtention: '2024-07-01',
      annee_academique: '2023-2024',
    });
    assert.equal(creation.status, 201);
    const dossierId = creation.body.data.dossier.id;

    const transmit = await api().post(`/api/dossiers/${dossierId}/transmettre`).set(auth(tEtab));
    assert.equal(transmit.body.data.dossier.statut, 'soumis');

    const tMin = await login('+22890000001');
    const valide = await api().post(`/api/ministere/dossiers/${dossierId}/valider`).set(auth(tMin));
    assert.equal(valide.body.data.dossier.statut, 'valide');

    const cert = await api().post(`/api/ministere/dossiers/${dossierId}/certifier`).set(auth(tMin));
    assert.equal(cert.status, 201);
    const diplome = cert.body.data.diplome;
    assert.match(diplome.hash_sha256, /^[0-9a-f]{64}$/);
    assert.ok(diplome.transaction_id);
    assert.ok(diplome.pdf_url.includes('.pdf'));

    assert.equal((await api().get(`/api/verification/${diplome.hash_sha256}`)).body.data.resultat, 'authentique');
    assert.equal((await api().get(`/api/verification/${diplome.reference}`)).body.data.resultat, 'authentique');

    // Double certification interdite.
    assert.equal((await api().post(`/api/ministere/dossiers/${dossierId}/certifier`).set(auth(tMin))).status, 409);

    const revoc = await api().post(`/api/ministere/diplomes/${diplome.id}/revoquer`).set(auth(tMin)).send({ motif: 'Test automatisé' });
    assert.equal(revoc.body.data.diplome.statut, 'revoque');

    const apres = await api().get(`/api/verification/${diplome.hash_sha256}`);
    assert.equal(apres.body.data.resultat, 'revoque');
    assert.equal(apres.body.data.motif_revocation, 'Test automatisé');
  });
});

describe('Module établissement — candidats (validation & unicité)', () => {
  test('crée un candidat valide (201) puis le retrouve dans la liste', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/candidats').set(auth(t)).send({
      numero_etudiant: 'TEST-CAND-001',
      nom: 'TESTNOM',
      prenom: 'Prénom',
      sexe: 'F',
      email: 'test.cand@example.tg',
    });
    assert.equal(res.status, 201);
    const id = res.body.data.candidat.id;

    const liste = await api().get('/api/candidats').set(auth(t));
    assert.ok(liste.body.data.candidats.some((c) => c.id === id));
  });

  test('rejette un email invalide (400 EMAIL_INVALIDE)', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/candidats').set(auth(t)).send({
      numero_etudiant: 'TEST-CAND-002',
      nom: 'X',
      prenom: 'Y',
      email: 'pas-un-email',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'EMAIL_INVALIDE');
  });

  test('refuse un numéro étudiant déjà utilisé (409 NUMERO_DUPLIQUE)', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/candidats').set(auth(t)).send({
      numero_etudiant: 'IAI-2021-001', // déjà présent dans le seed
      nom: 'DOUBLON',
      prenom: 'Test',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NUMERO_DUPLIQUE');
  });

  test('renvoie 404 pour un candidat inexistant', async () => {
    const t = await login('+22890000002');
    const res = await api()
      .get('/api/candidats/99999999-9999-9999-9999-999999999999')
      .set(auth(t));
    assert.equal(res.status, 404);
  });
});

describe('Cycle de vie du dossier — transitions valides et invalides', () => {
  let candidatId;
  let dossierId;

  test('prépare un candidat dédié', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/candidats').set(auth(t)).send({
      numero_etudiant: 'TEST-DOSSIER-001',
      nom: 'DOSSIER',
      prenom: 'Cycle',
      sexe: 'M',
    });
    assert.equal(res.status, 201);
    candidatId = res.body.data.candidat.id;
  });

  test('refuse une mention invalide (400 MENTION_INVALIDE)', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/dossiers').set(auth(t)).send({
      candidat_id: candidatId,
      type_diplome: 'licence',
      mention: 'super_bien',
      date_obtention: '2024-07-01',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'MENTION_INVALIDE');
  });

  test('crée un dossier en brouillon puis le transmet (soumis)', async () => {
    const t = await login('+22890000002');
    const creation = await api().post('/api/dossiers').set(auth(t)).send({
      candidat_id: candidatId,
      type_diplome: 'master',
      mention: 'tres_bien',
      filiere: 'Cybersécurité',
      date_obtention: '2024-07-01',
      annee_academique: '2023-2024',
    });
    assert.equal(creation.status, 201);
    assert.equal(creation.body.data.dossier.statut, 'brouillon');
    dossierId = creation.body.data.dossier.id;

    const transmit = await api().post(`/api/dossiers/${dossierId}/transmettre`).set(auth(t));
    assert.equal(transmit.body.data.dossier.statut, 'soumis');
  });

  test('interdit modification, suppression et re-transmission d\'un dossier soumis', async () => {
    const t = await login('+22890000002');

    const modif = await api().put(`/api/dossiers/${dossierId}`).set(auth(t)).send({
      candidat_id: candidatId,
      type_diplome: 'master',
      mention: 'bien',
    });
    assert.equal(modif.status, 409);
    assert.equal(modif.body.error.code, 'DOSSIER_NON_MODIFIABLE');

    const suppr = await api().delete(`/api/dossiers/${dossierId}`).set(auth(t));
    assert.equal(suppr.status, 409);
    assert.equal(suppr.body.error.code, 'DOSSIER_NON_SUPPRIMABLE');

    const retransmit = await api().post(`/api/dossiers/${dossierId}/transmettre`).set(auth(t));
    assert.equal(retransmit.status, 409);
    assert.equal(retransmit.body.error.code, 'DOSSIER_NON_TRANSMISSIBLE');
  });

  test('ministère : rejet sans motif refusé (400), puis rejet motivé (rejete)', async () => {
    const t = await login('+22890000001');

    const sansMotif = await api().post(`/api/ministere/dossiers/${dossierId}/rejeter`).set(auth(t)).send({});
    assert.equal(sansMotif.status, 400);
    assert.equal(sansMotif.body.error.code, 'MOTIF_REQUIS');

    const rejet = await api()
      .post(`/api/ministere/dossiers/${dossierId}/rejeter`)
      .set(auth(t))
      .send({ motif: 'Pièces manquantes' });
    assert.equal(rejet.body.data.dossier.statut, 'rejete');
  });

  test('établissement : un dossier rejeté est modifiable et re-transmissible', async () => {
    const t = await login('+22890000002');

    const modif = await api().put(`/api/dossiers/${dossierId}`).set(auth(t)).send({
      candidat_id: candidatId,
      type_diplome: 'master',
      mention: 'excellent',
      date_obtention: '2024-07-01',
    });
    assert.equal(modif.status, 200);

    const retransmit = await api().post(`/api/dossiers/${dossierId}/transmettre`).set(auth(t));
    assert.equal(retransmit.body.data.dossier.statut, 'soumis');
  });

  test('ministère : examiner → valider, puis re-valider refusé (409)', async () => {
    const t = await login('+22890000001');

    const examen = await api().post(`/api/ministere/dossiers/${dossierId}/examiner`).set(auth(t));
    assert.equal(examen.body.data.dossier.statut, 'en_examen');

    const valide = await api().post(`/api/ministere/dossiers/${dossierId}/valider`).set(auth(t));
    assert.equal(valide.body.data.dossier.statut, 'valide');

    const reValide = await api().post(`/api/ministere/dossiers/${dossierId}/valider`).set(auth(t));
    assert.equal(reValide.status, 409);
    assert.equal(reValide.body.error.code, 'TRANSITION_INVALIDE');
  });
});

describe('Portefeuille candidat — contenu et isolation', () => {
  const KOFFI = '30000000-0000-0000-0000-000000000001';
  let reference;

  test('certifie un diplôme pour le candidat Koffi', async () => {
    const tEtab = await login('+22890000002');
    const creation = await api().post('/api/dossiers').set(auth(tEtab)).send({
      candidat_id: KOFFI,
      type_diplome: 'licence',
      mention: 'bien',
      filiere: 'Génie Logiciel',
      date_obtention: '2024-07-01',
      annee_academique: '2023-2024',
    });
    const dossierId = creation.body.data.dossier.id;
    await api().post(`/api/dossiers/${dossierId}/transmettre`).set(auth(tEtab));

    const tMin = await login('+22890000001');
    await api().post(`/api/ministere/dossiers/${dossierId}/valider`).set(auth(tMin));
    const cert = await api().post(`/api/ministere/dossiers/${dossierId}/certifier`).set(auth(tMin));
    assert.equal(cert.status, 201);
    reference = cert.body.data.diplome.reference;
  });

  test('Koffi voit son diplôme dans son portefeuille + statistiques cohérentes', async () => {
    const t = await login('+22890000011');
    const dip = await api().get('/api/candidat/diplomes').set(auth(t));
    assert.equal(dip.status, 200);
    assert.ok(dip.body.data.diplomes.some((d) => d.reference === reference));

    const stats = await api().get('/api/candidat/statistiques').set(auth(t));
    assert.ok(stats.body.data.statistiques.total_diplomes >= 1);
    assert.ok('actif' in stats.body.data.statistiques.diplomes_par_statut);
  });

  test('Ama ne voit pas le diplôme de Koffi (isolation par candidat)', async () => {
    const t = await login('+22890000012');
    const dip = await api().get('/api/candidat/diplomes').set(auth(t));
    assert.equal(dip.status, 200);
    assert.ok(!dip.body.data.diplomes.some((d) => d.reference === reference));
  });
});

describe('Admin & isolation inter-établissements', () => {
  let etabBId;
  const AGENT_B = '+22890000200';
  const CANDIDAT_A = '30000000-0000-0000-0000-000000000001'; // Koffi (établissement IAI)

  test('crée un établissement (201) et refuse un type invalide (400)', async () => {
    const t = await login('+22890000003');

    const ok = await api().post('/api/admin/etablissements').set(auth(t)).send({
      nom: 'École Supérieure de Test',
      type: 'ecole',
      ville: 'Kara',
      email: 'contact@est.tg',
    });
    assert.equal(ok.status, 201);
    etabBId = ok.body.data.etablissement.id;

    const ko = await api().post('/api/admin/etablissements').set(auth(t)).send({
      nom: 'Type Invalide',
      type: 'garderie',
      ville: 'Lomé',
      email: 'x@y.tg',
    });
    assert.equal(ko.status, 400);
    assert.equal(ko.body.error.code, 'TYPE_INVALIDE');
  });

  test('refuse un rattachement manquant et un téléphone déjà utilisé', async () => {
    const t = await login('+22890000003');

    const sansRattachement = await api().post('/api/admin/utilisateurs').set(auth(t)).send({
      nom: 'SANS', prenom: 'Rattachement', telephone: '+22890000299', role: 'etablissement',
    });
    assert.equal(sansRattachement.status, 400);
    assert.equal(sansRattachement.body.error.code, 'RATTACHEMENT_REQUIS');

    const telExistant = await api().post('/api/admin/utilisateurs').set(auth(t)).send({
      nom: 'DOUBLON', prenom: 'Tel', telephone: '+22890000002', role: 'etablissement',
      etablissement_id: etabBId,
    });
    assert.equal(telExistant.status, 409);
    assert.equal(telExistant.body.error.code, 'TELEPHONE_EXISTANT');
  });

  test('crée un agent pour l\'établissement B qui peut se connecter', async () => {
    const t = await login('+22890000003');
    const res = await api().post('/api/admin/utilisateurs').set(auth(t)).send({
      nom: 'AGENT', prenom: 'B', telephone: AGENT_B, role: 'etablissement',
      etablissement_id: etabBId,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.utilisateur.role, 'etablissement');

    const token = await login(AGENT_B); // login OTP du nouveau compte
    assert.ok(token);
  });

  test('l\'agent B est isolé des données de l\'établissement A', async () => {
    const t = await login(AGENT_B);

    // Aucun candidat visible (établissement B vide)
    const liste = await api().get('/api/candidats').set(auth(t));
    assert.equal(liste.body.data.candidats.length, 0);

    // Accès direct à un candidat de A → 404
    const direct = await api().get(`/api/candidats/${CANDIDAT_A}`).set(auth(t));
    assert.equal(direct.status, 404);

    // Créer un dossier sur un candidat de A → 400 CANDIDAT_INVALIDE
    const dossier = await api().post('/api/dossiers').set(auth(t)).send({
      candidat_id: CANDIDAT_A,
      type_diplome: 'licence',
      mention: 'bien',
      date_obtention: '2024-07-01',
    });
    assert.equal(dossier.status, 400);
    assert.equal(dossier.body.error.code, 'CANDIDAT_INVALIDE');
  });

  test('un compte désactivé ne peut plus demander d\'OTP (403)', async () => {
    const t = await login('+22890000003');
    const creation = await api().post('/api/admin/utilisateurs').set(auth(t)).send({
      nom: 'JETABLE', prenom: 'Compte', telephone: '+22890000201', role: 'etablissement',
      etablissement_id: etabBId,
    });
    const userId = creation.body.data.utilisateur.id;

    const maj = await api()
      .patch(`/api/admin/utilisateurs/${userId}/actif`)
      .set(auth(t))
      .send({ actif: false });
    assert.equal(maj.body.data.utilisateur.actif, false);

    const otp = await api().post('/api/auth/request-otp').send({ telephone: '+22890000201' });
    assert.equal(otp.status, 403);
    assert.equal(otp.body.error.code, 'COMPTE_INACTIF');
  });
});

// ── Référentiel académique (migration 002) ─────────────────────
// Ces règles ne vivent que dans le schéma : sans test, elles peuvent
// disparaître d'une migration à l'autre sans que rien ne le signale.
describe('Référentiel académique', () => {
  const ANNEE_2024 = '50000000-0000-0000-0000-000000000001';
  const FILIERE_GL = '70000000-0000-0000-0000-000000000001';
  const PROMO_L3_GL = '80000000-0000-0000-0000-000000000001';
  const KOFFI = '30000000-0000-0000-0000-000000000001';

  /** Vérifie qu'une écriture est refusée par la base, avec le bon code SQLSTATE. */
  async function refuse(code, sql, params = []) {
    await assert.rejects(() => pool.query(sql, params), (err) => {
      assert.equal(err.code, code, `SQLSTATE attendu ${code}, reçu ${err.code}`);
      return true;
    });
  }

  test('le seed relie étudiant → promotion → filière → faculté → établissement', async () => {
    const { rows } = await pool.query(
      `SELECT e.nom AS etablissement, fa.code AS faculte, fi.code AS filiere,
              p.niveau, a.libelle AS annee, s.type AS session
         FROM inscriptions i
         JOIN promotions p            ON p.id  = i.promotion_id
         JOIN filieres fi             ON fi.id = p.filiere_id
         JOIN facultes fa             ON fa.id = fi.faculte_id
         JOIN etablissements e        ON e.id  = fa.etablissement_id
         JOIN annees_academiques a    ON a.id  = p.annee_id
         JOIN sessions_academiques s  ON s.id  = p.session_id
        WHERE i.candidat_id = $1`,
      [KOFFI]
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      etablissement: 'Institut Africain d\'Informatique',
      faculte: 'CII',
      filiere: 'GL',
      niveau: 3,
      annee: '2024-2025',
      session: 'normale',
    });
  });

  test('refuse une seconde année académique ouverte', async () => {
    await refuse('23505',
      `INSERT INTO annees_academiques (libelle, date_debut, date_fin, statut)
       VALUES ('2025-2026', '2025-10-01', '2026-07-31', 'ouverte')`);
  });

  test('refuse un libellé d\'année hors format AAAA-AAAA', async () => {
    await refuse('23514',
      `INSERT INTO annees_academiques (libelle, date_debut, date_fin)
       VALUES ('2025/26', '2025-10-01', '2026-07-31')`);
  });

  test('refuse une seconde session normale sur la même année', async () => {
    await refuse('23505',
      `INSERT INTO sessions_academiques (annee_id, type) VALUES ($1, 'normale')`,
      [ANNEE_2024]);
  });

  test('autorise plusieurs sessions exceptionnelles sur la même année', async () => {
    for (const libelle of ['Exceptionnelle A', 'Exceptionnelle B']) {
      await pool.query(
        `INSERT INTO sessions_academiques (annee_id, type, libelle)
         VALUES ($1, 'exceptionnelle', $2)`,
        [ANNEE_2024, libelle]
      );
    }
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM sessions_academiques
        WHERE annee_id = $1 AND type = 'exceptionnelle'`,
      [ANNEE_2024]
    );
    assert.equal(rows[0].n, 2);
    await pool.query(`DELETE FROM sessions_academiques WHERE type = 'exceptionnelle'`);
  });

  test('refuse une mention sur une inscription non admise', async () => {
    await refuse('23514',
      `INSERT INTO inscriptions (candidat_id, promotion_id, statut, mention)
       VALUES ($1, $2, 'ajourne', 'bien')`,
      ['30000000-0000-0000-0000-000000000002', PROMO_L3_GL]);
  });

  test('refuse d\'inscrire deux fois le même étudiant dans une promotion', async () => {
    await refuse('23505',
      `INSERT INTO inscriptions (candidat_id, promotion_id) VALUES ($1, $2)`,
      [KOFFI, PROMO_L3_GL]);
  });

  test('conserve le parcours : un étudiant cumule les inscriptions par année', async () => {
    const annee = (await pool.query(
      `INSERT INTO annees_academiques (libelle, date_debut, date_fin, statut)
       VALUES ('2023-2024', '2023-10-01', '2024-07-31', 'cloturee') RETURNING id`
    )).rows[0].id;

    const promo = (await pool.query(
      `INSERT INTO promotions (filiere_id, annee_id, libelle, niveau, statut)
       VALUES ($1, $2, 'Licence 2 Génie Logiciel — 2023-2024', 2, 'cloturee') RETURNING id`,
      [FILIERE_GL, annee]
    )).rows[0].id;

    await pool.query(
      `INSERT INTO inscriptions (candidat_id, promotion_id, statut, moyenne, mention)
       VALUES ($1, $2, 'admis', 14.50, 'bien')`,
      [KOFFI, promo]
    );

    const { rows } = await pool.query(
      `SELECT p.niveau, a.libelle AS annee, i.statut
         FROM inscriptions i
         JOIN promotions p         ON p.id = i.promotion_id
         JOIN annees_academiques a ON a.id = p.annee_id
        WHERE i.candidat_id = $1
        ORDER BY a.libelle`,
      [KOFFI]
    );
    assert.deepEqual(rows.map((r) => `${r.annee} N${r.niveau} ${r.statut}`), [
      '2023-2024 N2 admis',
      '2024-2025 N3 inscrit',
    ]);

    await pool.query('DELETE FROM inscriptions WHERE promotion_id = $1', [promo]);
    await pool.query('DELETE FROM promotions WHERE id = $1', [promo]);
    await pool.query('DELETE FROM annees_academiques WHERE id = $1', [annee]);
  });
});

// ── API du référentiel : années et sessions (ministère) ────────
describe('API référentiel — années et sessions', () => {
  const ANNEE_SEED = '50000000-0000-0000-0000-000000000001';
  let anneeFuture;

  test('la lecture est ouverte à un établissement, l\'écriture non', async () => {
    const etablissement = await login('+22890000002');

    const lecture = await api().get('/api/referentiel/annees').set(auth(etablissement));
    assert.equal(lecture.status, 200);
    assert.ok(lecture.body.data.annees.length >= 1);

    const ecriture = await api().post('/api/referentiel/annees').set(auth(etablissement)).send({
      libelle: '2030-2031', date_debut: '2030-10-01', date_fin: '2031-07-31',
    });
    assert.equal(ecriture.status, 403);
    assert.equal(ecriture.body.error.code, 'ACCES_REFUSE');
  });

  test('le ministère crée une année en préparation', async () => {
    const t = await login('+22890000001');
    const res = await api().post('/api/referentiel/annees').set(auth(t)).send({
      libelle: '2026-2027', date_debut: '2026-10-01', date_fin: '2027-07-31',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.annee.statut, 'preparation');
    anneeFuture = res.body.data.annee.id;
  });

  test('refuse une seconde année ouverte (409) et un libellé mal formé (400)', async () => {
    const t = await login('+22890000001');

    const deuxiemeOuverte = await api().post('/api/referentiel/annees').set(auth(t)).send({
      libelle: '2027-2028', date_debut: '2027-10-01', date_fin: '2028-07-31', statut: 'ouverte',
    });
    assert.equal(deuxiemeOuverte.status, 409);
    assert.equal(deuxiemeOuverte.body.error.code, 'ANNEE_OUVERTE_EXISTE');

    for (const libelle of ['2025/26', '2024-2026']) {
      const res = await api().post('/api/referentiel/annees').set(auth(t)).send({
        libelle, date_debut: '2025-10-01', date_fin: '2026-07-31',
      });
      assert.equal(res.status, 400, `libellé ${libelle}`);
      assert.equal(res.body.error.code, 'LIBELLE_INVALIDE');
    }
  });

  test('refuse une période incohérente (400)', async () => {
    const t = await login('+22890000001');
    const res = await api().post('/api/referentiel/annees').set(auth(t)).send({
      libelle: '2028-2029', date_debut: '2029-07-31', date_fin: '2028-10-01',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'PERIODE_INVALIDE');
  });

  test('un identifiant qui n\'est pas un UUID donne 404, jamais 500', async () => {
    const t = await login('+22890000001');
    const res = await api().get('/api/referentiel/annees/pas-un-uuid').set(auth(t));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ANNEE_INTROUVABLE');
  });

  test('refuse une transition de statut interdite (409)', async () => {
    const t = await login('+22890000001');

    const cloture = await api()
      .patch(`/api/referentiel/annees/${anneeFuture}/statut`)
      .set(auth(t)).send({ statut: 'cloturee' });
    assert.equal(cloture.status, 200);

    const reouverture = await api()
      .patch(`/api/referentiel/annees/${anneeFuture}/statut`)
      .set(auth(t)).send({ statut: 'ouverte' });
    assert.equal(reouverture.status, 409);
    assert.equal(reouverture.body.error.code, 'TRANSITION_INTERDITE');
  });

  test('refuse une session en double et un type inconnu', async () => {
    const t = await login('+22890000001');

    const doublon = await api()
      .post(`/api/referentiel/annees/${ANNEE_SEED}/sessions`)
      .set(auth(t)).send({ type: 'normale' });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.body.error.code, 'SESSION_DUPLIQUEE');

    const typeInconnu = await api()
      .post(`/api/referentiel/annees/${ANNEE_SEED}/sessions`)
      .set(auth(t)).send({ type: 'finale' });
    assert.equal(typeInconnu.status, 400);
    assert.equal(typeInconnu.body.error.code, 'TYPE_INVALIDE');
  });

  test('refuse de supprimer une année portant des promotions (409)', async () => {
    const t = await login('+22890000001');
    const res = await api().delete(`/api/referentiel/annees/${ANNEE_SEED}`).set(auth(t));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ANNEE_UTILISEE');
  });
});

// ── API structure : facultés et filières (établissement) ───────
describe('API structure — facultés et filières', () => {
  const FACULTE_SEED = '60000000-0000-0000-0000-000000000001';
  let faculteId;

  test('crée une faculté et normalise son code en majuscules', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/structure/facultes').set(auth(t)).send({
      nom: 'Faculté des Sciences et Techniques', code: 'fst',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.faculte.code, 'FST');
    faculteId = res.body.data.faculte.id;
  });

  test('refuse un code de faculté déjà pris dans l\'établissement (409)', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/structure/facultes').set(auth(t)).send({
      nom: 'Doublon', code: 'FST',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CODE_DUPLIQUE');
  });

  test('refuse une filière sans faculté, ou avec une durée hors bornes', async () => {
    const t = await login('+22890000002');

    const sansFaculte = await api().post('/api/structure/filieres').set(auth(t)).send({
      nom: 'Orpheline', code: 'ORP', type_diplome: 'licence',
    });
    assert.equal(sansFaculte.status, 400);
    assert.equal(sansFaculte.body.error.code, 'CHAMP_REQUIS');

    const dureeFolle = await api().post('/api/structure/filieres').set(auth(t)).send({
      faculte_id: faculteId, nom: 'Longue', code: 'LNG', type_diplome: 'licence', duree_annees: 12,
    });
    assert.equal(dureeFolle.status, 400);
    assert.equal(dureeFolle.body.error.code, 'DUREE_INVALIDE');
  });

  test('refuse de supprimer une faculté portant des filières (409)', async () => {
    const t = await login('+22890000002');
    const res = await api().delete(`/api/structure/facultes/${FACULTE_SEED}`).set(auth(t));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'FACULTE_UTILISEE');
  });

  test('un autre établissement ne voit pas cette faculté (404, pas 403)', async () => {
    const t = await login('+22890000200'); // agent de l'établissement B
    const res = await api().get(`/api/structure/facultes/${FACULTE_SEED}`).set(auth(t));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'FACULTE_INTROUVABLE');
  });
});

// ── API promotions et inscriptions (établissement) ─────────────
describe('API promotions — cycle de vie et inscriptions', () => {
  const ANNEE_SEED = '50000000-0000-0000-0000-000000000001';
  const FILIERE_GL = '70000000-0000-0000-0000-000000000001';
  const KOFFI = '30000000-0000-0000-0000-000000000001';
  let promotionId;
  let inscriptionId;

  test('refuse un niveau supérieur à la durée du cursus (400)', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/promotions').set(auth(t)).send({
      filiere_id: FILIERE_GL, annee_id: ANNEE_SEED, libelle: 'Licence 5 GL', niveau: 5,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'NIVEAU_HORS_CURSUS');
  });

  test('refuse une promotion en doublon sur (filière, niveau, année) — 409', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/promotions').set(auth(t)).send({
      filiere_id: FILIERE_GL, annee_id: ANNEE_SEED, libelle: 'Doublon L3', niveau: 3,
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PROMOTION_DUPLIQUEE');
  });

  test('refuse une session appartenant à une autre année (400)', async () => {
    const ministere = await login('+22890000001');
    const autreAnnee = await api().post('/api/referentiel/annees').set(auth(ministere)).send({
      libelle: '2029-2030', date_debut: '2029-10-01', date_fin: '2030-07-31',
    });
    const sessionAilleurs = await api()
      .post(`/api/referentiel/annees/${autreAnnee.body.data.annee.id}/sessions`)
      .set(auth(ministere)).send({ type: 'normale' });

    const t = await login('+22890000002');
    const res = await api().post('/api/promotions').set(auth(t)).send({
      filiere_id: FILIERE_GL, annee_id: ANNEE_SEED, libelle: 'Licence 2 GL', niveau: 2,
      session_id: sessionAilleurs.body.data.session.id,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'SESSION_HORS_ANNEE');
  });

  test('crée une promotion en brouillon', async () => {
    const t = await login('+22890000002');
    const res = await api().post('/api/promotions').set(auth(t)).send({
      filiere_id: FILIERE_GL, annee_id: ANNEE_SEED,
      libelle: 'Licence 1 Génie Logiciel — 2024-2025', niveau: 1, effectif_prevu: 40,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.promotion.statut, 'brouillon');
    assert.equal(res.body.data.promotion.effectif_inscrit, 0);
    promotionId = res.body.data.promotion.id;
  });

  test('refuse une transition qui saute des étapes (409)', async () => {
    const t = await login('+22890000002');
    const res = await api()
      .patch(`/api/promotions/${promotionId}/statut`)
      .set(auth(t)).send({ statut: 'certifiee' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'TRANSITION_INTERDITE');
  });

  test('refuse de transmettre une promotion sans aucun inscrit (409)', async () => {
    const t = await login('+22890000002');
    await api().patch(`/api/promotions/${promotionId}/statut`).set(auth(t)).send({ statut: 'ouverte' });

    const res = await api()
      .patch(`/api/promotions/${promotionId}/statut`)
      .set(auth(t)).send({ statut: 'transmise' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PROMOTION_VIDE');
  });

  test('n\'inscrit que les étudiants de son propre établissement', async () => {
    const autreEtab = await login('+22890000200');
    const intrus = await api()
      .post(`/api/promotions/${promotionId}/inscriptions`)
      .set(auth(autreEtab)).send({ candidat_id: KOFFI });
    // La promotion elle-même appartient à un autre établissement.
    assert.equal(intrus.status, 404);
    assert.equal(intrus.body.error.code, 'PROMOTION_INTROUVABLE');

    const t = await login('+22890000002');
    const ok = await api()
      .post(`/api/promotions/${promotionId}/inscriptions`)
      .set(auth(t)).send({ candidat_id: KOFFI });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.inscription.statut, 'inscrit');
    inscriptionId = ok.body.data.inscription.id;

    const doublon = await api()
      .post(`/api/promotions/${promotionId}/inscriptions`)
      .set(auth(t)).send({ candidat_id: KOFFI });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.body.error.code, 'INSCRIPTION_DUPLIQUEE');
  });

  test('refuse une mention sans admission et une moyenne hors barème', async () => {
    const t = await login('+22890000002');

    const mention = await api()
      .put(`/api/promotions/${promotionId}/inscriptions/${inscriptionId}`)
      .set(auth(t)).send({ statut: 'ajourne', mention: 'bien' });
    assert.equal(mention.status, 400);
    assert.equal(mention.body.error.code, 'MENTION_NON_AUTORISEE');

    const moyenne = await api()
      .put(`/api/promotions/${promotionId}/inscriptions/${inscriptionId}`)
      .set(auth(t)).send({ statut: 'admis', moyenne: 25 });
    assert.equal(moyenne.status, 400);
    assert.equal(moyenne.body.error.code, 'MOYENNE_INVALIDE');

    const ok = await api()
      .put(`/api/promotions/${promotionId}/inscriptions/${inscriptionId}`)
      .set(auth(t)).send({ statut: 'admis', moyenne: 15.5, mention: 'bien' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.inscription.mention, 'bien');
  });

  test('fige la composition dès que la promotion est transmise (409)', async () => {
    const t = await login('+22890000002');

    const transmise = await api()
      .patch(`/api/promotions/${promotionId}/statut`)
      .set(auth(t)).send({ statut: 'transmise' });
    assert.equal(transmise.status, 200);
    assert.equal(transmise.body.data.promotion.effectif_inscrit, 1);

    const ajout = await api()
      .post(`/api/promotions/${promotionId}/inscriptions`)
      .set(auth(t)).send({ candidat_id: '30000000-0000-0000-0000-000000000002' });
    assert.equal(ajout.status, 409);
    assert.equal(ajout.body.error.code, 'PROMOTION_FIGEE');

    const suppression = await api().delete(`/api/promotions/${promotionId}`).set(auth(t));
    assert.equal(suppression.status, 409);
    assert.equal(suppression.body.error.code, 'PROMOTION_FIGEE');
  });

  test('restitue le parcours pluriannuel d\'un étudiant', async () => {
    const t = await login('+22890000002');
    const res = await api().get(`/api/promotions/parcours/${KOFFI}`).set(auth(t));
    assert.equal(res.status, 200);

    const niveaux = res.body.data.parcours.map((p) => p.niveau);
    assert.deepEqual(niveaux, [1, 3], 'les deux inscriptions de Koffi, triées par année puis niveau');
  });

  test('un étudiant d\'un autre établissement reste introuvable (404)', async () => {
    const t = await login('+22890000200');
    const res = await api().get(`/api/promotions/parcours/${KOFFI}`).set(auth(t));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CANDIDAT_INTROUVABLE');
  });
});

// ── Identité nationale : une personne, plusieurs établissements ─
// C'est le cas que l'ancien modèle rendait impossible : un diplômé de deux
// établissements ne pouvait pas voir ses deux diplômes au même endroit.
describe('Identité nationale et portefeuille multi-établissements', () => {
  const TEL_KOFFI = '+22890000011';
  const TEL_NOUVEAU = '+22890000777';
  let ficheKoffiEtabB;
  let ficheNouveau;

  test('regroupe sous une même personne deux fiches d\'établissements différents', async () => {
    const tB = await login('+22890000200'); // agent de l'établissement B

    const res = await api().post('/api/candidats').set(auth(tB)).send({
      numero_etudiant: 'EST-2024-001',
      nom: 'AGBEKO',
      prenom: 'Koffi',
      telephone: TEL_KOFFI, // même numéro que sa fiche IAI
      date_naissance: '2000-03-15',
    });
    assert.equal(res.status, 201);
    ficheKoffiEtabB = res.body.data.candidat.id;

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS fiches, COUNT(DISTINCT personne_id)::int AS personnes
         FROM candidats WHERE telephone = $1`,
      [TEL_KOFFI]
    );
    assert.equal(rows[0].fiches, 2, 'deux fiches étudiant');
    assert.equal(rows[0].personnes, 1, 'mais une seule personne');
  });

  test('crée le compte de connexion désactivé dès la saisie', async () => {
    const tB = await login('+22890000200');

    const res = await api().post('/api/candidats').set(auth(tB)).send({
      numero_etudiant: 'EST-2024-002',
      nom: 'TCHALLA',
      prenom: 'Essi',
      telephone: TEL_NOUVEAU,
    });
    assert.equal(res.status, 201);
    ficheNouveau = res.body.data.candidat.id;

    const { rows } = await pool.query(
      `SELECT actif, role FROM utilisateurs WHERE telephone = $1`,
      [TEL_NOUVEAU]
    );
    assert.equal(rows.length, 1, 'un compte a été créé');
    assert.equal(rows[0].role, 'candidat');
    assert.equal(rows[0].actif, false, 'mais il est fermé');

    // Tant qu'aucun diplôme n'est certifié, la connexion est refusée.
    const otp = await api().post('/api/auth/request-otp').send({ telephone: TEL_NOUVEAU });
    assert.equal(otp.status, 403);
    assert.equal(otp.body.error.code, 'COMPTE_INACTIF');
  });

  test('la certification ouvre le compte du diplômé', async () => {
    const tB = await login('+22890000200');
    const tMin = await login('+22890000001');

    const dossier = await api().post('/api/dossiers').set(auth(tB)).send({
      candidat_id: ficheNouveau,
      type_diplome: 'master',
      mention: 'tres_bien',
      filiere: 'Réseaux',
      date_obtention: '2025-07-01',
    });
    assert.equal(dossier.status, 201);
    const id = dossier.body.data.dossier.id;

    await api().post(`/api/dossiers/${id}/transmettre`).set(auth(tB));
    await api().post(`/api/ministere/dossiers/${id}/valider`).set(auth(tMin));
    const cert = await api().post(`/api/ministere/dossiers/${id}/certifier`).set(auth(tMin));
    assert.equal(cert.status, 201);

    const { rows } = await pool.query(`SELECT actif FROM utilisateurs WHERE telephone = $1`, [
      TEL_NOUVEAU,
    ]);
    assert.equal(rows[0].actif, true, 'le compte est désormais ouvert');

    // Et la connexion fonctionne.
    assert.ok(await login(TEL_NOUVEAU));
  });

  test('le portefeuille agrège les diplômes des deux établissements', async () => {
    const tB = await login('+22890000200');
    const tMin = await login('+22890000001');

    // Un second diplôme pour Koffi, délivré cette fois par l'établissement B.
    const dossier = await api().post('/api/dossiers').set(auth(tB)).send({
      candidat_id: ficheKoffiEtabB,
      type_diplome: 'master',
      mention: 'bien',
      filiere: 'Systèmes d\'information',
      date_obtention: '2026-07-01',
    });
    const id = dossier.body.data.dossier.id;
    await api().post(`/api/dossiers/${id}/transmettre`).set(auth(tB));
    await api().post(`/api/ministere/dossiers/${id}/valider`).set(auth(tMin));
    assert.equal(
      (await api().post(`/api/ministere/dossiers/${id}/certifier`).set(auth(tMin))).status,
      201
    );

    const tKoffi = await login(TEL_KOFFI);
    const res = await api().get('/api/candidat/diplomes').set(auth(tKoffi));
    assert.equal(res.status, 200);

    const etablissements = new Set(res.body.data.diplomes.map((d) => d.etablissement));
    assert.ok(
      etablissements.size >= 2,
      `le portefeuille doit couvrir plusieurs établissements, reçu : ${[...etablissements].join(', ')}`
    );
    assert.ok(etablissements.has('École Supérieure de Test'));
  });
});
