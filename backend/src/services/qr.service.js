// ─────────────────────────────────────────────────────────────
// Service "QR" — génération du QR code de vérification d'un diplôme.
// Le QR encode l'URL publique de vérification (par hash). On produit à la
// fois une image PNG (stockée dans uploads) et une data-URL (pour l'embarquer
// dans le PDF sans relire le fichier).
// ─────────────────────────────────────────────────────────────
import QRCode from 'qrcode';
import { assurerDossierUploads, cheminUpload, urlUpload } from '../config/storage.js';
import { ErreurApp } from '../utils/errors.js';

const VERIFY_URL =
  process.env.PUBLIC_VERIFY_URL || 'http://localhost:5174/verifier';

/** Adresse du service de vérification, sans empreinte — à imprimer. */
export const URL_VERIFICATION_PUBLIQUE = VERIFY_URL;

/** URL de vérification publique encodée dans le QR d'un diplôme. */
export function urlVerification(hash) {
  return `${VERIFY_URL}/${hash}`;
}

/**
 * Génère le PNG du QR dans uploads ; renvoie { nomFichier, url }.
 *
 * Un échec ici (disque plein, droits) survient au milieu d'une
 * certification : le dire explicitement évite de faire chercher une
 * panne blockchain là où il n'y a qu'un problème de stockage.
 */
export async function genererQrFichier(hash, reference) {
  const nomFichier = `qr-${reference}.png`;
  try {
    assurerDossierUploads();
    await QRCode.toFile(cheminUpload(nomFichier), urlVerification(hash), {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    throw new ErreurApp(
      503,
      'QR_INGENERABLE',
      `Le QR code du diplôme ${reference} n'a pas pu être écrit (${err.code || err.message}).`
    );
  }
  return { nomFichier, url: urlUpload(nomFichier) };
}

/** Renvoie une data-URL PNG du QR (pour embarquer dans le PDF). */
export function genererQrDataUrl(hash) {
  return QRCode.toDataURL(urlVerification(hash), { width: 320, margin: 1 });
}
