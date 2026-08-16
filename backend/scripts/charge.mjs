// ─────────────────────────────────────────────────────────────
// Banc de charge — CDC §31.4 (P-03).
//
// Le cahier des charges affirme partout que le dispositif tient l'échelle
// nationale : 250 diplômés pour un institut, jusqu'à 12 000 pour
// l'Université de Lomé. L'affirmation n'avait jamais été mesurée. Ce
// script la met à l'épreuve, phase par phase, et sort des chiffres
// citables — y compris quand ils dérangent.
//
// Il ne mesure pas « le système » en bloc : une moyenne sur le parcours
// entier cacherait la phase qui coûte. Chaque étape est chronométrée
// séparément, parce que c'est la plus lente qui décide si un agent peut
// transmettre une promotion pendant sa pause déjeuner ou doit y passer
// la nuit.
//
// Usage :
//   node scripts/charge.mjs             # 2 000 étudiants (défaut)
//   node scripts/charge.mjs --effectif=12000
//   node scripts/charge.mjs --garder    # conserve la base après coup
//
// La base `certiftogo_charge` est recréée à chaque exécution : le banc ne
// touche jamais aux données de démonstration.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Arguments ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const lireOption = (nom, defaut) => {
  const trouve = args.find((a) => a.startsWith(`--${nom}=`));
  return trouve ? trouve.split('=')[1] : defaut;
};
const EFFECTIF = Number(lireOption('effectif', 2000));
const GARDER = args.includes('--garder');
const BASE = 'certiftogo_charge';

if (!Number.isInteger(EFFECTIF) || EFFECTIF < 1) {
  console.error(`Effectif invalide : ${lireOption('effectif')}`);
  process.exit(1);
}

// ── Environnement ──────────────────────────────────────────────────
// Fixé AVANT l'import de la configuration de base : dotenv n'écrase pas
// ce qui existe déjà, et `database.js` lit ses variables à l'import.
process.env.PGDATABASE = BASE;
process.env.PGPORT = process.env.PGPORT || '5433';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'charge_secret';
process.env.MINISTERE_SIGNING_SECRET =
  process.env.MINISTERE_SIGNING_SECRET || 'charge_secret_signature';
// Le banc mesure CertifTOGO, pas Polygon : en `onchain` on chronométrerait
// la latence d'un fournisseur RPC public et le résultat ne dirait plus rien
// du code. Le coût réel d'une transaction est mesuré ailleurs (§11).
process.env.BLOCKCHAIN_MODE = 'mock';
process.env.WHATSAPP_MODE = 'mock';
// Le contrôle à quatre yeux transformerait chaque certification de masse
// en demande d'approbation : hors sujet ici, et déjà couvert par les tests.
process.env.DOUBLE_VALIDATION = 'false';

const cfg = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER || 'certiftogo',
  password: process.env.PGPASSWORD || 'certiftogo_dev',
};

// ── Identifiants fixes du seed ─────────────────────────────────────
const MINISTERE_ID = '10000000-0000-0000-0000-000000000001';
const ETABLISSEMENT_ID = '20000000-0000-0000-0000-000000000001';
const AGENT_ETAB_ID = '40000000-0000-0000-0000-000000000002';
const AGENT_MIN_ID = '40000000-0000-0000-0000-000000000001';

// ── Chronométrage ──────────────────────────────────────────────────
const mesures = [];

async function phase(nom, unites, fn) {
  process.stdout.write(`  ${nom}… `);
  const debut = process.hrtime.bigint();
  const resultat = await fn();
  const ms = Number(process.hrtime.bigint() - debut) / 1e6;
  const n = typeof unites === 'function' ? unites(resultat) : unites;
  mesures.push({ nom, ms, unites: n });
  console.log(`${(ms / 1000).toFixed(1)} s`);
  return resultat;
}

// ── Préparation de la base ─────────────────────────────────────────
async function preparerBase() {
  const admin = new pg.Client({ ...cfg, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BASE}`);
  await admin.end();

  const db = new pg.Client({ ...cfg, database: BASE });
  await db.connect();
  const dossierMigrations = path.join(__dirname, '../migrations');
  for (const fichier of fs
    .readdirSync(dossierMigrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await db.query(fs.readFileSync(path.join(dossierMigrations, fichier), 'utf8'));
  }
  await db.query(fs.readFileSync(path.join(__dirname, '../seeds/seed_dev.sql'), 'utf8'));
  await db.end();
}

// ── Programme ──────────────────────────────────────────────────────
async function main() {
  console.log(`\nBanc de charge CertifTOGO — ${EFFECTIF} étudiants\n`);

  process.stdout.write('  préparation de la base… ');
  await preparerBase();
  console.log('ok');

  // Import APRÈS la création de la base : les modules ouvrent leur pool
  // à l'import, et se connecteraient à une base inexistante.
  const { query, pool } = await import('../src/config/database.js');
  const promotionService = await import('../src/services/promotion.service.js');
  const lotService = await import('../src/services/lot.service.js');
  const pieceService = await import('../src/services/piece-jointe.service.js');
  const ancrageService = await import('../src/services/ancrage.service.js');

  const agentEtab = { utilisateur_id: AGENT_ETAB_ID, role: 'etablissement', etablissement_id: ETABLISSEMENT_ID };

  // ── Référentiel : une filière, une promotion ─────────────────────
  const { rows: annees } = await query(
    `SELECT id, libelle FROM annees_academiques ORDER BY libelle DESC LIMIT 1`
  );
  const { rows: sessions } = await query(
    `SELECT id FROM sessions_academiques WHERE annee_id = $1 LIMIT 1`,
    [annees[0].id]
  );
  const { rows: fac } = await query(
    `INSERT INTO facultes (etablissement_id, nom, code, statut)
     VALUES ($1, 'Faculté de charge', 'F-CHARGE', 'active') RETURNING id`,
    [ETABLISSEMENT_ID]
  );
  const { rows: fil } = await query(
    `INSERT INTO filieres (faculte_id, nom, code, type_diplome, duree_annees, statut)
     VALUES ($1, 'Génie Logiciel', 'GL-CHARGE', 'licence', 3, 'active') RETURNING id`,
    [fac[0].id]
  );

  const promotion = await promotionService.creer(ETABLISSEMENT_ID, {
    filiere_id: fil[0].id,
    annee_id: annees[0].id,
    session_id: sessions[0].id,
    libelle: `Promotion de charge — ${EFFECTIF}`,
    niveau: 3,
    effectif_prevu: EFFECTIF,
  });
  await promotionService.changerStatut(promotion.id, ETABLISSEMENT_ID, 'ouverte');

  // ── Phase 1 : peupler la promotion ───────────────────────────────
  //
  // Insertion directe en SQL, par paquets. Ce n'est pas de la triche :
  // la voie réelle est l'import Excel, mesuré en phase 2 sur un
  // échantillon. Ici on veut une promotion pleine, pas chronométrer un
  // parseur de tableur.
  const candidats = [];
  await phase('création des étudiants', EFFECTIF, async () => {
    const PAQUET = 500;
    for (let debut = 0; debut < EFFECTIF; debut += PAQUET) {
      const taille = Math.min(PAQUET, EFFECTIF - debut);
      const indices = Array.from({ length: taille }, (_, i) => debut + i);

      const numeros = indices.map((n) => `CHARGE${String(n).padStart(6, '0')}`);
      const prenoms = indices.map((n) => `Prenom${n}`);
      const sexes = indices.map((n) => (n % 2 === 0 ? 'M' : 'F'));
      // Numéro unique et bien formé : la normalisation (A-16) refuserait
      // un doublon, et la transmission (A-17) refuse un étudiant sans
      // numéro — un banc qui les omettrait ne mesurerait pas le vrai
      // chemin.
      const telephones = indices.map((n) => `+2287${String(n).padStart(7, '0')}`);
      const noms = indices.map(() => 'ETUDIANT');

      // `unnest` de tableaux plutôt qu'une liste de VALUES : un seul jeu
      // de paramètres quelle que soit la taille du paquet, et des types
      // annoncés explicitement — PostgreSQL n'a rien à deviner.
      await query(
        `INSERT INTO personnes (nom, prenom, date_naissance, lieu_naissance, sexe, telephone)
         SELECT nom, prenom, '2001-05-14'::date, 'Lomé', sexe, tel
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
              AS v(nom, prenom, sexe, tel)`,
        [noms, prenoms, sexes, telephones]
      );

      const { rows: fiches } = await query(
        `INSERT INTO candidats (personne_id, numero_etudiant, nom, prenom, date_naissance,
                                lieu_naissance, sexe, telephone, etablissement_id)
         SELECT p.id, v.num, v.nom, v.prenom, '2001-05-14'::date, 'Lomé', v.sexe, v.tel, $6::uuid
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
              AS v(nom, prenom, sexe, tel, num)
         JOIN personnes p ON p.telephone = v.tel
         RETURNING id`,
        [noms, prenoms, sexes, telephones, numeros, ETABLISSEMENT_ID]
      );
      candidats.push(...fiches.map((f) => f.id));
    }
    return candidats.length;
  });

  // ── Phase 2 : inscriptions et résultats ─────────────────────────
  await phase('inscriptions et délibération', EFFECTIF, async () => {
    for (const candidat_id of candidats) {
      const inscription = await promotionService.inscrire(promotion.id, ETABLISSEMENT_ID, {
        candidat_id,
      });
      await promotionService.enregistrerResultat(
        promotion.id,
        inscription.id,
        ETABLISSEMENT_ID,
        { statut: 'admis', moyenne: (12 + (Math.random() * 4)).toFixed(2) }
      );
    }
  });

  // ── Phase 3 : dépôt des pièces obligatoires ─────────────────────
  //
  // Six pièces par étudiant, plus le procès-verbal de la promotion.
  // C'est la phase que personne n'avait chiffrée, et probablement la
  // plus coûteuse : chaque dépôt écrit un fichier et calcule une
  // empreinte SHA-256.
  const contenuPdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    'latin1'
  );
  const fichier = (nom) => ({
    buffer: contenuPdf,
    size: contenuPdf.length,
    originalname: nom,
    mimetype: 'application/pdf',
  });

  const nbPieces = EFFECTIF * pieceService.TYPES_REQUIS_CANDIDAT.length;
  await phase('dépôt des pièces justificatives', nbPieces, async () => {
    for (const type of pieceService.TYPES_REQUIS_PROMOTION) {
      await pieceService.deposerPourPromotion(
        promotion.id,
        agentEtab,
        { type_piece: type },
        fichier(`${type}.pdf`)
      );
    }
    for (const candidat_id of candidats) {
      for (const type of pieceService.TYPES_REQUIS_CANDIDAT) {
        await pieceService.deposerPourCandidat(
          candidat_id,
          agentEtab,
          { type_piece: type },
          fichier(`${type}.pdf`)
        );
      }
    }
  });

  // ── Phase 4 : verdict avant transmission ────────────────────────
  //
  // L'écran appelle ce contrôle AVANT le clic. S'il prend une minute
  // sur 12 000 étudiants, l'agent croit l'application figée.
  const verdict = await phase('contrôle préalable à la transmission', 1, () =>
    lotService.preparerTransmission(promotion.id, ETABLISSEMENT_ID)
  );

  // ── Phase 5 : transmission ──────────────────────────────────────
  const { lot } = await phase('transmission du lot', EFFECTIF, async () => {
    const res = await lotService.transmettre(promotion.id, ETABLISSEMENT_ID, agentEtab, {
      date_deliberation: `${annees[0].libelle.slice(0, 4)}-07-15`,
    });
    return res.lot ? res : { lot: res };
  });

  // ── Phase 6 : contrôles automatiques à la réception ─────────────
  await phase('contrôles automatiques (ministère)', EFFECTIF, () =>
    lotService.examiner(lot.id, AGENT_MIN_ID)
  );

  // ── Phase 7 : examen des pièces par le ministère ────────────────
  //
  // La phase que le cahier des charges n'avait pas vue. Valider un lot
  // exige que CHAQUE pièce ait été ouverte et jugée (règle D-11) : à six
  // pièces par étudiant, une promotion de 12 000 en compte 72 000. Le
  // temps machine mesuré ici est le plancher — il ne dit rien du temps
  // humain, qui est le vrai sujet et que ce banc ne peut pas simuler.
  const agentMin = { utilisateur_id: AGENT_MIN_ID, role: 'ministere', ministere_id: MINISTERE_ID };
  await phase('examen des pièces (ministère)', nbPieces, async () => {
    const { rows } = await query(
      `SELECT pj.id FROM pieces_jointes pj
       LEFT JOIN dossiers d ON d.candidat_id = pj.candidat_id AND d.lot_id = $1
       WHERE d.id IS NOT NULL OR pj.promotion_id = $2`,
      [lot.id, promotion.id]
    );
    for (const { id } of rows) {
      await pieceService.decider(id, agentMin, { statut: 'validee' });
    }
    return rows.length;
  });

  // ── Phase 8 : validation du lot ─────────────────────────────────
  await phase('validation du lot', EFFECTIF, () =>
    lotService.valider(lot.id, AGENT_MIN_ID)
  );

  // ── Phase 9 : certification de masse ────────────────────────────
  //
  // Crée les diplômes et les met en file. C'est le geste que le
  // ministère fait devant son écran : il ne doit pas attendre la
  // blockchain.
  const certification = await phase('certification de masse', EFFECTIF, () =>
    ancrageService.certifierLot(lot.id, MINISTERE_ID)
  );

  // ── Phase 10 : débit du worker d'ancrage ────────────────────────
  const ancrage = await phase('vidage de la file d\'ancrage', EFFECTIF, () =>
    ancrageService.viderFile({ maxTranches: Math.ceil(EFFECTIF / 5) })
  );

  // ── Restitution ─────────────────────────────────────────────────
  const { rows: comptes } = await query(
    `SELECT (SELECT count(*) FROM dossiers WHERE lot_id = $1) AS dossiers,
            (SELECT count(*) FROM diplomes WHERE statut = 'actif') AS actifs,
            (SELECT count(*) FROM diplomes WHERE statut = 'en_attente_ancrage') AS en_attente,
            (SELECT count(*) FROM pieces_jointes) AS pieces`,
    [lot.id]
  );

  console.log('\n─────────────────────────────────────────────────────────');
  console.log(` Résultats — ${EFFECTIF} étudiants`);
  console.log('─────────────────────────────────────────────────────────');
  console.log(
    ' Phase'.padEnd(42) + 'Durée'.padStart(10) + 'Débit'.padStart(16)
  );
  let total = 0;
  for (const m of mesures) {
    total += m.ms;
    const debit = m.unites > 1 ? `${(m.unites / (m.ms / 1000)).toFixed(0)}/s` : '—';
    console.log(
      ` ${m.nom}`.padEnd(42) +
        `${(m.ms / 1000).toFixed(1)} s`.padStart(10) +
        debit.padStart(16)
    );
  }
  console.log('─────────────────────────────────────────────────────────');
  console.log(' total'.padEnd(42) + `${(total / 1000).toFixed(1)} s`.padStart(10));
  console.log('─────────────────────────────────────────────────────────');

  console.log('\n Vérifications :');
  console.log(`   dossiers engendrés      ${comptes[0].dossiers} (attendu ${EFFECTIF})`);
  console.log(`   pièces déposées         ${comptes[0].pieces}`);
  console.log(`   diplômes actifs         ${comptes[0].actifs}`);
  console.log(`   restant en file         ${comptes[0].en_attente}`);
  console.log(`   transmission autorisée  ${verdict.transmissible ?? verdict.autorisee ?? '—'}`);
  const echecs = certification.echecs;
  console.log(
    `   diplômes créés          ${certification.diplomes_crees}` +
      ` (échecs : ${Array.isArray(echecs) ? echecs.length : echecs ?? 0})`
  );
  console.log(`   ancrages confirmés      ${ancrage.confirmees} (échoués : ${ancrage.echouees})`);

  // Projection : le CDC parle de 12 000. Si le banc a tourné plus bas,
  // on extrapole en le disant, plutôt que de laisser le lecteur le faire
  // de tête — et sans prétendre que c'est une mesure.
  if (EFFECTIF < 12000) {
    const facteur = 12000 / EFFECTIF;
    console.log(
      `\n Projection linéaire à 12 000 : ~${((total * facteur) / 60000).toFixed(0)} min` +
        ' (extrapolation, non mesurée — les index et le cache ne varient pas linéairement).'
    );
  }

  console.log(
    `\n Mode blockchain : mock. Le coût et la latence réels d'une transaction` +
      ' sont mesurés séparément (CLAUDE.md §11) : ~0,0075 POL et ~4 s par ancrage.\n'
  );

  await pool.end();

  if (!GARDER) {
    const admin = new pg.Client({ ...cfg, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
    await admin.end();
  } else {
    console.log(` Base ${BASE} conservée (--garder).\n`);
  }
}

main().catch((err) => {
  console.error('\nÉchec du banc de charge :', err);
  process.exit(1);
});
