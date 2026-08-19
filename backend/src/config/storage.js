// ─────────────────────────────────────────────────────────────
// Configuration du stockage de fichiers (PDF de diplômes, QR codes).
// Les fichiers sont écrits dans backend/uploads et servis sous /uploads.
// ─────────────────────────────────────────────────────────────
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/config -> backend/uploads
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Préfixe d'URL publique des fichiers servis (statique Express).
export const UPLOADS_URL_PREFIX = '/uploads';

// URL de base publique du serveur (pour construire les liens de vérification).
export const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';

/**
 * Stockage PRIVÉ — pièces justificatives.
 *
 * Volontairement hors de `uploads/`, qui est servi en statique : un PDF de
 * diplôme est fait pour circuler, un relevé de notes non. Ces fichiers ne
 * sortent que par un point d'accès authentifié, qui vérifie le rôle et
 * l'appartenance avant de streamer.
 */
export const STOCKAGE_PRIVE_DIR = path.resolve(__dirname, '../../stockage');

/** Garantit l'existence du dossier d'upload. */
export function assurerDossierUploads() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Chemin absolu d'une pièce à partir de son chemin relatif en base.
 * Le `resolve` puis la vérification du préfixe barrent les remontées de
 * répertoire : un `../` stocké en base ne doit pas donner accès au disque.
 */
export function cheminPiece(cheminRelatif) {
  const absolu = path.resolve(STOCKAGE_PRIVE_DIR, cheminRelatif);
  if (!absolu.startsWith(STOCKAGE_PRIVE_DIR + path.sep)) {
    throw new Error('Chemin de pièce hors du stockage privé.');
  }
  return absolu;
}

/** Crée le répertoire d'accueil d'une pièce et renvoie son chemin absolu. */
export function preparerCheminPiece(cheminRelatif) {
  const absolu = cheminPiece(cheminRelatif);
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  return absolu;
}

/** Chemin absolu d'un fichier d'upload à partir de son nom. */
export function cheminUpload(nomFichier) {
  return path.join(UPLOADS_DIR, nomFichier);
}

/** URL publique (absolue) d'un fichier d'upload. */
export function urlUpload(nomFichier) {
  return `${BASE_URL}${UPLOADS_URL_PREFIX}/${nomFichier}`;
}
