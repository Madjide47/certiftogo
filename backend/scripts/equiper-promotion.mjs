// ─────────────────────────────────────────────────────────────
// Dépose les pièces obligatoires manquantes d'une promotion.
//
// POURQUOI CE SCRIPT EXISTE
// `seed:demo` équipe les promotions qu'il crée, mais il ne tourne qu'une
// fois : rejoué sur une base déjà peuplée, il bute sur le code d'un
// établissement déjà pris. Les promotions plus anciennes que la règle des
// pièces obligatoires (migrations 014 et 017) restent donc à quai — leurs
// étudiants n'ont aucune pièce, et la transmission répond
// `PIECES_MANQUANTES`.
//
// Conséquence pour une démonstration : l'écran d'établissement refuse de
// transmettre, et le parcours s'arrête avant même d'atteindre le
// ministère. Ce script rattrape l'écart sans reconstruire la base — donc
// sans effacer les diplômes vitrine réellement ancrés (voir CLAUDE.md §11).
//
// Il passe par le SERVICE, jamais par un INSERT : c'est lui qui écrit le
// fichier, calcule l'empreinte SHA-256 et refuse ce qui n'est pas un PDF.
// Un script qui court-circuiterait ces règles produirait une base que
// l'application elle-même jugerait incohérente.
//
// USAGE
//   node scripts/equiper-promotion.mjs --lister        # promotions et ce qui leur manque
//   node scripts/equiper-promotion.mjs <promotion_id>  # dépose les manquantes
//   node scripts/equiper-promotion.mjs --toutes        # toutes les promotions ouvertes
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';

process.env.PGPORT = process.env.PGPORT || '5433';

const { query, pool } = await import('../src/config/database.js');
const pieceService = await import('../src/services/piece-jointe.service.js');

const args = process.argv.slice(2);
const LISTER = args.includes('--lister');
const TOUTES = args.includes('--toutes');
const idsDemandes = args.filter((a) => !a.startsWith('--'));

/** PDF minimal mais valide : le service refuse tout ce qui n'en est pas un. */
function faussePiece(nom) {
  const contenu = Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n% ${nom}\n`,
    'latin1'
  );
  return { buffer: contenu, size: contenu.length, originalname: nom, mimetype: 'application/pdf' };
}

/** L'agent au nom duquel on dépose : le premier compte actif de l'établissement. */
async function agentDe(etablissement_id) {
  const { rows } = await query(
    `SELECT id FROM utilisateurs
      WHERE etablissement_id = $1 AND role = 'etablissement' AND actif = true
      ORDER BY date_creation LIMIT 1`,
    [etablissement_id]
  );
  if (!rows[0]) throw new Error(`aucun agent actif pour l'établissement ${etablissement_id}`);
  return rows[0].id;
}

async function promotionsCibles() {
  if (idsDemandes.length) {
    const { rows } = await query(
      `SELECT p.id, p.libelle, p.statut, f.etablissement_id
         FROM promotions p
         JOIN filieres fi ON fi.id = p.filiere_id
         JOIN facultes f ON f.id = fi.faculte_id
        WHERE p.id = ANY($1::uuid[])`,
      [idsDemandes]
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT p.id, p.libelle, p.statut, f.etablissement_id
       FROM promotions p
       JOIN filieres fi ON fi.id = p.filiere_id
       JOIN facultes f ON f.id = fi.faculte_id
      WHERE p.statut = 'ouverte' ORDER BY p.libelle`
  );
  return rows;
}

/** Les admis d'une promotion : eux seuls partent au ministère. */
async function admisDe(promotion_id) {
  const { rows } = await query(
    `SELECT c.id, c.nom, c.prenom, c.numero_etudiant
       FROM inscriptions i
       JOIN candidats c ON c.id = i.candidat_id
      WHERE i.promotion_id = $1 AND i.statut = 'admis'
      ORDER BY c.nom`,
    [promotion_id]
  );
  return rows;
}

async function typesDeja(colonne, id) {
  const { rows } = await query(
    `SELECT type_piece FROM pieces_jointes
      WHERE ${colonne} = $1 AND statut <> 'rejetee'`,
    [id]
  );
  return new Set(rows.map((r) => r.type_piece));
}

let deposees = 0;
let echecs = 0;

async function deposer(utilisateur, cible, type, nom) {
  const fichier = faussePiece(nom);
  try {
    if (cible.candidat_id) {
      await pieceService.deposerPourCandidat(cible.candidat_id, utilisateur, { type_piece: type }, fichier);
    } else {
      await pieceService.deposerPourPromotion(cible.promotion_id, utilisateur, { type_piece: type }, fichier);
    }
    deposees += 1;
  } catch (e) {
    echecs += 1;
    console.warn(`      ! ${type} : ${e.message}`);
  }
}

const cibles = await promotionsCibles();
if (!cibles.length) {
  console.log('Aucune promotion correspondante.');
  await pool.end();
  process.exit(0);
}

console.log(`${cibles.length} promotion(s) examinée(s).\n`);

for (const promo of cibles) {
  const admis = await admisDe(promo.id);
  const dejaPromo = await typesDeja('promotion_id', promo.id);
  const manquePv = !dejaPromo.has('proces_verbal');

  let manquantsTotal = manquePv ? 1 : 0;
  const parEtudiant = [];
  for (const e of admis) {
    const deja = await typesDeja('candidat_id', e.id);
    const manquants = pieceService.TYPES_REQUIS_CANDIDAT.filter((t) => !deja.has(t));
    manquantsTotal += manquants.length;
    if (manquants.length) parEtudiant.push({ etudiant: e, manquants });
  }

  console.log(`${promo.libelle}  [${promo.statut}]`);
  console.log(`  ${admis.length} admis · ${manquantsTotal} pièce(s) manquante(s)${manquePv ? ' dont le procès-verbal' : ''}`);

  if (LISTER || (!TOUTES && !idsDemandes.length)) {
    for (const { etudiant, manquants } of parEtudiant.slice(0, 3)) {
      console.log(`    ${etudiant.nom} ${etudiant.prenom} : ${manquants.length} manquante(s)`);
    }
    if (parEtudiant.length > 3) console.log(`    … et ${parEtudiant.length - 3} autre(s)`);
    console.log(`  id : ${promo.id}\n`);
    continue;
  }

  if (!manquantsTotal) {
    console.log('  → déjà complète.\n');
    continue;
  }

  const agent_id = await agentDe(promo.etablissement_id);
  const utilisateur = {
    utilisateur_id: agent_id,
    role: 'etablissement',
    etablissement_id: promo.etablissement_id,
  };

  for (const { etudiant, manquants } of parEtudiant) {
    const ref = etudiant.numero_etudiant || etudiant.id.slice(0, 8);
    for (const type of manquants) {
      await deposer(utilisateur, { candidat_id: etudiant.id }, type, `${type}-${ref}.pdf`);
    }
  }
  if (manquePv) {
    await deposer(
      utilisateur,
      { promotion_id: promo.id },
      'proces_verbal',
      `pv-deliberation-${promo.id.slice(0, 8)}.pdf`
    );
  }
  console.log(`  → ${deposees} déposée(s)${echecs ? `, ${echecs} refusée(s)` : ''}.\n`);
  deposees = 0;
  echecs = 0;
}

await pool.end();
