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

const MODE = process.env.BLOCKCHAIN_MODE || 'mock';
const ADRESSE_CONTRAT = process.env.CONTRAT_ADRESSE || '';
const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY || '';

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
      statut: 'confirmee',
      mock: true,
    };
  }
  const tx = await contrat().certifier(versBytes32(hash), reference);
  const receipt = await tx.wait();
  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    adresseContrat: ADRESSE_CONTRAT,
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
      statut: 'confirmee',
      mock: true,
    };
  }
  const tx = await contrat().revoquer(versBytes32(hash), motif || 'Révocation');
  const receipt = await tx.wait();
  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    adresseContrat: ADRESSE_CONTRAT,
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
  const r = await contrat().verifier(versBytes32(hash));
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
