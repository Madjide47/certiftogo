// ─────────────────────────────────────────────────────────────
// Seed de démonstration — ajoute un volume réaliste de données par-dessus
// le seed de base (seed_dev.sql), en passant par les VRAIS services :
// les diplômes certifiés ont donc un hash, une signature, un PDF et un QR réels.
//
// Usage (base sur le port 5433 dans notre env de démo) :
//   PGPORT=5433 node scripts/seed-demo.mjs
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import { query, pool } from '../src/config/database.js';
import * as etablissementModel from '../src/models/etablissement.model.js';
import * as candidatModel from '../src/models/candidat.model.js';
import * as dossierModel from '../src/models/dossier.model.js';
import * as diplomeService from '../src/services/diplome.service.js';
import * as verificationService from '../src/services/verification.service.js';
import { genererReferenceDossier } from '../src/utils/reference-generator.js';

const MINISTERE_ID = '10000000-0000-0000-0000-000000000001';

const NOMS = ['AGBEKO','MENSAH','DOSSEH','AGBODJAN','LAWSON','KOMLAN','TETE','GNASSINGBE','AMEGAN','KODJO','ATSU','EKUE','FOLI','SEDDOH','AKAKPO','BODJONA','HOUNKANRIN','ADEBAYO','KPODAR','TCHALLA'];
const PRENOMS_M = ['Koffi','Yao','Komi','Kodjo','Sena','Edem','Mawuli','Elom','Selom','Kwami','Mensah','Akakpo'];
const PRENOMS_F = ['Ama','Afi','Esi','Akua','Sitsofe','Delali','Enyonam','Fifonsi','Ayele','Adjo','Abra','Dziko'];
const FILIERES = ['Génie Logiciel','Réseaux et Télécoms','Cybersécurité','Sciences de Gestion','Droit des Affaires','Sciences Économiques','Génie Civil','Administration Publique','Marketing Digital','Finance-Comptabilité'];
const TYPES = ['licence','master','doctorat','bts','certificat'];
const MENTIONS = ['passable','assez_bien','bien','tres_bien','excellent'];
const ANNEES = ['2022-2023','2023-2024','2024-2025'];
const VILLES_LIEU = ['Lomé','Kara','Sokodé','Kpalimé','Atakpamé','Dapaong','Tsévié','Aného'];

const rand = (a) => a[Math.floor(Math.random() * a.length)];
const randInt = (n) => Math.floor(Math.random() * n);

let refCounter = 1;
async function refUnique() {
  for (let i = 0; i < 8; i += 1) {
    const r = genererReferenceDossier();
    if (!(await dossierModel.referenceExiste(r))) return r;
  }
  return `CT-2025-${String(90000 + refCounter++).slice(-5)}`;
}

async function creerCandidat(etab, prefix, i) {
  const sexe = Math.random() > 0.5 ? 'M' : 'F';
  const prenom = sexe === 'M' ? rand(PRENOMS_M) : rand(PRENOMS_F);
  return candidatModel.creer({
    numero_etudiant: `${prefix}-${2020 + randInt(5)}-${String(i).padStart(3, '0')}`,
    nom: rand(NOMS),
    prenom,
    date_naissance: `${1998 + randInt(6)}-${String(1 + randInt(12)).padStart(2, '0')}-${String(1 + randInt(27)).padStart(2, '0')}`,
    lieu_naissance: rand(VILLES_LIEU),
    sexe,
    telephone: `+2289${randInt(10)}${String(randInt(1000000)).padStart(6, '0')}`,
    email: `${prenom.toLowerCase()}.${randInt(999)}@example.tg`,
    etablissement_id: etab.id,
  });
}

// Amène un dossier neuf jusqu'au statut cible et renvoie l'éventuel diplôme.
async function creerDossierAuStatut(etab, candidat, statutCible) {
  const reference = await refUnique();
  const dossier = await dossierModel.creer({
    reference,
    etablissement_id: etab.id,
    candidat_id: candidat.id,
    filiere: rand(FILIERES),
    parcours: null,
    mention: rand(MENTIONS),
    date_obtention: `${2022 + randInt(3)}-07-01`,
    type_diplome: rand(TYPES),
    annee_academique: rand(ANNEES),
    notes: null,
  });

  if (statutCible === 'brouillon') return { dossier };

  await dossierModel.transmettre(dossier.id, null); // → soumis
  if (statutCible === 'soumis') return { dossier };

  if (statutCible === 'en_examen') {
    await dossierModel.changerStatut(dossier.id, { statut: 'en_examen' });
    return { dossier };
  }
  if (statutCible === 'rejete') {
    await dossierModel.changerStatut(dossier.id, {
      statut: 'rejete',
      motif_rejet: rand(['Relevé de notes incohérent', 'Pièce manquante au dossier', 'Erreur sur l\'état civil']),
      marquerTraitement: true,
    });
    return { dossier };
  }
  // valide / certifie / revoque
  await dossierModel.changerStatut(dossier.id, { statut: 'valide', marquerTraitement: true });
  if (statutCible === 'valide') return { dossier };

  const diplome = await diplomeService.certifier(dossier.id, MINISTERE_ID);
  if (statutCible === 'revoque') {
    await diplomeService.revoquer(diplome.id, 'Annulation administrative — nouveau diplôme émis');
  }
  return { dossier, diplome };
}

async function main() {
  console.log('== Seed de démonstration ==');

  // Établissement pilote existant + candidats existants.
  const { rows: etabRows } = await query(`SELECT id, nom FROM etablissements ORDER BY date_creation ASC LIMIT 1`);
  const iai = etabRows[0];
  const { rows: candExist } = await query(`SELECT id FROM candidats WHERE etablissement_id = $1`, [iai.id]);

  // Nouveaux établissements.
  const nouveaux = [
    { nom: 'Université de Lomé', type: 'universite', ville: 'Lomé', email: 'contact@univ-lome.tg', prefix: 'UL' },
    { nom: 'Université de Kara', type: 'universite', ville: 'Kara', email: 'contact@univ-kara.tg', prefix: 'UK' },
    { nom: "École Nationale d'Administration", type: 'ecole', ville: 'Lomé', email: 'contact@ena.tg', prefix: 'ENA' },
    { nom: 'Lycée Scientifique de Lomé', type: 'lycee', ville: 'Lomé', email: 'contact@lysci-lome.tg', prefix: 'LSL' },
    { nom: 'Institut Supérieur de Gestion', type: 'institut', ville: 'Sokodé', email: 'contact@isg-sokode.tg', prefix: 'ISG' },
  ];
  const etabs = [{ id: iai.id, nom: iai.nom, prefix: 'IAI' }];
  for (const e of nouveaux) {
    const cree = await etablissementModel.creer(e);
    etabs.push({ id: cree.id, nom: cree.nom, prefix: e.prefix });
    console.log(`  + établissement ${cree.nom}`);
  }
  // Un établissement suspendu pour la démo admin.
  await etablissementModel.definirStatut(etabs[etabs.length - 1].id, 'suspendu');

  // Distribution de statuts pour un rendu réaliste.
  const STATUTS = ['brouillon', 'soumis', 'soumis', 'en_examen', 'en_examen', 'valide', 'rejete', 'certifie', 'certifie', 'revoque'];

  let nbCand = candExist.length;
  let nbDoss = 0;
  let nbDip = 0;

  for (const etab of etabs) {
    // Candidats : réutilise les existants pour IAI + en crée de nouveaux partout.
    const candidats = [];
    if (etab.prefix === 'IAI') {
      for (const c of candExist) candidats.push({ id: c.id });
    }
    const aCreer = etab.prefix === 'IAI' ? 6 : 5 + randInt(4);
    for (let i = 1; i <= aCreer; i += 1) {
      candidats.push(await creerCandidat(etab, etab.prefix, nbCand + i));
    }
    nbCand += aCreer;

    // Dossiers : un par candidat (statut aléatoire pondéré).
    for (const cand of candidats) {
      const statut = rand(STATUTS);
      try {
        const { diplome } = await creerDossierAuStatut(etab, cand, statut);
        nbDoss += 1;
        if (diplome) nbDip += 1;
      } catch (e) {
        console.warn(`    ! dossier ${etab.prefix}/${cand.id}: ${e.message}`);
      }
    }
    console.log(`  ~ ${etab.nom}: candidats + dossiers OK`);
  }

  // Garantit des diplômes pour les 3 comptes candidats de test (Koffi/Ama/Yao).
  for (const c of candExist) {
    try {
      await creerDossierAuStatut({ id: iai.id }, { id: c.id }, 'certifie');
      nbDoss += 1; nbDip += 1;
    } catch (e) {
      console.warn(`    ! diplôme test ${c.id}: ${e.message}`);
    }
  }
  // Un diplôme révoqué pour Yao (3e candidat) → montre la carte rouge.
  try {
    await creerDossierAuStatut({ id: iai.id }, { id: candExist[2].id }, 'revoque');
    nbDoss += 1; nbDip += 1;
  } catch (e) {
    console.warn('    ! diplôme révoqué test:', e.message);
  }

  // Journalise quelques vérifications publiques (pour les stats admin).
  const { rows: hashes } = await query(`SELECT hash_sha256, reference FROM diplomes LIMIT 10`);
  for (const h of hashes) {
    await verificationService.verifier(h.hash_sha256, { methode: 'qr', ip: '196.170.0.' + randInt(255) });
  }
  await verificationService.verifier('DIP-0000-00000', { methode: 'hash' }); // un échec

  console.log(`\n✅ Démo : ${etabs.length} établissements · ${nbCand} candidats · ${nbDoss} dossiers · ${nbDip} diplômes`);
  await pool.end();
}

main().catch(async (e) => {
  console.error('ERREUR SEED DÉMO:', e);
  await pool.end();
  process.exit(1);
});
