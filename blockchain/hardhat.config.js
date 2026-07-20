require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomicfoundation/hardhat-verify');
require('dotenv').config();

// Variables d'environnement (voir .env.example) :
//   AMOY_RPC_URL     — URL RPC du testnet Polygon Amoy
//   DEPLOYER_PRIVATE_KEY — clé privée du compte de déploiement (jamais commitée)
//   POLYGONSCAN_API_KEY  — pour la vérification du contrat (optionnel)
const { AMOY_RPC_URL, DEPLOYER_PRIVATE_KEY, POLYGONSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Réseau local Hardhat (par défaut) — pour développement et tests.
    hardhat: {},
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    // Testnet public Polygon Amoy.
    amoy: {
      // NB : l'endpoint historique rpc-amoy.polygon.technology ne résout plus (DNS).
      url: AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com',
      chainId: 80002,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  // Etherscan API V2 : une clé unique couvre toutes les chaînes (dont Amoy).
  // L'ancien format { apiKey: { polygonAmoy: … } } (V1) n'est plus accepté.
  etherscan: {
    apiKey: POLYGONSCAN_API_KEY || '',
  },
};
