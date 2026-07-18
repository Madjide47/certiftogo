// ─────────────────────────────────────────────────────────────
// Service "PDF" — génération du document PDF officiel d'un diplôme certifié.
// Le PDF reprend les données signées et embarque le QR de vérification.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { assurerDossierUploads, cheminUpload, urlUpload } from '../config/storage.js';
import { LIBELLES_TYPE_DIPLOME, LIBELLES_MENTION } from '../utils/libelles.js';

const VERT_TOGO = '#006a4e';

/** Convertit une data-URL PNG en Buffer (pour l'embarquer dans le PDF). */
function dataUrlEnBuffer(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Buffer.from(base64, 'base64');
}

/**
 * Génère le PDF d'un diplôme certifié.
 * @param {object} d - données consolidées du diplôme.
 * @param {string} d.reference
 * @param {string} d.candidat_nom
 * @param {string} d.candidat_prenom
 * @param {string} d.type_diplome
 * @param {string} [d.mention]
 * @param {string} [d.filiere]
 * @param {string} [d.date_obtention]
 * @param {string} d.etablissement_nom
 * @param {string} d.hash
 * @param {string} d.signature
 * @param {string} d.qrDataUrl - data-URL PNG du QR de vérification.
 * @returns {Promise<{ nomFichier: string, url: string }>}
 */
export async function genererPdfDiplome(d) {
  assurerDossierUploads();
  const nomFichier = `${d.reference}.pdf`;
  const chemin = cheminUpload(nomFichier);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const flux = fs.createWriteStream(chemin);
    doc.pipe(flux);
    flux.on('finish', resolve);
    flux.on('error', reject);
    doc.on('error', reject);

    const largeur = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // En-tête
    doc.fillColor(VERT_TOGO).fontSize(10).text('RÉPUBLIQUE TOGOLAISE', { align: 'center' });
    doc.moveDown(0.2);
    doc.fillColor('#111').fontSize(22).font('Helvetica-Bold')
      .text('DIPLÔME CERTIFIÉ', { align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#666')
      .text('Certifié et enregistré via CertifTOGO', { align: 'center' });

    doc.moveDown(1.2);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor(VERT_TOGO).lineWidth(2).stroke();
    doc.moveDown(1);

    const ligne = (label, valeur) => {
      doc.fontSize(11).fillColor('#666').font('Helvetica').text(label);
      doc.fontSize(14).fillColor('#111').font('Helvetica-Bold').text(valeur || '—');
      doc.moveDown(0.6);
    };

    ligne('Titulaire', `${d.candidat_prenom || ''} ${d.candidat_nom || ''}`.trim());
    ligne('Diplôme', LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome);
    if (d.filiere) ligne('Filière', d.filiere);
    if (d.mention) ligne('Mention', LIBELLES_MENTION[d.mention] || d.mention);
    if (d.date_obtention) ligne("Date d'obtention", String(d.date_obtention).slice(0, 10));
    ligne('Établissement', d.etablissement_nom);
    ligne('Référence', d.reference);

    // QR de vérification
    const yQr = doc.y + 6;
    try {
      const img = dataUrlEnBuffer(d.qrDataUrl);
      doc.image(img, doc.page.width - doc.page.margins.right - 120, yQr, { width: 120 });
    } catch {
      /* QR indisponible : on continue sans bloquer la génération. */
    }

    // Empreinte et signature
    doc.fontSize(9).fillColor('#888').font('Helvetica');
    doc.text('Empreinte SHA-256 :', doc.page.margins.left, yQr);
    doc.fontSize(8).fillColor('#444').text(d.hash, { width: largeur - 140 });
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#888').text('Signature numérique :');
    doc.fontSize(8).fillColor('#444').text(d.signature, { width: largeur - 140 });

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999')
      .text("Scannez le QR code pour vérifier l'authenticité de ce diplôme.", { align: 'center' });

    doc.end();
  });

  return { nomFichier, url: urlUpload(nomFichier) };
}
