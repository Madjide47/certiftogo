// ─────────────────────────────────────────────────────────────
// Service "QR" — génération du QR code de vérification d'un diplôme.
// Le QR encode l'URL publique de vérification (par hash). On produit à la
// fois une image PNG (stockée dans uploads) et une data-URL (pour l'embarquer
// dans le PDF sans relire le fichier).
// ─────────────────────────────────────────────────────────────
import QRCode from 'qrcode';
import { assurerDossierUploads, cheminUpload, urlUpload } from '../config/storage.js';

const VERIFY_URL =
  process.env.PUBLIC_VERIFY_URL || 'http://localhost:5174/verifier';

/** URL de vérification publique encodée dans le QR d'un diplôme. */
export function urlVerification(hash) {
  return `${VERIFY_URL}/${hash}`;
}

/** Génère le PNG du QR dans uploads ; renvoie { nomFichier, url }. */
export async function genererQrFichier(hash, reference) {
  assurerDossierUploads();
  const nomFichier = `qr-${reference}.png`;
  await QRCode.toFile(cheminUpload(nomFichier), urlVerification(hash), {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  return { nomFichier, url: urlUpload(nomFichier) };
}

/** Renvoie une data-URL PNG du QR (pour embarquer dans le PDF). */
export function genererQrDataUrl(hash) {
  return QRCode.toDataURL(urlVerification(hash), { width: 320, margin: 1 });
}
