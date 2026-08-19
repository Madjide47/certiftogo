// ─────────────────────────────────────────────────────────────
// Régénération des diplômes déjà imprimés.
//
// POURQUOI CE SCRIPT
// Le PDF est écrit UNE FOIS, à la certification, puis conservé tel quel
// dans `uploads/`. Une correction de mise en page ne profite donc qu'aux
// diplômes émis après elle : le stock existant garde l'ancien tirage,
// avec ses défauts. Sans ce script, il faudrait révoquer et réémettre —
// c'est-à-dire falsifier l'histoire pour corriger une marge.
//
// POURQUOI C'EST SANS DANGER
// Le PDF est un RENDU, pas l'acte. Ce qui fait foi, c'est l'empreinte
// SHA-256 et la signature du ministère, calculées sur les DONNÉES
// (`donnees_signees`), jamais sur le fichier. Réimprimer ne touche donc
// ni le hash, ni la signature, ni l'ancrage blockchain : la vérification
// publique continue de répondre exactement la même chose.
//
// Trois garde-fous :
//   • les données viennent du SNAPSHOT signé, pas des tables vivantes —
//     si un nom a changé depuis, le diplôme réimprimé reste celui qui a
//     été signé, sinon le document contredirait son empreinte ;
//   • la date de l'acte est `date_certification`, pas celle du jour ;
//   • le fichier reprend le même nom, donc `pdf_url` reste valide et la
//     base n'est pas touchée.
//
// Usage :
//   npm run pdf:regenerer                  tous les diplômes
//   npm run pdf:regenerer -- DIP-2026-001  un seul
//   npm run pdf:regenerer -- --statut actif
// ─────────────────────────────────────────────────────────────
import { query, pool } from '../src/config/database.js';
import { genererQrDataUrl, genererQrFichier } from '../src/services/qr.service.js';
import { genererPdfDiplome } from '../src/services/pdf.service.js';

const args = process.argv.slice(2);
const indexStatut = args.indexOf('--statut');
const statut = indexStatut >= 0 ? args[indexStatut + 1] : null;
const references = args.filter((a) => a.startsWith('DIP-'));
const avecQr = !args.includes('--sans-qr');

async function diplomesAReimprimer() {
  const filtres = [];
  const params = [];
  if (statut) {
    params.push(statut);
    filtres.push(`d.statut = $${params.length}`);
  }
  if (references.length > 0) {
    params.push(references);
    filtres.push(`d.reference = ANY($${params.length})`);
  }
  const where = filtres.length ? `WHERE ${filtres.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT d.reference, d.donnees_signees, d.hash_sha256, d.signature_numerique,
            d.statut, d.motif_revocation, d.version, d.date_certification,
            c.nom AS candidat_nom, c.prenom AS candidat_prenom,
            c.numero_etudiant, c.date_naissance, c.lieu_naissance,
            e.nom AS etablissement_nom
       FROM diplomes d
       JOIN candidats c ON c.id = d.candidat_id
       JOIN etablissements e ON e.id = d.etablissement_id
       ${where}
      ORDER BY d.date_certification`,
    params
  );
  return rows;
}

async function reimprimer(d) {
  // Le snapshot fait foi sur les données ; l'état civil, qui n'y figure
  // pas, est relu des tables — il ne participe pas à l'empreinte.
  const snap = d.donnees_signees || {};
  const qrDataUrl = await genererQrDataUrl(d.hash_sha256).catch(() => '');

  // Le QR fichier a pu disparaître d'`uploads/` (nettoyage, migration
  // de serveur) : le régénérer au passage évite un lien mort.
  if (avecQr) {
    await genererQrFichier(d.hash_sha256, d.reference).catch(() => null);
  }

  await genererPdfDiplome({
    reference: d.reference,
    candidat_nom: snap.candidat?.nom || d.candidat_nom,
    candidat_prenom: snap.candidat?.prenom || d.candidat_prenom,
    candidat_numero_etudiant: snap.candidat?.numero_etudiant || d.numero_etudiant,
    date_naissance: d.date_naissance,
    lieu_naissance: d.lieu_naissance,
    type_diplome: snap.type_diplome,
    mention: snap.mention,
    filiere: snap.filiere,
    parcours: snap.parcours,
    annee_academique: snap.annee_academique,
    date_obtention: snap.date_obtention,
    date_certification: d.date_certification,
    etablissement_nom: snap.etablissement || d.etablissement_nom,
    version: d.version,
    statut: d.statut,
    motif_revocation: d.motif_revocation,
    hash: d.hash_sha256,
    signature: d.signature_numerique,
    qrDataUrl,
  });
}

async function principal() {
  const diplomes = await diplomesAReimprimer();
  if (diplomes.length === 0) {
    console.log('Aucun diplôme à réimprimer.');
    return;
  }

  console.log(`Réimpression de ${diplomes.length} diplôme(s)…`);
  let reussis = 0;
  const echecs = [];

  for (const d of diplomes) {
    try {
      await reimprimer(d);
      reussis += 1;
      if (reussis % 25 === 0) console.log(`  ${reussis}/${diplomes.length}`);
    } catch (err) {
      // Un diplôme illisible ne doit pas arrêter la réimpression des
      // autres : on note et on continue.
      echecs.push(`${d.reference} : ${err.message}`);
    }
  }

  console.log(`\n✅ ${reussis} diplôme(s) réimprimé(s).`);
  if (echecs.length > 0) {
    console.log(`⚠️  ${echecs.length} échec(s) :`);
    for (const e of echecs) console.log(`   ${e}`);
  }
  console.log(
    '\nNi le hash ni la signature ne changent : la vérification publique répond comme avant.'
  );
}

principal()
  .catch((err) => {
    console.error('Échec de la réimpression :', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
