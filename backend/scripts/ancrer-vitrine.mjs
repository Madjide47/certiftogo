// ─────────────────────────────────────────────────────────────
// Ancrage réel de quelques diplômes vitrine sur Polygon Amoy.
//
// POURQUOI CE SCRIPT EXISTE
// Le seed de démonstration ancre en mode `mock` : les hash ne sont donc
// pas sur le contrat, et la vérification publique répond honnêtement
// `ancrage_blockchain.ancre = false`. C'est acceptable pour développer,
// mais une soutenance sur la traçabilité blockchain a besoin d'au moins
// un diplôme dont la preuve est réellement lisible par un tiers, sur un
// explorateur public, sans nous croire sur parole.
//
// Ancrer TOUTE la base coûterait ~0,15 POL et n'apporterait rien de plus
// qu'un échantillon : ce qui est démontré, c'est le mécanisme.
//
// USAGE
//   node scripts/ancrer-vitrine.mjs DIP-2026-00635
//   node scripts/ancrer-vitrine.mjs DIP-2026-00635 --revoquer="Fraude constatée"
//   node scripts/ancrer-vitrine.mjs --lister      # état on-chain, sans écrire
//
// PRUDENCE
// Chaque appel écrit sur une chaîne PUBLIQUE et dépense des fonds
// (~0,0075 POL par opération). Rien n'est réversible. Le script annonce
// ce qu'il va faire et le solde disponible avant d'agir.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';

process.env.PGPORT = process.env.PGPORT || '5433';
// Forcé : lancer ce script avec le .env en `mock` produirait de fausses
// transactions en base tout en laissant croire à un ancrage réel — soit
// exactement l'écart qu'il est censé corriger.
process.env.BLOCKCHAIN_MODE = 'onchain';

const { query, pool } = await import('../src/config/database.js');
const blockchain = await import('../src/services/blockchain.service.js');
const txModel = await import('../src/models/transaction-blockchain.model.js');

const args = process.argv.slice(2);
const LISTER = args.includes('--lister');
const motifRevocation = (args.find((a) => a.startsWith('--revoquer=')) || '').split('=')[1];
const referencesDemandees = args.filter((a) => !a.startsWith('--'));

const COUT_ESTIME = 0.0075; // POL par opération, mesuré sur Amoy

async function etatOnChain(hash) {
  try {
    return await blockchain.verifierOnChain(hash);
  } catch (err) {
    return { erreur: err.message };
  }
}

async function main() {
  const { rows: diplomes } = await query(
    `SELECT d.id, d.reference, d.hash_sha256, d.statut,
            c.nom, c.prenom
       FROM diplomes d
       JOIN candidats c ON c.id = d.candidat_id
      ORDER BY d.reference`
  );

  if (LISTER || referencesDemandees.length === 0) {
    console.log('\nÉtat on-chain des diplômes en base :\n');
    for (const d of diplomes) {
      const etat = await etatOnChain(d.hash_sha256);
      const marque = etat?.existe ? (etat.revoque ? 'RÉVOQUÉ on-chain' : 'ancré') : '—';
      console.log(
        `  ${d.reference}  ${String(d.statut).padEnd(18)} ${marque}`
      );
    }
    console.log(
      `\nAucune écriture effectuée. Passez une ou plusieurs références pour ancrer.\n`
    );
    return;
  }

  const cibles = diplomes.filter((d) => referencesDemandees.includes(d.reference));
  const inconnues = referencesDemandees.filter(
    (r) => !cibles.some((d) => d.reference === r)
  );
  if (inconnues.length > 0) {
    console.error(`Références inconnues en base : ${inconnues.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const operations = cibles.length + (motifRevocation ? 1 : 0);
  console.log(`\nOpérations prévues : ${operations} (~${(operations * COUT_ESTIME).toFixed(4)} POL)`);
  console.log(`Contrat : ${process.env.CONTRAT_ADRESSE}`);
  console.log(`Réseau  : ${process.env.BLOCKCHAIN_RPC_URL}\n`);

  for (const d of cibles) {
    const avant = await etatOnChain(d.hash_sha256);
    if (avant?.existe) {
      console.log(`  ${d.reference} — déjà ancré, ignoré.`);
      continue;
    }

    process.stdout.write(`  ${d.reference} (${d.prenom} ${d.nom}) → certification… `);
    const tx = await blockchain.certifier({ reference: d.reference, hash: d.hash_sha256 });
    await txModel.creer({
      diplome_id: d.id,
      transaction_hash: tx.transactionHash,
      block_number: tx.blockNumber,
      adresse_contrat: tx.adresseContrat,
      gas_used: tx.gasUsed,
      gas_price: tx.gasPrice,
      statut: tx.statut,
    });
    console.log(`ok — ${tx.transactionHash}`);
    console.log(`     https://amoy.polygonscan.com/tx/${tx.transactionHash}`);
  }

  // La révocation porte sur le DERNIER diplôme listé : c'est le cas de
  // démonstration le plus parlant — le contrat répond alors
  // `valide = false / revoque = true`, ce qu'aucune base de données seule
  // ne pourrait prouver à un tiers.
  if (motifRevocation) {
    const cible = cibles[cibles.length - 1];
    process.stdout.write(`  ${cible.reference} → révocation on-chain… `);
    const tx = await blockchain.revoquer({
      reference: cible.reference,
      hash: cible.hash_sha256,
      motif: motifRevocation,
    });
    await txModel.creer({
      diplome_id: cible.id,
      transaction_hash: tx.transactionHash,
      block_number: tx.blockNumber,
      adresse_contrat: tx.adresseContrat,
      gas_used: tx.gasUsed,
      gas_price: tx.gasPrice,
      statut: tx.statut,
    });
    await query(
      `UPDATE diplomes SET statut = 'revoque', motif_revocation = $2, date_revocation = now()
        WHERE id = $1`,
      [cible.id, motifRevocation]
    );
    console.log(`ok — ${tx.transactionHash}`);
    console.log(`     https://amoy.polygonscan.com/tx/${tx.transactionHash}`);
  }

  console.log('\nVérification finale :\n');
  for (const d of cibles) {
    const etat = await etatOnChain(d.hash_sha256);
    console.log(
      `  ${d.reference}  existe=${etat?.existe}  valide=${etat?.valide}  revoque=${etat?.revoque}`
    );
  }
  console.log('');
}

try {
  await main();
} catch (err) {
  console.error('\nÉchec :', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
