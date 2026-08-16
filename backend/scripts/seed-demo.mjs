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
import * as personneModel from '../src/models/personne.model.js';
import * as dossierModel from '../src/models/dossier.model.js';
import * as diplomeService from '../src/services/diplome.service.js';
import * as verificationService from '../src/services/verification.service.js';
import * as promotionService from '../src/services/promotion.service.js';
import * as lotService from '../src/services/lot.service.js';
import * as pieceService from '../src/services/piece-jointe.service.js';
import * as references from '../src/services/reference.service.js';

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

// Même compteur que l'application : un seed qui numéroterait à sa façon
// laisserait des références que le service pourrait réattribuer ensuite.
function refUnique() {
  return references.reserverUne('CT');
}

// Depuis la migration 004, un étudiant n'existe pas sans son identité
// nationale : `candidats` est une FICHE, `personnes` est la personne. On
// réutilise l'identité si le numéro est déjà connu — c'est ce qui permet
// à un diplômé de deux établissements de n'avoir qu'un portefeuille.
async function creerCandidat(etab, prefix, i) {
  const sexe = Math.random() > 0.5 ? 'M' : 'F';
  const prenom = sexe === 'M' ? rand(PRENOMS_M) : rand(PRENOMS_F);
  const identite = {
    nom: rand(NOMS),
    prenom,
    date_naissance: `${1998 + randInt(6)}-${String(1 + randInt(12)).padStart(2, '0')}-${String(1 + randInt(27)).padStart(2, '0')}`,
    lieu_naissance: rand(VILLES_LIEU),
    sexe,
    telephone: `+2289${randInt(10)}${String(randInt(1000000)).padStart(6, '0')}`,
    email: `${prenom.toLowerCase()}.${randInt(999)}@example.tg`,
  };

  const personne =
    (await personneModel.trouverParTelephone(identite.telephone)) ||
    (await personneModel.creer(identite));

  return candidatModel.creer({
    ...identite,
    numero_etudiant: `${prefix}-${2020 + randInt(5)}-${String(i).padStart(3, '0')}`,
    personne_id: personne.id,
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

/**
 * Construit la chaîne académique V2 d'un établissement :
 * faculté → filières → promotions → inscriptions → résultats, et transmet
 * l'une des promotions pour produire un vrai lot.
 *
 * Sans cela la base de démo montrait des dossiers sortis de nulle part :
 * 44 étudiants, zéro promotion. L'écran « Promotions » était vide et le
 * bouton de création grisé faute d'année académique — la démonstration
 * s'arrêtait au premier clic.
 */
/**
 * Dépose une pièce de démonstration.
 *
 * On passe par le service, pas par un INSERT : c'est lui qui écrit le
 * fichier, calcule l'empreinte et refuse ce qui n'est pas un vrai PDF.
 * Un seed qui court-circuiterait ces règles produirait une base que
 * l'application elle-même jugerait incohérente.
 */
async function deposerPiece({ candidat_id, promotion_id, etablissement_id, agent_id }, type, nom) {
  const contenu = Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n% ${nom}\n`,
    'latin1'
  );
  const fichier = {
    buffer: contenu,
    size: contenu.length,
    originalname: nom,
    mimetype: 'application/pdf',
  };
  const utilisateur = { utilisateur_id: agent_id, role: 'etablissement', etablissement_id };

  try {
    if (candidat_id) {
      await pieceService.deposerPourCandidat(candidat_id, utilisateur, { type_piece: type }, fichier);
    } else {
      await pieceService.deposerPourPromotion(promotion_id, utilisateur, { type_piece: type }, fichier);
    }
  } catch (e) {
    console.warn(`    ! pièce ${type} : ${e.message}`);
  }
}

async function creerChaineAcademique(etab, annee, session, candidats) {
  const { rows: fac } = await query(
    `INSERT INTO facultes (etablissement_id, nom, code, statut)
     VALUES ($1, $2, $3, 'active') RETURNING id`,
    [etab.id, `Faculté ${etab.prefix}`, `F-${etab.prefix}`]
  );
  const faculte_id = fac[0].id;

  const filieres = [];
  for (const [nom, code, type, duree] of [
    ['Génie Logiciel', 'GL', 'licence', 3],
    ['Sciences de Gestion', 'SG', 'master', 2],
  ]) {
    const { rows } = await query(
      `INSERT INTO filieres (faculte_id, nom, code, type_diplome, duree_annees, statut)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id, nom, type_diplome`,
      [faculte_id, nom, `${code}-${etab.prefix}`, type, duree]
    );
    filieres.push(rows[0]);
  }

  const agent = { utilisateur_id: etab.agent_id };
  const promotions = [];

  for (const [index, filiere] of filieres.entries()) {
    const promotion = await promotionService.creer(etab.id, {
      filiere_id: filiere.id,
      annee_id: annee.id,
      session_id: session.id,
      libelle: `${filiere.nom} — ${annee.libelle}`,
      niveau: index === 0 ? 3 : 2,
      effectif_prevu: 30,
    });
    await promotionService.changerStatut(promotion.id, etab.id, 'ouverte');

    // Une moitié des étudiants par promotion, avec des résultats variés :
    // il faut des ajournés pour montrer qu'ils ne partent PAS au ministère.
    const lot = candidats.slice(index * 4, index * 4 + 4);
    for (const candidat of lot) {
      try {
        const inscription = await promotionService.inscrire(promotion.id, etab.id, {
          candidat_id: candidat.id,
        });
        // Le dossier complet conditionne la transmission : il manque une
        // seule pièce obligatoire et la promotion entière reste à quai —
        // la file du ministère serait alors vide, et la démonstration
        // s'arrêterait à l'écran d'établissement.
        const reference = candidat.numero_etudiant || candidat.id.slice(0, 8);
        for (const type of pieceService.TYPES_REQUIS_CANDIDAT) {
          await deposerPiece(
            { candidat_id: candidat.id, etablissement_id: etab.id, agent_id: etab.agent_id },
            type,
            `${type}-${reference}.pdf`
          );
        }
        const admis = Math.random() > 0.25;
        // La mention n'est plus tirée au hasard : elle découle de la
        // moyenne. Un jeu de démonstration qui montrerait un 10,2
        // « excellent » ferait douter de tout le reste — et le serveur
        // le refuserait d'ailleurs.
        await promotionService.enregistrerResultat(promotion.id, inscription.id, etab.id, {
          statut: admis ? 'admis' : 'ajourne',
          moyenne: (admis ? 10 + Math.random() * 8 : 6 + Math.random() * 3).toFixed(2),
        });
      } catch (e) {
        console.warn(`    ! inscription ${etab.prefix}: ${e.message}`);
      }
    }

    // Le procès-verbal vaut pour la promotion entière.
    await deposerPiece(
      { promotion_id: promotion.id, etablissement_id: etab.id, agent_id: etab.agent_id },
      'proces_verbal',
      `pv-deliberation-${promotion.id.slice(0, 8)}.pdf`
    );

    promotions.push(promotion);
  }

  // La première promotion part au ministère : l'écran « Lots transmis »
  // et la file d'instruction du ministère ne sont donc jamais vides.
  try {
    const res = await lotService.transmettre(promotions[0].id, etab.id, agent, {
      date_deliberation: `${annee.libelle.slice(0, 4)}-07-15`,
    });
    return { promotions, lot: res?.lot || res };
  } catch (e) {
    console.warn(`    ! transmission ${etab.prefix}: ${e.message}`);
    return { promotions, lot: null };
  }
}

async function main() {
  console.log('== Seed de démonstration ==');

  // Établissement pilote existant + candidats existants.
  const { rows: etabRows } = await query(`SELECT id, nom FROM etablissements ORDER BY date_creation ASC LIMIT 1`);
  const iai = etabRows[0];
  const { rows: candExist } = await query(`SELECT id FROM candidats WHERE etablissement_id = $1`, [iai.id]);

  // Nouveaux établissements.
  // `code` est obligatoire depuis la migration 005 : c'est l'identifiant
  // national de l'établissement, celui qui figure sur l'arrêté d'agrément.
  const nouveaux = [
    { code: 'ETB-UL', nom: 'Université de Lomé', type: 'universite', ville: 'Lomé', email: 'contact@univ-lome.tg', prefix: 'UL' },
    { code: 'ETB-UK', nom: 'Université de Kara', type: 'universite', ville: 'Kara', email: 'contact@univ-kara.tg', prefix: 'UK' },
    { code: 'ETB-ENA', nom: "École Nationale d'Administration", type: 'ecole', ville: 'Lomé', email: 'contact@ena.tg', prefix: 'ENA' },
    { code: 'ETB-LSL', nom: 'Lycée Scientifique de Lomé', type: 'lycee', ville: 'Lomé', email: 'contact@lysci-lome.tg', prefix: 'LSL' },
    { code: 'ETB-ISG', nom: 'Institut Supérieur de Gestion', type: 'institut', ville: 'Sokodé', email: 'contact@isg-sokode.tg', prefix: 'ISG' },
  ];
  const { rows: agentIai } = await query(
    `SELECT id FROM utilisateurs WHERE etablissement_id = $1 AND role = 'etablissement' LIMIT 1`,
    [iai.id]
  );
  const etabs = [{ id: iai.id, nom: iai.nom, prefix: 'IAI', agent_id: agentIai[0]?.id }];

  for (const e of nouveaux) {
    const cree = await etablissementModel.creer(e);
    // Chaque établissement a son agent principal : sans compte rattaché, il
    // ne peut ni transmettre ni apparaître dans l'écran « Agents ».
    const { rows: agent } = await query(
      `INSERT INTO utilisateurs
         (nom, prenom, telephone, role, etablissement_id, sous_role, est_agent_principal, actif)
       VALUES ($1, 'Direction', $2, 'etablissement', $3, 'directeur', true, true)
       RETURNING id`,
      [e.prefix, `+2289${String(randInt(100000000)).padStart(8, '0')}`, cree.id]
    );
    // Sans habilitation, un établissement ne peut RIEN faire certifier :
    // le contrôle automatique bloque chaque dossier au motif qu'il n'est
    // pas autorisé à délivrer ce type de diplôme. Un agrément qui n'en
    // accorde aucune produit un établissement inerte.
    for (const type of TYPES) {
      await query(
        `INSERT INTO habilitations (etablissement_id, type_diplome, reference_arrete, date_debut)
         VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '2 years')`,
        [cree.id, type, `N° 2024-${String(100 + randInt(800))}/MESR`]
      );
    }

    etabs.push({ id: cree.id, nom: cree.nom, prefix: e.prefix, agent_id: agent[0].id });
    console.log(`  + établissement ${cree.nom} (${TYPES.length} habilitations)`);
  }
  // Un établissement suspendu pour la démo admin.
  await etablissementModel.definirStatut(etabs[etabs.length - 1].id, 'suspendu');

  // Distribution de statuts pour un rendu réaliste.
  const STATUTS = ['brouillon', 'soumis', 'soumis', 'en_examen', 'en_examen', 'valide', 'rejete', 'certifie', 'certifie', 'revoque'];

  let nbCand = candExist.length;
  let nbDoss = 0;
  let nbDip = 0;
  const candidatsParEtab = new Map();

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
    candidatsParEtab.set(etab.id, candidats);

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

  // ── Chaîne académique V2 ────────────────────────────────────────
  // Facultés, filières, promotions, inscriptions, résultats, puis un lot
  // transmis par établissement.
  const { rows: anneeRows } = await query(
    `SELECT id, libelle FROM annees_academiques WHERE statut = 'ouverte' ORDER BY date_debut DESC LIMIT 1`
  );
  const annee = anneeRows[0];

  let nbPromos = 0;
  let nbLots = 0;

  if (!annee) {
    console.warn(
      "  ! aucune année académique ouverte : chaîne académique ignorée. Jouez d'abord `npm run seed`."
    );
  } else {
    const { rows: sessionRows } = await query(
      `SELECT id FROM sessions_academiques WHERE annee_id = $1 ORDER BY date_debut ASC LIMIT 1`,
      [annee.id]
    );
    const session = sessionRows[0];

    for (const etab of etabs) {
      // Un établissement suspendu ne transmet pas : on ne lui fabrique pas
      // de lot, ce serait contredire la règle qu'on vient d'écrire.
      const { rows: statutEtab } = await query(`SELECT statut FROM etablissements WHERE id = $1`, [
        etab.id,
      ]);
      if (statutEtab[0]?.statut !== 'actif') continue;
      if (!etab.agent_id) continue;

      try {
        const res = await creerChaineAcademique(
          etab,
          annee,
          session,
          candidatsParEtab.get(etab.id) || []
        );
        nbPromos += res.promotions.length;
        if (res.lot) nbLots += 1;
        console.log(`  ~ ${etab.nom}: ${res.promotions.length} promotions${res.lot ? ' + 1 lot transmis' : ''}`);
      } catch (e) {
        console.warn(`    ! chaîne académique ${etab.prefix}: ${e.message}`);
      }
    }
  }

  // Journalise quelques vérifications publiques (pour les stats admin).
  const { rows: hashes } = await query(`SELECT hash_sha256, reference FROM diplomes LIMIT 10`);
  for (const h of hashes) {
    await verificationService.verifier(h.hash_sha256, { methode: 'qr', ip: '196.170.0.' + randInt(255) });
  }
  await verificationService.verifier('DIP-0000-00000', { methode: 'hash' }); // un échec

  console.log(
    `\n✅ Démo : ${etabs.length} établissements · ${nbCand} étudiants · ${nbPromos} promotions · ` +
      `${nbLots} lots transmis · ${nbDoss} dossiers · ${nbDip} diplômes`
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error('ERREUR SEED DÉMO:', e);
  await pool.end();
  process.exit(1);
});
