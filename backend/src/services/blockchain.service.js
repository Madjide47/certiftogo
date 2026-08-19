// ─────────────────────────────────────────────────────────────
// Service "blockchain" — ancrage d'un diplôme sur le contrat RegistreDiplomes.
//
// Deux modes (BLOCKCHAIN_MODE) :
//   - "mock"    : simule une transaction (aucun nœud requis) — défaut.
//   - "onchain" : appels réels via Ethers (nœud Hardhat local ou Polygon Amoy).
//
// Config onchain (voir .env.example) :
//   CONTRAT_ADRESSE         adresse du contrat déployé
//   BLOCKCHAIN_RPC_URL      URL RPC (ex: http://127.0.0.1:8545)
//   BLOCKCHAIN_PRIVATE_KEY  clé du signataire (doit être autorisé à certifier)
//
// On n'écrit JAMAIS de données personnelles : seul le hash SHA-256 est ancré.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { ErreurApp } from '../utils/errors.js';

const MODE = process.env.BLOCKCHAIN_MODE || 'mock';
const ADRESSE_CONTRAT = process.env.CONTRAT_ADRESSE || '';
const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY || '';

/**
 * Délai au-delà duquel on cesse d'attendre la confirmation.
 *
 * Sans plafond, `tx.wait()` attend indéfiniment : un RPC qui ne répond
 * plus laisse la requête HTTP ouverte, l'agent devant un bouton qui
 * tourne, et personne pour dire que le réseau est en cause. Amoy confirme
 * en quelques secondes ; deux minutes est déjà généreux.
 */
const DELAI_CONFIRMATION_MS = Number(process.env.BLOCKCHAIN_TIMEOUT_MS || 120_000);

/**
 * Traduit une défaillance Ethers en erreur métier actionnable.
 *
 * Une erreur réseau et un portefeuille vide se ressemblent dans les logs
 * et n'appellent pas du tout le même geste : l'une se réessaie, l'autre
 * exige une recharge. Les confondre sous « erreur interne » revient à
 * laisser l'exploitant chercher au mauvais endroit pendant que la
 * certification du pays est à l'arrêt.
 */
export function traduireErreurBlockchain(err) {
  if (err instanceof ErreurApp) return err;

  const code = err?.code || '';
  const message = String(err?.shortMessage || err?.message || '');

  if (code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(message)) {
    return new ErreurApp(
      503,
      'SOLDE_BLOCKCHAIN_INSUFFISANT',
      "Le portefeuille de service n'a plus de quoi payer les frais de transaction. Rechargez-le avant de relancer l'ancrage."
    );
  }
  if (['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(code)) {
    return new ErreurApp(
      503,
      'BLOCKCHAIN_INJOIGNABLE',
      "Le réseau blockchain est injoignable. Le diplôme reste en file d'ancrage et sera repris automatiquement."
    );
  }
  if (code === 'CALL_EXCEPTION' || /revert/i.test(message)) {
    return new ErreurApp(
      409,
      'TRANSACTION_REJETEE',
      `Le contrat a rejeté l'opération : ${message || 'raison non précisée'}.`
    );
  }
  if (code === 'NONCE_EXPIRED' || code === 'REPLACEMENT_UNDERPRICED') {
    return new ErreurApp(
      409,
      'TRANSACTION_CONCURRENTE',
      'Une autre transaction est déjà en cours avec ce portefeuille. Réessayez dans un instant.'
    );
  }
  return new ErreurApp(
    503,
    'ANCRAGE_IMPOSSIBLE',
    `L'ancrage a échoué (${code || 'cause inconnue'}). L'opération sera reprise par la file d'ancrage.`
  );
}

/** Exécute un appel on-chain en traduisant toute défaillance. */
async function surLaChaine(operation) {
  try {
    return await operation();
  } catch (err) {
    throw traduireErreurBlockchain(err);
  }
}

/** Attend la confirmation, sans attendre indéfiniment. */
async function confirmer(tx) {
  const receipt = await tx.wait(1, DELAI_CONFIRMATION_MS);
  if (!receipt) {
    throw new ErreurApp(
      503,
      'CONFIRMATION_TROP_LENTE',
      `La transaction ${tx.hash} n'a pas été confirmée en ${Math.round(DELAI_CONFIRMATION_MS / 1000)} s. Elle peut encore aboutir : la file d'ancrage en assurera le suivi.`
    );
  }
  return receipt;
}

// ABI minimal : uniquement les fonctions utilisées par le backend.
const ABI = [
  'function certifier(bytes32 hashSha256, string refDiplome) external',
  'function revoquer(bytes32 hashSha256, string motif) external',
  'function estValide(bytes32 hashSha256) external view returns (bool)',
  'function verifier(bytes32 hashSha256) external view returns (bool existe, bool revoque, string refDiplome, uint256 dateCertification, address certificateur, string motifRevocation)',
];

/** true si le mode on-chain est actif (et configuré). */
export function estOnChain() {
  return MODE === 'onchain';
}

/** Convertit un hash SHA-256 hex (64 car.) en bytes32 (0x…). */
function versBytes32(hash) {
  const h = String(hash || '').toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(h)) {
    throw new Error(`Hash SHA-256 invalide pour l'ancrage: "${hash}"`);
  }
  return `0x${h}`;
}

// Instance contrat (paresseuse, réutilisée).
let _contrat = null;
function contrat() {
  if (_contrat) return _contrat;
  if (!ADRESSE_CONTRAT || !PRIVATE_KEY) {
    throw new Error(
      'Configuration blockchain incomplète : définir CONTRAT_ADRESSE et BLOCKCHAIN_PRIVATE_KEY.'
    );
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  _contrat = new ethers.Contract(ADRESSE_CONTRAT, ABI, wallet);
  return _contrat;
}

/** Faux hash de transaction déterministe (mode mock). */
function fauxTxHash(graine) {
  return `0x${crypto.createHash('sha256').update(`tx:${graine}:${Date.now()}`).digest('hex')}`;
}

/**
 * Ancre la certification d'un diplôme.
 * @param {{ reference: string, hash: string }} diplome
 */
export async function certifier({ reference, hash }) {
  if (MODE === 'mock') {
    return {
      transactionHash: fauxTxHash(`certifier:${reference}:${hash}`),
      blockNumber: null,
      adresseContrat: ADRESSE_CONTRAT || '0xMOCK',
      // Ordre de grandeur mesure sur Amoy, pour que les statistiques de
      // cout soient exploitables meme en mode mock.
      gasUsed: '120000',
      gasPrice: '30000000000',
      statut: 'confirmee',
      mock: true,
    };
  }
  const receipt = await surLaChaine(async () =>
    confirmer(await contrat().certifier(versBytes32(hash), reference))
  );
  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    adresseContrat: ADRESSE_CONTRAT,
    // `gas_used` restait NULL en base : le cout reel d'une operation etait
    // invisible, donc impossible a suivre ni a projeter en mainnet.
    gasUsed: receipt.gasUsed != null ? receipt.gasUsed.toString() : null,
    gasPrice: receipt.gasPrice != null ? receipt.gasPrice.toString() : null,
    statut: receipt.status === 1 ? 'confirmee' : 'echouee',
    mock: false,
  };
}

/**
 * Ancre la révocation d'un diplôme.
 * @param {{ reference: string, hash: string, motif: string }} diplome
 */
export async function revoquer({ reference, hash, motif }) {
  if (MODE === 'mock') {
    return {
      transactionHash: fauxTxHash(`revoquer:${reference}:${hash}`),
      blockNumber: null,
      adresseContrat: ADRESSE_CONTRAT || '0xMOCK',
      // Ordre de grandeur mesure sur Amoy, pour que les statistiques de
      // cout soient exploitables meme en mode mock.
      gasUsed: '120000',
      gasPrice: '30000000000',
      statut: 'confirmee',
      mock: true,
    };
  }
  const receipt = await surLaChaine(async () =>
    confirmer(await contrat().revoquer(versBytes32(hash), motif || 'Révocation'))
  );
  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    adresseContrat: ADRESSE_CONTRAT,
    // `gas_used` restait NULL en base : le cout reel d'une operation etait
    // invisible, donc impossible a suivre ni a projeter en mainnet.
    gasUsed: receipt.gasUsed != null ? receipt.gasUsed.toString() : null,
    gasPrice: receipt.gasPrice != null ? receipt.gasPrice.toString() : null,
    statut: receipt.status === 1 ? 'confirmee' : 'echouee',
    mock: false,
  };
}

/**
 * Lit l'état ancré d'un diplôme sur la chaîne (mode onchain uniquement).
 * @returns {Promise<null | { existe: boolean, revoque: boolean, valide: boolean,
 *   refDiplome: string, dateCertification: number|null, certificateur: string }>}
 */
export async function verifierOnChain(hash) {
  if (MODE !== 'onchain') return null;
  const r = await surLaChaine(() => contrat().verifier(versBytes32(hash)));
  const existe = r[0];
  const revoque = r[1];
  return {
    existe,
    revoque,
    valide: existe && !revoque,
    refDiplome: r[2],
    dateCertification: existe ? Number(r[3]) : null,
    certificateur: r[4],
  };
}

/**
 * Solde du portefeuille de service, celui qui paie le gas.
 *
 * Un portefeuille vide arrête la certification du pays : c'est un risque
 * d'exploitation, pas un incident technique, et il se surveille comme tel.
 *
 * @returns {Promise<{ adresse, solde_wei, solde, mock }>}
 */
export async function soldeService() {
  if (MODE === 'mock') {
    return {
      adresse: '0xMOCK',
      solde_wei: '5000000000000000000',
      solde: 5,
      mock: true,
    };
  }

  if (!PRIVATE_KEY) {
    throw new Error('BLOCKCHAIN_PRIVATE_KEY absent : solde du portefeuille illisible.');
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signataire = new ethers.Wallet(PRIVATE_KEY, provider);
  const adresse = await signataire.getAddress();
  // La surveillance du solde ne doit pas tomber quand le RPC tousse :
  // c'est précisément le moment où l'exploitant consulte cet écran.
  const solde = await surLaChaine(() => provider.getBalance(adresse));

  return {
    adresse,
    solde_wei: solde.toString(),
    solde: Number(solde) / 1e18,
    mock: false,
  };
}
