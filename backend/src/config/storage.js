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

/** Garantit l'existence du dossier d'upload. */
export function assurerDossierUploads() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/** Chemin absolu d'un fichier d'upload à partir de son nom. */
export function cheminUpload(nomFichier) {
  return path.join(UPLOADS_DIR, nomFichier);
}

/** URL publique (absolue) d'un fichier d'upload. */
export function urlUpload(nomFichier) {
  return `${BASE_URL}${UPLOADS_URL_PREFIX}/${nomFichier}`;
}
