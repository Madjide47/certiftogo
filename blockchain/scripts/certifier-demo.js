// ─────────────────────────────────────────────────────────────
// Démonstration du cycle de vie d'un diplôme (déploiement en mémoire) :
// certification → vérification → révocation → re-vérification.
//   npm run demo:local   (nécessite `npm run node` dans un autre terminal)
// Ou directement :  npx hardhat run scripts/certifier-demo.js
// ─────────────────────────────────────────────────────────────
const hre = require('hardhat');
const { createHash } = require('crypto');

// Calcule le hash SHA-256 (bytes32) d'un snapshot de diplôme.
function hashDiplome(donnees) {
  const hex = createHash('sha256').update(JSON.stringify(donnees)).digest('hex');
  return '0x' + hex;
}

async function main() {
  const [ministere] = await hre.ethers.getSigners();

  const Registre = await hre.ethers.getContractFactory('RegistreDiplomes');
  const registre = await Registre.deploy();
  await registre.waitForDeployment();
  console.log('Contrat déployé :', await registre.getAddress());

  // 1. Snapshot d'un diplôme (données signées côté ministère)
  const donneesSignees = {
    reference: 'DIP-2026-00001',
    candidat: 'Koffi ADJO',
    diplome: 'Baccalauréat série D',
    mention: 'Bien',
    etablissement: 'IAI Lomé',
    annee: 2026,
  };
  const hash = hashDiplome(donneesSignees);
  const reference = donneesSignees.reference;
  console.log('\nHash SHA-256 :', hash);

  // 2. Certification
  let tx = await registre.certifier(hash, reference);
  await tx.wait();
  console.log('✅ Certifié — nombre total :', (await registre.nombreDiplomes()).toString());

  // 3. Vérification (public)
  let v = await registre.verifier(hash);
  console.log('\nVérification :', {
    existe: v.existe,
    revoque: v.revoque,
    refDiplome: v.refDiplome,
    valide: await registre.estValide(hash),
  });

  // 4. Révocation
  tx = await registre.revoquer(hash, 'Erreur de saisie sur la mention');
  await tx.wait();
  console.log('\n🚫 Révoqué');

  // 5. Re-vérification
  v = await registre.verifier(hash);
  console.log('Après révocation :', {
    revoque: v.revoque,
    motif: v.motifRevocation,
    valide: await registre.estValide(hash),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
