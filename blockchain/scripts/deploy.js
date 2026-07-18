// ─────────────────────────────────────────────────────────────
// Déploiement du contrat RegistreDiplomes.
//   npm run deploy:local   (réseau Hardhat local)
//   npm run deploy:amoy    (testnet Polygon Amoy)
//
// L'adresse déployée est à reporter dans le backend (.env) :
//   CONTRAT_ADRESSE=0x...
// ─────────────────────────────────────────────────────────────
const hre = require('hardhat');

async function main() {
  const [deployeur] = await hre.ethers.getSigners();
  const reseau = hre.network.name;

  console.log(`Réseau           : ${reseau}`);
  console.log(`Compte déployeur : ${deployeur.address}`);

  const solde = await hre.ethers.provider.getBalance(deployeur.address);
  console.log(`Solde            : ${hre.ethers.formatEther(solde)} POL/ETH`);

  const Registre = await hre.ethers.getContractFactory('RegistreDiplomes');
  const registre = await Registre.deploy();
  await registre.waitForDeployment();

  const adresse = await registre.getAddress();
  console.log('\n✅ Contrat RegistreDiplomes déployé');
  console.log(`   Adresse : ${adresse}`);
  console.log(`   Proprietaire : ${await registre.proprietaire()}`);

  console.log('\n👉 À reporter dans backend/.env :');
  console.log(`   CONTRAT_ADRESSE=${adresse}`);

  if (reseau === 'amoy') {
    console.log('\nExplorer : https://amoy.polygonscan.com/address/' + adresse);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
