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
import ExcelJS from 'exceljs';
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

  test('le ministère agrée un établissement, son code et son agent principal', async () => {
    const t = await login('+22890000001');

    const ok = await api().post('/api/ministere/etablissements').set(auth(t)).send({
      nom: 'École Supérieure de Test',
      type: 'ecole',
      ville: 'Kara',
      email: 'contact@est.tg',
      telephone: '+22890111222',
      types_diplomes: ['licence', 'master'],
      agent_principal: { nom: 'AGENT', prenom: 'B', telephone: AGENT_B },
    });
    assert.equal(ok.status, 201);
    etabBId = ok.body.data.etablissement.id;

    // Code officiel dérivé des initiales : « École Supérieure de Test ».
    assert.match(ok.body.data.etablissement.code, /^EST\d{3}$/);
    assert.equal(ok.body.data.agent_principal.est_agent_principal, true);
    assert.deepEqual(ok.body.data.habilitations, ['licence', 'master']);

    const ko = await api().post('/api/ministere/etablissements').set(auth(t)).send({
      nom: 'Type Invalide',
      type: 'garderie',
      ville: 'Lomé',
      email: 'x@y.tg',
      types_diplomes: ['licence'],
      agent_principal: { nom: 'X', prenom: 'Y', telephone: '+22890999888' },
    });
    assert.equal(ko.status, 400);
    assert.equal(ko.body.error.code, 'TYPE_INVALIDE');
  });

  test('refuse un agrément sans habilitation ni agent principal', async () => {
    const t = await login('+22890000001');

    const sansHabilitation = await api().post('/api/ministere/etablissements').set(auth(t)).send({
      nom: 'Sans Habilitation', type: 'ecole', ville: 'Lomé', email: 'a@b.tg',
      agent_principal: { nom: 'A', prenom: 'B', telephone: '+22890999777' },
    });
    assert.equal(sansHabilitation.status, 400);
    assert.equal(sansHabilitation.body.error.code, 'HABILITATION_REQUISE');

    const sansAgent = await api().post('/api/ministere/etablissements').set(auth(t)).send({
      nom: 'Sans Agent', type: 'ecole', ville: 'Lomé', email: 'a@b.tg',
      types_diplomes: ['licence'],
    });
    assert.equal(sansAgent.status, 400);
    assert.equal(sansAgent.body.error.code, 'CHAMP_REQUIS');
  });

  test('l\'administrateur ne peut plus agréer un établissement (404)', async () => {
    const t = await login('+22890000003');
    const res = await api().post('/api/admin/etablissements').set(auth(t)).send({
      nom: 'Par Admin', type: 'ecole', ville: 'Lomé', email: 'a@b.tg',
    });
    assert.equal(res.status, 404, 'la route a été retirée : l\'agrément revient au ministère');
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

  test('l\'agent principal créé avec l\'établissement peut se connecter', async () => {
    const token = await login(AGENT_B); // login OTP du compte créé à l'agrément
    assert.ok(token);

    const moi = await api().get('/api/auth/me').set(auth(token));
    assert.equal(moi.body.data.utilisateur.role, 'etablissement');
    assert.equal(moi.body.data.utilisateur.est_agent_principal, true);
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
      .post(`/api/promotions/${promotionId}/transmettre`)
      .set(auth(t)).send({ date_deliberation: '2025-07-15' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PROMOTION_VIDE');
  });

  test('le statut « transmise » n\'est pas atteignable par un simple PATCH', async () => {
    const t = await login('+22890000002');
    const res = await api()
      .patch(`/api/promotions/${promotionId}/statut`)
      .set(auth(t)).send({ statut: 'transmise' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'TRANSMISSION_DEDIEE');
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
      .post(`/api/promotions/${promotionId}/transmettre`)
      .set(auth(t)).send({ date_deliberation: '2025-07-15' });
    assert.equal(transmise.status, 201);
    assert.equal(transmise.body.data.transmis, 1, 'seul l\'étudiant admis est transmis');

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

// ── Gouvernance : agrément, habilitations, agents ──────────────
describe('Gouvernance — demandes d\'intégration et habilitations', () => {
  const IAI = '20000000-0000-0000-0000-000000000001';
  let demandeId;
  let reference;
  let agentOrdinaire;

  test('un établissement dépose une demande sans posséder de compte', async () => {
    const res = await api().post('/api/demandes-integration').send({
      nom: 'Université Populaire du Nord',
      type: 'universite',
      ville: 'Dapaong',
      email: 'contact@upn.tg',
      telephone: '+22890222333',
      responsable_nom: 'BAWA',
      responsable_prenom: 'Fataou',
      responsable_telephone: '+22890222334',
      types_diplomes_demandes: ['licence', 'master'],
      message: 'Nous souhaitons intégrer CertifTOGO.',
    });
    assert.equal(res.status, 201, 'aucune authentification requise');
    assert.match(res.body.data.reference, /^DI-\d{4}-\d{5}$/);
    reference = res.body.data.reference;
  });

  test('le suivi public expose le statut, pas les données internes', async () => {
    const res = await api().get(`/api/demandes-integration/${reference}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.demande.statut, 'soumise');
    assert.equal(res.body.data.demande.email, undefined, 'vue restreinte');

    const inconnue = await api().get('/api/demandes-integration/DI-2000-00000');
    assert.equal(inconnue.status, 404);
  });

  test('refuse une demande portant un type de diplôme inconnu', async () => {
    const res = await api().post('/api/demandes-integration').send({
      nom: 'École Fantaisie', type: 'ecole', ville: 'Lomé',
      email: 'x@y.tg', telephone: '+22890222999',
      responsable_nom: 'A', responsable_prenom: 'B', responsable_telephone: '+22890222998',
      types_diplomes_demandes: ['licence', 'habilitation_magique'],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'TYPE_DIPLOME_INVALIDE');
  });

  test('le ministère instruit puis accepte la demande', async () => {
    const t = await login('+22890000001');

    const liste = await api().get('/api/ministere/demandes?statut=soumise').set(auth(t));
    assert.equal(liste.status, 200);
    const demande = liste.body.data.demandes.find((d) => d.reference === reference);
    assert.ok(demande, 'la demande apparaît dans la file du ministère');
    demandeId = demande.id;

    const examen = await api()
      .post(`/api/ministere/demandes/${demandeId}/examiner`)
      .set(auth(t));
    assert.equal(examen.body.data.demande.statut, 'en_examen');

    const acceptation = await api()
      .post(`/api/ministere/demandes/${demandeId}/accepter`)
      .set(auth(t))
      .send({ reference_arrete: 'ARR-2026-042' });
    assert.equal(acceptation.status, 201);

    // L'agrément crée l'établissement, son code et son agent principal.
    assert.match(acceptation.body.data.etablissement.code, /^UPN\d{3}$/);
    assert.equal(acceptation.body.data.agent_principal.telephone, '+22890222334');
    assert.equal(acceptation.body.data.demande.statut, 'acceptee');
    assert.equal(
      acceptation.body.data.demande.etablissement_id,
      acceptation.body.data.etablissement.id,
      'la décision reste traçable jusqu\'à l\'établissement créé'
    );

    // Le responsable désigné peut désormais se connecter.
    assert.ok(await login('+22890222334'));
  });

  test('une demande déjà traitée ne se réinstruit pas (409)', async () => {
    const t = await login('+22890000001');
    const res = await api().post(`/api/ministere/demandes/${demandeId}/refuser`).set(auth(t)).send({
      motif: 'Changement d\'avis',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DEMANDE_DEJA_TRAITEE');
  });

  test('un refus exige un motif', async () => {
    const t = await login('+22890000001');

    const depot = await api().post('/api/demandes-integration').send({
      nom: 'Institut Douteux', type: 'institut', ville: 'Lomé',
      email: 'x@douteux.tg', telephone: '+22890333444',
      responsable_nom: 'C', responsable_prenom: 'D', responsable_telephone: '+22890333445',
      types_diplomes_demandes: ['licence'],
    });
    const liste = await api().get('/api/ministere/demandes').set(auth(t));
    const id = liste.body.data.demandes.find((d) => d.reference === depot.body.data.reference).id;

    const sansMotif = await api().post(`/api/ministere/demandes/${id}/refuser`).set(auth(t)).send({});
    assert.equal(sansMotif.status, 400);
    assert.equal(sansMotif.body.error.code, 'MOTIF_REQUIS');

    const avecMotif = await api()
      .post(`/api/ministere/demandes/${id}/refuser`)
      .set(auth(t))
      .send({ motif: 'Établissement non reconnu par l\'État.' });
    assert.equal(avecMotif.body.data.demande.statut, 'refusee');

    // Le motif est visible dans le suivi public.
    const suivi = await api().get(`/api/demandes-integration/${depot.body.data.reference}`);
    assert.match(suivi.body.data.demande.motif_refus, /non reconnu/);
  });

  test('gère les habilitations d\'un établissement', async () => {
    const t = await login('+22890000001');

    const initiales = await api().get(`/api/ministere/etablissements/${IAI}/habilitations`).set(auth(t));
    assert.equal(initiales.status, 200);
    const types = initiales.body.data.habilitations.map((h) => h.type_diplome);
    assert.ok(types.includes('licence'), 'reprise automatique à la migration');

    // Doublon sur un type déjà actif.
    const doublon = await api()
      .post(`/api/ministere/etablissements/${IAI}/habilitations`)
      .set(auth(t)).send({ type_diplome: 'licence' });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.body.error.code, 'HABILITATION_EXISTANTE');

    // Un type non encore accordé passe.
    const manquant = ['licence', 'master', 'doctorat', 'certificat', 'bts'].find(
      (t2) => !types.includes(t2)
    );
    if (manquant) {
      const ajout = await api()
        .post(`/api/ministere/etablissements/${IAI}/habilitations`)
        .set(auth(t)).send({ type_diplome: manquant, reference_arrete: 'ARR-2026-100' });
      assert.equal(ajout.status, 201);

      // Une fois suspendue, la place se libère.
      const suspension = await api()
        .patch(`/api/ministere/habilitations/${ajout.body.data.habilitation.id}/statut`)
        .set(auth(t)).send({ statut: 'suspendue' });
      assert.equal(suspension.body.data.habilitation.statut, 'suspendue');
    }
  });

  test('seul l\'agent principal peut créer des agents', async () => {
    const principal = await login('+22890000002'); // agent principal de l'IAI

    const cree = await api().post('/api/structure/agents').set(auth(principal)).send({
      nom: 'AKOSSIWA', prenom: 'Adjo', telephone: '+22890444555',
    });
    assert.equal(cree.status, 201);
    assert.equal(cree.body.data.agent.est_agent_principal, false, 'un agent créé reste ordinaire');
    agentOrdinaire = cree.body.data.agent.telephone;

    const liste = await api().get('/api/structure/agents').set(auth(principal));
    assert.ok(liste.body.data.agents.some((a) => a.telephone === agentOrdinaire));

    // L'agent ordinaire ne peut pas propager le droit.
    const ordinaire = await login(agentOrdinaire);
    const refus = await api().post('/api/structure/agents').set(auth(ordinaire)).send({
      nom: 'AUTRE', prenom: 'Agent', telephone: '+22890444556',
    });
    assert.equal(refus.status, 403);
    assert.equal(refus.body.error.code, 'AGENT_PRINCIPAL_REQUIS');
  });

  test('refuse un agent dont le numéro est déjà pris (409)', async () => {
    const principal = await login('+22890000002');
    const res = await api().post('/api/structure/agents').set(auth(principal)).send({
      nom: 'DOUBLON', prenom: 'Tel', telephone: '+22890000001',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'TELEPHONE_EXISTANT');
  });
});

// ── Import Excel d'une promotion entière ───────────────────────
describe('Import Excel — promotion entière', () => {
  const PROMO_SEED = '80000000-0000-0000-0000-000000000001'; // L3 GL, statut « ouverte »
  const ENTETES = ['matricule', 'nom', 'prenom', 'telephone', 'sexe', 'moyenne', 'mention'];

  /** Construit un classeur .xlsx en mémoire. */
  async function fichier(lignes, entetes = ENTETES) {
    const classeur = new ExcelJS.Workbook();
    const feuille = classeur.addWorksheet('Étudiants');
    feuille.addRow(entetes);
    lignes.forEach((l) => feuille.addRow(l));
    return Buffer.from(await classeur.xlsx.writeBuffer());
  }

  const envoyer = (token, buffer, params = '') =>
    api()
      .post(`/api/promotions/${PROMO_SEED}/import${params}`)
      .set(auth(token))
      .attach('fichier', buffer, 'promotion.xlsx');

  async function compterInscrits() {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM inscriptions WHERE promotion_id = $1`,
      [PROMO_SEED]
    );
    return rows[0].n;
  }

  test('la simulation signale chaque erreur avec son numéro de ligne', async () => {
    const t = await login('+22890000002');
    const avant = await compterInscrits();

    const buffer = await fichier([
      ['IMP-001', 'KODJO', 'Ayele', '+22891000001', 'F', 15, 'bien'],
      ['', 'SANSMAT', 'Ricule', '+22891000002', 'M', 12, ''], // matricule manquant
      ['IMP-001', 'DOUBLON', 'Matricule', '+22891000003', 'M', 11, ''], // doublon fichier
      ['IMP-004', 'TEL', 'Invalide', 'abc', 'M', 10, ''], // téléphone invalide
      ['IMP-005', 'MENTION', 'Inconnue', '+22891000005', 'M', 10, 'suprême'], // mention inconnue
      ['IMP-006', 'MOYENNE', 'Folle', '+22891000006', 'M', 45, ''], // hors barème
    ]);

    const res = await envoyer(t, buffer, '?simulation=true');
    assert.equal(res.status, 200);

    const { rapport } = res.body.data;
    assert.equal(res.body.data.simulation, true);
    assert.equal(rapport.total, 6);
    assert.equal(rapport.valides, 1, 'seule la première ligne est correcte');
    assert.equal(rapport.erreurs.length, 5);

    const lignes = rapport.erreurs.map((e) => e.ligne);
    assert.deepEqual(lignes, [3, 4, 5, 6, 7], 'numéros de ligne du fichier, en-tête comprise');

    const texte = JSON.stringify(rapport.erreurs);
    assert.match(texte, /matricule manquant/);
    assert.match(texte, /en double dans le fichier/);
    assert.match(texte, /téléphone invalide/);
    assert.match(texte, /mention inconnue/);
    assert.match(texte, /moyenne hors barème/);

    assert.equal(await compterInscrits(), avant, 'une simulation n\'écrit rien');
  });

  test('l\'import est strict : une erreur annule tout (422)', async () => {
    const t = await login('+22890000002');
    const avant = await compterInscrits();

    const buffer = await fichier([
      ['IMP-101', 'BONNE', 'Ligne', '+22891000101', 'F', 15, 'bien'],
      ['IMP-102', '', 'SansNom', '+22891000102', 'M', 12, ''],
    ]);

    const res = await envoyer(t, buffer);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'IMPORT_INVALIDE');

    assert.equal(await compterInscrits(), avant, 'aucune ligne importée');
    const { rows } = await pool.query(`SELECT 1 FROM candidats WHERE numero_etudiant = 'IMP-101'`);
    assert.equal(rows.length, 0, 'même la ligne valide n\'est pas passée');
  });

  test('importe la promotion et crée fiches, inscriptions et comptes fermés', async () => {
    const t = await login('+22890000002');
    const avant = await compterInscrits();

    const buffer = await fichier([
      ['IMP-201', 'ATTAH', 'Kodjo', '+22891000201', 'M', 16.5, 'tres_bien'],
      ['IMP-202', 'LAWSON', 'Afi', '+22891000202', 'F', 13, ''],
      ['IMP-203', 'SANSTEL', 'Komi', '', 'M', 11, ''],
    ]);

    const res = await envoyer(t, buffer);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.rapport.importes, 3);
    assert.equal(await compterInscrits(), avant + 3);

    // Une mention vaut délibération : l'inscription est « admis ».
    const { rows: admis } = await pool.query(
      `SELECT i.statut, i.mention, i.moyenne
         FROM inscriptions i JOIN candidats c ON c.id = i.candidat_id
        WHERE c.numero_etudiant = 'IMP-201'`
    );
    assert.equal(admis[0].statut, 'admis');
    assert.equal(admis[0].mention, 'tres_bien');
    assert.equal(Number(admis[0].moyenne), 16.5);

    // Sans mention, l'étudiant reste simplement inscrit.
    const { rows: inscrit } = await pool.query(
      `SELECT i.statut FROM inscriptions i JOIN candidats c ON c.id = i.candidat_id
        WHERE c.numero_etudiant = 'IMP-202'`
    );
    assert.equal(inscrit[0].statut, 'inscrit');

    // Compte de connexion créé mais fermé.
    const { rows: compte } = await pool.query(
      `SELECT actif FROM utilisateurs WHERE telephone = '+22891000201'`
    );
    assert.equal(compte.length, 1);
    assert.equal(compte[0].actif, false);

    // Sans téléphone : fiche et inscription, mais aucun compte.
    const { rows: sansTel } = await pool.query(
      `SELECT p.telephone FROM candidats c JOIN personnes p ON p.id = c.personne_id
        WHERE c.numero_etudiant = 'IMP-203'`
    );
    assert.equal(sansTel[0].telephone, null);
  });

  test('canonise les numéros locaux et rattache à la personne existante', async () => {
    const t = await login('+22890000002');

    // Ama existe déjà avec +22890000012 ; ici son numéro est saisi en local.
    const buffer = await fichier([['IMP-301', 'MENSAH', 'Ama', '90 00 00 12', 'F', 14, '']]);

    const res = await envoyer(t, buffer);
    assert.equal(res.status, 201);

    const { rows } = await pool.query(
      `SELECT c.telephone, c.personne_id FROM candidats c WHERE c.numero_etudiant = 'IMP-301'`
    );
    assert.equal(rows[0].telephone, '+22890000012', 'numéro ramené en forme internationale');

    const { rows: ama } = await pool.query(
      `SELECT id FROM personnes WHERE telephone = '+22890000012'`
    );
    assert.equal(rows[0].personne_id, ama[0].id, 'rattaché à la personne déjà connue');
  });

  test('refuse un matricule déjà présent dans l\'établissement', async () => {
    const t = await login('+22890000002');
    const buffer = await fichier([['IAI-2021-001', 'AGBEKO', 'Koffi', '+22890000011', 'M', 15, '']]);

    const res = await envoyer(t, buffer, '?simulation=true');
    assert.equal(res.status, 200);
    assert.match(JSON.stringify(res.body.data.rapport.erreurs), /déjà présent dans l'établissement/);
  });

  test('refuse un fichier sans les colonnes obligatoires', async () => {
    const t = await login('+22890000002');
    const buffer = await fichier([['x', 'y']], ['colonne_inconnue', 'autre']);

    const res = await envoyer(t, buffer, '?simulation=true');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'COLONNES_MANQUANTES');
  });

  test('refuse un format de fichier non supporté', async () => {
    const t = await login('+22890000002');
    const res = await api()
      .post(`/api/promotions/${PROMO_SEED}/import`)
      .set(auth(t))
      .attach('fichier', Buffer.from('nimportequoi'), 'diplome.pdf');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'FORMAT_NON_SUPPORTE');
  });

  test('fournit un modèle de fichier à remplir', async () => {
    const t = await login('+22890000002');
    // `responseType('blob')` : sans cela superagent décode le binaire en texte.
    const res = await api()
      .get('/api/promotions/modele-import')
      .set(auth(t))
      .responseType('blob');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /spreadsheetml/);

    // Le modèle doit être relisible par l'import lui-même.
    const classeur = new ExcelJS.Workbook();
    await classeur.xlsx.load(res.body);
    const entetes = [];
    classeur.worksheets[0].getRow(1).eachCell((c) => entetes.push(String(c.value)));
    assert.ok(entetes.includes('matricule'));
    assert.ok(entetes.includes('nom'));
    assert.ok(entetes.includes('prenom'));
  });

  test('refuse l\'import dans une promotion figée (409)', async () => {
    const t = await login('+22890000002');
    await pool.query(`UPDATE promotions SET statut = 'transmise' WHERE id = $1`, [PROMO_SEED]);

    const buffer = await fichier([['IMP-401', 'TROP', 'Tard', '+22891000401', 'M', 12, '']]);
    const res = await envoyer(t, buffer);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PROMOTION_FIGEE');

    await pool.query(`UPDATE promotions SET statut = 'ouverte' WHERE id = $1`, [PROMO_SEED]);
  });

  test('un autre établissement ne peut pas importer dans cette promotion', async () => {
    const t = await login('+22890000200');
    const buffer = await fichier([['IMP-501', 'INTRUS', 'Test', '+22891000501', 'M', 12, '']]);
    const res = await envoyer(t, buffer);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'PROMOTION_INTROUVABLE');
  });
});

// ── Journal d'audit, historique et corbeille ───────────────────
// La table existait depuis la Phase 1 mais aucun code ne l'alimentait.
describe('Audit — qui a fait quoi', () => {
  test('trace les connexions réussies avec leur auteur et leur origine', async () => {
    await login('+22890000002');

    const { rows } = await pool.query(
      `SELECT auteur_libelle, role, action, resultat, adresse_ip, user_agent, etablissement_id
         FROM journal_audit
        WHERE action = 'connexion_reussie'
        ORDER BY date_action DESC LIMIT 1`
    );
    assert.equal(rows.length, 1);
    assert.match(rows[0].auteur_libelle, /KOUASSI/);
    assert.equal(rows[0].role, 'etablissement');
    assert.equal(rows[0].resultat, 'succes');
    assert.ok(rows[0].adresse_ip, 'adresse IP capturée par le contexte de requête');
    assert.ok(rows[0].etablissement_id, 'rattachement conservé pour le cloisonnement');
  });

  test('trace les tentatives de connexion échouées', async () => {
    await api().post('/api/auth/request-otp').send({ telephone: '+22890000002' });
    const res = await api()
      .post('/api/auth/verify-otp')
      .send({ telephone: '+22890000002', code: '000000' });
    assert.equal(res.status, 401);

    const { rows } = await pool.query(
      `SELECT resultat, message FROM journal_audit
        WHERE action = 'connexion_echouee' ORDER BY date_action DESC LIMIT 1`
    );
    assert.equal(rows[0].resultat, 'echec');
    assert.match(rows[0].message, /\+22890000002/);
  });

  test('trace la certification avec sa transaction blockchain', async () => {
    const { rows } = await pool.query(
      `SELECT action, transaction_hash, valeurs_apres, etablissement_id
         FROM journal_audit
        WHERE action = 'diplome_certifie'
        ORDER BY date_action DESC LIMIT 1`
    );
    assert.ok(rows.length, 'des certifications ont eu lieu dans les tests précédents');
    assert.ok(rows[0].transaction_hash, 'corrélation avec l\'ancrage');
    assert.ok(rows[0].valeurs_apres.hash_sha256);
  });

  test('restitue la chronologie complète d\'un dossier', async () => {
    const { rows: dossiers } = await pool.query(
      `SELECT dossier_id FROM historique_statuts_dossier
        WHERE statut_apres = 'certifie'
        ORDER BY date_changement DESC LIMIT 1`
    );
    assert.ok(dossiers.length, 'des certifications ont eu lieu');

    const t = await login('+22890000001');
    const res = await api().get(`/api/journal/dossiers/${dossiers[0].dossier_id}`).set(auth(t));
    assert.equal(res.status, 200);

    const etapes = res.body.data.historique.map((h) => h.statut_apres);
    assert.equal(
      etapes[etapes.length - 1],
      'certifie',
      'la chronologie est ordonnée et se clôt sur la certification'
    );
    assert.ok(res.body.data.historique[0].auteur_libelle, 'chaque étape porte son auteur');
  });

  test('cloisonne le journal : un établissement ne voit que ses actions', async () => {
    const etab = await login('+22890000002');
    const res = await api().get('/api/journal?limit=200').set(auth(etab));
    assert.equal(res.status, 200);

    const { rows } = await pool.query(
      `SELECT id FROM etablissements WHERE code = 'IAI001'`
    );
    const iai = rows[0].id;

    assert.ok(res.body.data.entrees.length > 0);
    assert.ok(
      res.body.data.entrees.every((e) => e.etablissement_id === iai),
      'aucune entrée d\'un autre établissement ne fuit'
    );
  });

  test('refuse la consultation à un candidat (403)', async () => {
    const t = await login('+22890000011');
    const res = await api().get('/api/journal').set(auth(t));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ACCES_REFUSE');
  });

  test('exporte le journal en CSV', async () => {
    const t = await login('+22890000003');
    const res = await api()
      .get('/api/journal/export?action=connexion_reussie')
      .set(auth(t))
      .responseType('blob');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);

    const csv = res.body.toString('utf8');
    assert.match(csv.split('\n')[0], /date_action,auteur_libelle,role,action/);

    // L'export est lui-même un acte tracé.
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM journal_audit WHERE action = 'journal_exporte'`
    );
    assert.ok(rows[0].n >= 1);
  });

  test('protège la durée de conservation contre une purge trop agressive', async () => {
    const admin = await login('+22890000003');
    const trop = await api().post('/api/journal/purger').set(auth(admin)).send({ jours: 30 });
    assert.equal(trop.status, 400);
    assert.equal(trop.body.error.code, 'CONSERVATION_INSUFFISANTE');

    const ministere = await login('+22890000001');
    const refuse = await api().post('/api/journal/purger').set(auth(ministere)).send({ jours: 1825 });
    assert.equal(refuse.status, 403, 'la purge est réservée à l\'administrateur');
  });

  test('met en corbeille puis restaure un élément supprimé', async () => {
    const t = await login('+22890000002');

    const creation = await api().post('/api/candidats').set(auth(t)).send({
      numero_etudiant: 'CORB-001', nom: 'EPHEMERE', prenom: 'Test',
      telephone: '+22893000001',
    });
    assert.equal(creation.status, 201);
    const candidatId = creation.body.data.candidat.id;

    const suppression = await api().delete(`/api/candidats/${candidatId}`).set(auth(t));
    assert.equal(suppression.status, 200);

    const absent = await api().get(`/api/candidats/${candidatId}`).set(auth(t));
    assert.equal(absent.status, 404, 'la fiche a bien disparu');

    const corbeille = await api().get('/api/corbeille?table_source=candidats').set(auth(t));
    assert.equal(corbeille.status, 200);
    const element = corbeille.body.data.elements.find((e) => e.enregistrement_id === candidatId);
    assert.ok(element, 'la ligne supprimée est récupérable');
    assert.match(element.libelle, /EPHEMERE/);

    const restauration = await api()
      .post(`/api/corbeille/${element.id}/restaurer`)
      .set(auth(t));
    assert.equal(restauration.status, 200, JSON.stringify(restauration.body));

    // Réinsérée avec le MÊME identifiant : les références restent valides.
    const revenu = await api().get(`/api/candidats/${candidatId}`).set(auth(t));
    assert.equal(revenu.status, 200);
    assert.equal(revenu.body.data.candidat.numero_etudiant, 'CORB-001');

    // Une restauration ne se rejoue pas.
    const doublon = await api().post(`/api/corbeille/${element.id}/restaurer`).set(auth(t));
    assert.equal(doublon.status, 404);
  });

  test('un autre établissement ne voit pas la corbeille du premier', async () => {
    const autre = await login('+22890000200');
    const res = await api().get('/api/corbeille?table_source=candidats').set(auth(autre));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.elements.length, 0);
  });
});

// ── Transmission par lot et instruction par le ministère ────────
// Le chaînon qui manquait : la promotion passait « transmise » sans que
// le ministère ne reçoive quoi que ce soit.
describe('Lot de transmission — émission, contrôles, rejet partiel', () => {
  const FILIERE_GL = '70000000-0000-0000-0000-000000000001';
  const FILIERE_SR = '70000000-0000-0000-0000-000000000002';
  const FACULTE_CII = '60000000-0000-0000-0000-000000000001';
  const ANNEE = '50000000-0000-0000-0000-000000000001';
  const DELIBERATION = '2025-07-15';

  let promoGL;
  let lotGL;
  let dossiersGL;

  /** Crée une promotion peuplée, avec les résultats demandés. */
  async function preparerPromotion(token, { filiere_id, niveau, libelle, etudiants }) {
    const promo = await api().post('/api/promotions').set(auth(token)).send({
      filiere_id, annee_id: ANNEE, libelle, niveau,
    });
    assert.equal(promo.status, 201, JSON.stringify(promo.body));
    const promotionId = promo.body.data.promotion.id;

    for (const etudiant of etudiants) {
      const candidat = await api().post('/api/candidats').set(auth(token)).send({
        numero_etudiant: etudiant.matricule,
        nom: etudiant.nom,
        prenom: etudiant.prenom,
        telephone: etudiant.telephone,
        date_naissance: etudiant.date_naissance || '2000-01-01',
      });
      assert.equal(candidat.status, 201, JSON.stringify(candidat.body));

      const inscription = await api()
        .post(`/api/promotions/${promotionId}/inscriptions`)
        .set(auth(token))
        .send({ candidat_id: candidat.body.data.candidat.id });
      assert.equal(inscription.status, 201);

      await api()
        .put(`/api/promotions/${promotionId}/inscriptions/${inscription.body.data.inscription.id}`)
        .set(auth(token))
        .send({ statut: etudiant.statut, mention: etudiant.mention, moyenne: etudiant.moyenne });
    }

    await api()
      .patch(`/api/promotions/${promotionId}/statut`)
      .set(auth(token))
      .send({ statut: 'ouverte' });
    return promotionId;
  }

  test('ne transmet que les étudiants admis et crée un dossier par étudiant', async () => {
    const t = await login('+22890000002');

    promoGL = await preparerPromotion(t, {
      filiere_id: FILIERE_GL,
      niveau: 2,
      libelle: 'Licence 2 Génie Logiciel — lot',
      etudiants: [
        { matricule: 'LOT-001', nom: 'ADJO', prenom: 'Yawa', telephone: '+22892000001', statut: 'admis', mention: 'bien', moyenne: 14 },
        { matricule: 'LOT-002', nom: 'BEDJA', prenom: 'Komi', telephone: '+22892000002', statut: 'admis', mention: 'assez_bien', moyenne: 12 },
        { matricule: 'LOT-003', nom: 'CODJO', prenom: 'Ama', telephone: '+22892000003', statut: 'ajourne', moyenne: 8 },
      ],
    });

    const res = await api()
      .post(`/api/promotions/${promoGL}/transmettre`)
      .set(auth(t))
      .send({ date_deliberation: DELIBERATION });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.transmis, 2, 'les deux admis');
    assert.equal(res.body.data.non_transmis, 1, 'l\'ajourné reste en dehors');
    assert.match(res.body.data.lot.reference, /^LOT-\d{4}-\d{5}$/);
    assert.equal(res.body.data.lot.statut, 'transmis');
    lotGL = res.body.data.lot.id;

    const promo = await api().get(`/api/promotions/${promoGL}`).set(auth(t));
    assert.equal(promo.body.data.promotion.statut, 'transmise');
  });

  test('refuse une transmission sans date de délibération', async () => {
    const t = await login('+22890000002');
    const promo = await preparerPromotion(t, {
      filiere_id: FILIERE_SR, niveau: 1, libelle: 'L1 SR — sans délibération',
      etudiants: [
        { matricule: 'LOT-010', nom: 'SANS', prenom: 'Date', telephone: '+22892000010', statut: 'admis', mention: 'bien' },
      ],
    });

    const res = await api().post(`/api/promotions/${promo}/transmettre`).set(auth(t)).send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'DELIBERATION_REQUISE');
  });

  test('refuse une transmission quand aucun étudiant n\'est admis', async () => {
    const t = await login('+22890000002');
    const promo = await preparerPromotion(t, {
      filiere_id: FILIERE_SR, niveau: 2, libelle: 'L2 SR — tous ajournés',
      etudiants: [
        { matricule: 'LOT-020', nom: 'AJOURNE', prenom: 'Un', telephone: '+22892000020', statut: 'ajourne', moyenne: 7 },
      ],
    });

    const res = await api()
      .post(`/api/promotions/${promo}/transmettre`)
      .set(auth(t)).send({ date_deliberation: DELIBERATION });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'AUCUN_ADMIS');
  });

  test('le lot apparaît dans la file du ministère, pas les dossiers isolés', async () => {
    const t = await login('+22890000001');

    const file = await api().get('/api/ministere/lots?statut=transmis').set(auth(t));
    assert.equal(file.status, 200);
    const lot = file.body.data.lots.find((l) => l.id === lotGL);
    assert.ok(lot, 'le lot est en attente');
    assert.equal(lot.effectif, 2);
    assert.equal(lot.dossiers_total, 2);
    assert.equal(lot.etablissement_code, 'IAI001');
    assert.equal(lot.agent_nom, 'KOUASSI', 'traçabilité nominative de l\'émetteur');
  });

  test('les contrôles automatiques passent sur un lot conforme', async () => {
    const t = await login('+22890000001');

    const detail = await api().get(`/api/ministere/lots/${lotGL}`).set(auth(t));
    assert.equal(detail.status, 200);
    dossiersGL = detail.body.data.dossiers;

    const { controles } = detail.body.data;
    assert.equal(controles.synthese.dossiers_recus, 2);
    assert.equal(controles.synthese.dossiers_conformes, 2);
    assert.equal(controles.bloquants.length, 0, JSON.stringify(controles.bloquants));
    assert.deepEqual(controles.synthese.repartition_mentions, { bien: 1, assez_bien: 1 });
  });

  test('signale un établissement non habilité pour le type de diplôme', async () => {
    const tEtab = await login('+22890000002');
    const tMin = await login('+22890000001');

    // L'IAI est habilité pour licence et master, pas pour doctorat.
    const filiere = await api().post('/api/structure/filieres').set(auth(tEtab)).send({
      faculte_id: FACULTE_CII, nom: 'Doctorat Informatique', code: 'DOC',
      type_diplome: 'doctorat', duree_annees: 3,
    });
    assert.equal(filiere.status, 201);

    const promo = await preparerPromotion(tEtab, {
      filiere_id: filiere.body.data.filiere.id, niveau: 3, libelle: 'Doctorat — non habilité',
      etudiants: [
        { matricule: 'LOT-030', nom: 'DOCTEUR', prenom: 'Ami', telephone: '+22892000030', statut: 'admis', mention: 'tres_bien' },
      ],
    });

    const transmission = await api()
      .post(`/api/promotions/${promo}/transmettre`)
      .set(auth(tEtab)).send({ date_deliberation: DELIBERATION });
    assert.equal(transmission.status, 201, 'la transmission passe : le contrôle est côté ministère');

    const detail = await api()
      .get(`/api/ministere/lots/${transmission.body.data.lot.id}`)
      .set(auth(tMin));
    const { bloquants } = detail.body.data.controles;
    assert.equal(bloquants.length, 1);
    assert.match(bloquants[0].erreurs.join(' '), /non habilité/);

    const validation = await api()
      .post(`/api/ministere/lots/${transmission.body.data.lot.id}/valider`)
      .set(auth(tMin)).send({});
    assert.equal(validation.status, 409);
    assert.equal(validation.body.error.code, 'AUCUN_DOSSIER_VALIDABLE');
  });

  test('valide le lot en rejetant une partie des dossiers', async () => {
    const t = await login('+22890000001');

    const examen = await api().post(`/api/ministere/lots/${lotGL}/examiner`).set(auth(t));
    assert.equal(examen.status, 200);
    assert.equal(examen.body.data.lot.statut, 'en_examen');

    const aRejeter = dossiersGL[0];
    const res = await api()
      .post(`/api/ministere/lots/${lotGL}/valider`)
      .set(auth(t))
      .send({ dossiers_rejetes: [{ dossier_id: aRejeter.id, motif: 'Relevé de notes manquant.' }] });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.valides, 1);
    assert.equal(res.body.data.rejetes, 1);
    assert.equal(
      res.body.data.lot.statut,
      'partiellement_traite',
      'le lot avance sans être bloqué par un seul dossier'
    );

    const { rows } = await pool.query(`SELECT statut, motif_rejet FROM dossiers WHERE id = $1`, [
      aRejeter.id,
    ]);
    assert.equal(rows[0].statut, 'rejete');
    assert.match(rows[0].motif_rejet, /Relevé de notes/);

    const { rows: valides } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM dossiers WHERE lot_id = $1 AND statut = 'valide'`,
      [lotGL]
    );
    assert.equal(valides[0].n, 1, 'le dossier conforme est validé et certifiable');
  });

  test('un lot déjà traité ne se réinstruit pas', async () => {
    const t = await login('+22890000001');
    const res = await api()
      .post(`/api/ministere/lots/${lotGL}/valider`)
      .set(auth(t))
      .send({ dossiers_rejetes: [{ dossier_id: dossiersGL[1].id, motif: 'Trop tard.' }] });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'LOT_NON_INSTRUISABLE');
  });

  test('le rejet complet renvoie la promotion en correction', async () => {
    const tEtab = await login('+22890000002');
    const tMin = await login('+22890000001');

    const promo = await preparerPromotion(tEtab, {
      filiere_id: FILIERE_SR, niveau: 3, libelle: 'L3 SR — à rejeter',
      etudiants: [
        { matricule: 'LOT-040', nom: 'REJET', prenom: 'Complet', telephone: '+22892000040', statut: 'admis', mention: 'passable' },
      ],
    });
    const transmission = await api()
      .post(`/api/promotions/${promo}/transmettre`)
      .set(auth(tEtab)).send({ date_deliberation: DELIBERATION });
    const lotId = transmission.body.data.lot.id;

    const sansMotif = await api().post(`/api/ministere/lots/${lotId}/rejeter`).set(auth(tMin)).send({});
    assert.equal(sansMotif.status, 400);
    assert.equal(sansMotif.body.error.code, 'MOTIF_REQUIS');

    const rejet = await api()
      .post(`/api/ministere/lots/${lotId}/rejeter`)
      .set(auth(tMin)).send({ motif: 'Procès-verbal de délibération non conforme.' });
    assert.equal(rejet.status, 200);
    assert.equal(rejet.body.data.lot.statut, 'rejete');

    // La promotion redevient modifiable pour correction puis retransmission.
    const apres = await api().get(`/api/promotions/${promo}`).set(auth(tEtab));
    assert.equal(apres.body.data.promotion.statut, 'ouverte');

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM dossiers WHERE lot_id = $1 AND statut = 'rejete'`,
      [lotId]
    );
    assert.equal(rows[0].n, 1);
  });

  test('l\'établissement suit ses lots, un autre ne les voit pas', async () => {
    const mien = await login('+22890000002');
    const autre = await login('+22890000200');

    const liste = await api().get('/api/lots').set(auth(mien));
    assert.equal(liste.status, 200);
    assert.ok(liste.body.data.lots.some((l) => l.id === lotGL));

    const detail = await api().get(`/api/lots/${lotGL}`).set(auth(mien));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.dossiers.length, 2);

    const intrus = await api().get(`/api/lots/${lotGL}`).set(auth(autre));
    assert.equal(intrus.status, 404);
    assert.equal(intrus.body.error.code, 'LOT_INTROUVABLE');
  });

  // ── Certification de masse et file d'ancrage ─────────────────
  // 12 000 transactions blockchain dans un cycle HTTP dureraient 13 h.
  describe('Ancrage asynchrone', () => {
    let hashEnAttente;

    test('certifie le lot : les diplômes existent, l\'ancrage est mis en file', async () => {
      const t = await login('+22890000001');

      const res = await api().post(`/api/ministere/lots/${lotGL}/certifier`).set(auth(t));
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.data.diplomes_crees, 1, 'le seul dossier validé du lot');
      assert.deepEqual(res.body.data.echecs, []);

      const { rows } = await pool.query(
        `SELECT d.statut, d.hash_sha256, d.transaction_id
           FROM diplomes d JOIN dossiers do2 ON do2.id = d.dossier_id
          WHERE do2.lot_id = $1`,
        [lotGL]
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].statut, 'en_attente_ancrage', 'officiel en base, pas encore prouvé');
      assert.equal(rows[0].transaction_id, null);
      hashEnAttente = rows[0].hash_sha256;
    });

    test('la vérification publique annonce franchement l\'attente d\'ancrage', async () => {
      const res = await api().get(`/api/verification/${hashEnAttente}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.resultat, 'en_attente_ancrage');
      assert.match(res.body.data.message, /blockchain est en cours/);
    });

    test('affiche la progression du lot', async () => {
      const t = await login('+22890000001');
      const res = await api().get(`/api/ministere/lots/${lotGL}/ancrage`).set(auth(t));
      assert.equal(res.status, 200);
      assert.equal(res.body.data.progression.total, 1);
      assert.equal(res.body.data.progression.ancres, 0);
      assert.equal(res.body.data.progression.libelle, '0 / 1 ancrés');
    });

    test('le worker vide la file et bascule les diplômes en actif', async () => {
      const t = await login('+22890000001');

      const traitement = await api()
        .post('/api/ministere/ancrage/traiter')
        .set(auth(t)).send({ taille: 50 });
      assert.equal(traitement.status, 200);
      assert.equal(traitement.body.data.confirmees, 1);
      assert.equal(traitement.body.data.echouees, 0);

      const { rows } = await pool.query(
        `SELECT d.statut, d.transaction_id, t.gas_used, t.gas_price
           FROM diplomes d
           JOIN dossiers do2 ON do2.id = d.dossier_id
           JOIN transactions_blockchain t ON t.diplome_id = d.id
          WHERE do2.lot_id = $1`,
        [lotGL]
      );
      assert.equal(rows[0].statut, 'actif');
      assert.ok(rows[0].transaction_id, 'la transaction est enregistrée');
      assert.ok(rows[0].gas_used, 'gas_used n\'est plus NULL');
      assert.ok(rows[0].gas_price);

      const apres = await api().get(`/api/ministere/lots/${lotGL}/ancrage`).set(auth(t));
      assert.equal(apres.body.data.progression.libelle, '1 / 1 ancrés');
      assert.equal(apres.body.data.progression.pourcentage, 100);
    });

    test('le diplôme devient vérifiable publiquement une fois ancré', async () => {
      const res = await api().get(`/api/verification/${hashEnAttente}`);
      assert.equal(res.body.data.resultat, 'authentique');
      assert.equal(res.body.data.message, null);
    });

    test('la file est idempotente : un même ancrage ne s\'enfile pas deux fois', async () => {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM file_attente_ancrage WHERE lot_id = $1`,
        [lotGL]
      );
      assert.equal(rows[0].n, 1);

      // Une seconde certification du même lot est refusée en amont.
      const t = await login('+22890000001');
      const res = await api().post(`/api/ministere/lots/${lotGL}/certifier`).set(auth(t));
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'LOT_NON_CERTIFIABLE');
    });

    test('expose l\'état de la file et le coût cumulé par établissement', async () => {
      const t = await login('+22890000001');
      const res = await api().get('/api/ministere/ancrage').set(auth(t));
      assert.equal(res.status, 200);

      const confirmees = res.body.data.file.find((f) => f.statut === 'confirmee');
      assert.ok(confirmees && confirmees.total >= 1);

      const iai = res.body.data.couts.find((c) => c.code === 'IAI001');
      assert.ok(iai, 'le coût est ventilé par établissement');
      assert.ok(Number(iai.gas_total) > 0, 'le gaz consommé est enfin mesurable');
    });

    test('permet de relancer une tâche abandonnée', async () => {
      const t = await login('+22890000001');

      // On simule un abandon après épuisement des tentatives.
      const { rows } = await pool.query(
        `UPDATE file_attente_ancrage SET statut = 'abandonnee', tentatives = 5,
                derniere_erreur = 'RPC injoignable'
          WHERE lot_id = $1 RETURNING id`,
        [lotGL]
      );
      const tacheId = rows[0].id;

      const dlq = await api().get('/api/ministere/ancrage/abandonnees').set(auth(t));
      assert.equal(dlq.status, 200);
      assert.ok(dlq.body.data.taches.some((x) => x.id === tacheId));

      const relance = await api()
        .post(`/api/ministere/ancrage/${tacheId}/relancer`)
        .set(auth(t));
      assert.equal(relance.status, 200);
      assert.equal(relance.body.data.tache.statut, 'en_attente');
      assert.equal(relance.body.data.tache.tentatives, 0);

      // Une tâche non abandonnée ne se relance pas.
      const deuxieme = await api()
        .post(`/api/ministere/ancrage/${tacheId}/relancer`)
        .set(auth(t));
      assert.equal(deuxieme.status, 404);
    });
  });
});

// ── Notifications ──────────────────────────────────────────────
// Le système n'envoyait que l'OTP : personne n'était averti de rien.
describe('Notifications — catalogue, centre in-app et préférences', () => {
  async function compter(evenement, canal = 'in_app') {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE evenement = $1 AND canal = $2`,
      [evenement, canal]
    );
    return rows[0].n;
  }

  test('avertit le ministère qu\'un lot l\'attend', async () => {
    assert.ok(await compter('lot_recu'), 'la transmission a produit une notification');

    const { rows } = await pool.query(
      `SELECT n.sujet, n.corps, n.priorite, u.role
         FROM notifications n JOIN utilisateurs u ON u.id = n.destinataire_id
        WHERE n.evenement = 'lot_recu' ORDER BY n.date_creation DESC LIMIT 1`
    );
    assert.equal(rows[0].role, 'ministere');
    assert.match(rows[0].corps, /dossier\(s\)/);
    assert.equal(
      rows[0].corps.includes('{{'),
      false,
      'toutes les variables du modèle sont substituées'
    );
  });

  test('avertit l\'établissement du sort de son lot', async () => {
    assert.ok(await compter('lot_valide'), 'validation notifiée');
    assert.ok(await compter('lot_rejete'), 'rejet notifié');

    const { rows } = await pool.query(
      `SELECT corps, priorite FROM notifications
        WHERE evenement = 'lot_rejete' ORDER BY date_creation DESC LIMIT 1`
    );
    assert.equal(rows[0].priorite, 'haute');
    assert.match(rows[0].corps, /Motif/);
  });

  test('avertit le diplômé de sa certification, sur deux canaux', async () => {
    const { rows } = await pool.query(
      `SELECT canal, statut, destinataire_telephone FROM notifications
        WHERE evenement = 'diplome_certifie' ORDER BY date_creation DESC`
    );
    assert.ok(rows.length >= 2, 'in-app et WhatsApp');

    const canaux = new Set(rows.map((r) => r.canal));
    assert.ok(canaux.has('in_app'));
    assert.ok(canaux.has('whatsapp'));

    const whatsapp = rows.find((r) => r.canal === 'whatsapp');
    assert.equal(whatsapp.statut, 'envoyee', 'expédiée en mode mock');
    assert.ok(whatsapp.destinataire_telephone);
  });

  test('avertit l\'agent principal que son compte existe', async () => {
    assert.ok(await compter('compte_cree'), 'agrément et création d\'agent notifiés');
  });

  test('sert le centre de notifications et son compteur', async () => {
    const t = await login('+22890000001');

    const boite = await api().get('/api/notifications').set(auth(t));
    assert.equal(boite.status, 200);
    assert.ok(boite.body.data.notifications.length > 0);
    assert.ok(boite.body.data.non_lues > 0);
    assert.ok(boite.body.data.notifications.every((n) => n.canal === 'in_app'));

    const premiere = boite.body.data.notifications[0];
    const lue = await api().patch(`/api/notifications/${premiere.id}/lue`).set(auth(t));
    assert.equal(lue.status, 200);
    assert.equal(lue.body.data.notification.lue, true);

    const nonLues = await api().get('/api/notifications?non_lues=true').set(auth(t));
    assert.ok(nonLues.body.data.notifications.every((n) => n.lue === false));

    const tout = await api().post('/api/notifications/tout-lu').set(auth(t));
    assert.ok(tout.body.data.marquees >= 1);
    assert.equal((await api().get('/api/notifications').set(auth(t))).body.data.non_lues, 0);
  });

  test('ne livre la boîte que de son propre titulaire', async () => {
    const t = await login('+22890000002');
    const res = await api().get('/api/notifications').set(auth(t));
    assert.equal(res.status, 200);

    const { rows } = await pool.query(
      `SELECT id FROM utilisateurs WHERE telephone = '+22890000002'`
    );
    const { rows: fuites } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM notifications
        WHERE id = ANY($1::uuid[]) AND destinataire_id <> $2`,
      [res.body.data.notifications.map((n) => n.id), rows[0].id]
    );
    assert.equal(fuites[0].n, 0);
  });

  test('expose le catalogue et accepte un désabonnement', async () => {
    const t = await login('+22890000002');

    const prefs = await api().get('/api/notifications/preferences').set(auth(t));
    assert.equal(prefs.status, 200);
    assert.ok(prefs.body.data.catalogue.length >= 15, 'le catalogue est exhaustif');

    const examine = prefs.body.data.catalogue.find((c) => c.evenement === 'lot_examine');
    assert.equal(examine.desactivable, true);

    const refus = await api().put('/api/notifications/preferences').set(auth(t)).send({
      evenement: 'lot_examine', canal: 'in_app', actif: false,
    });
    assert.equal(refus.status, 200);
    assert.equal(refus.body.data.preference.actif, false);

    const apres = await api().get('/api/notifications/preferences').set(auth(t));
    assert.ok(apres.body.data.refus.some((r) => r.evenement === 'lot_examine'));
  });

  test('refuse de désactiver une notification critique', async () => {
    const t = await login('+22890000011'); // un diplômé

    const res = await api().put('/api/notifications/preferences').set(auth(t)).send({
      evenement: 'diplome_revoque', canal: 'whatsapp', actif: false,
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NOTIFICATION_CRITIQUE');
  });

  test('rejette un événement ou un canal inconnu', async () => {
    const t = await login('+22890000002');

    const evenement = await api().put('/api/notifications/preferences').set(auth(t)).send({
      evenement: 'fete_nationale', canal: 'in_app', actif: false,
    });
    assert.equal(evenement.status, 400);
    assert.equal(evenement.body.error.code, 'EVENEMENT_INCONNU');

    const canal = await api().put('/api/notifications/preferences').set(auth(t)).send({
      evenement: 'lot_valide', canal: 'pigeon', actif: false,
    });
    assert.equal(canal.status, 400);
    assert.equal(canal.body.error.code, 'CANAL_INCONNU');
  });

  test('réserve la supervision de la file à l\'administrateur', async () => {
    const etab = await login('+22890000002');
    assert.equal((await api().get('/api/notifications/supervision').set(auth(etab))).status, 403);

    const admin = await login('+22890000003');
    const res = await api().get('/api/notifications/supervision').set(auth(admin));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.repartition.some((r) => r.canal === 'in_app'));
  });
});
