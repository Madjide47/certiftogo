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
  await db.query(fs.readFileSync(path.join(__dirname, '../migrations/001_init_schema.sql'), 'utf8'));
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
