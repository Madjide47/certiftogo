// ─────────────────────────────────────────────────────────────
// Service "PDF" — le document officiel du diplôme certifié.
//
// Ce fichier est ce que le diplômé imprime, encadre et présente à un
// employeur. Il doit donc tenir deux rôles à la fois :
//
//   1. un ACTE ADMINISTRATIF lisible — en-tête de la République, formule
//      de certification, mentions légales, signature ;
//   2. un SUPPORT DE VÉRIFICATION — QR, empreinte SHA-256, référence, et
//      l'adresse où contrôler. Le papier ne prouve rien par lui-même ;
//      c'est la vérification en ligne qui fait foi, et le document doit
//      le dire clairement plutôt que de se donner une autorité qu'il n'a
//      pas.
//
// Choix de fabrication :
//   • aucune image externe — le bandeau, le cadre et l'emblème sont
//     dessinés en vectoriel. Un PDF qui dépend d'un fichier absent du
//     serveur casse en production, et jamais en développement ;
//   • un filigrane répété, difficile à reproduire proprement par
//     copier-coller, sans prétendre être un dispositif de sécurité ;
//   • un bandeau rouge sans équivoque si le diplôme est révoqué ou
//     remplacé — un PDF circule longtemps après avoir cessé d'être valable.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { assurerDossierUploads, cheminUpload, urlUpload } from '../config/storage.js';
import { LIBELLES_TYPE_DIPLOME, LIBELLES_MENTION } from '../utils/libelles.js';
import { urlVerification, URL_VERIFICATION_PUBLIQUE } from './qr.service.js';
import { ErreurApp } from '../utils/errors.js';

// Couleurs du drapeau togolais, seules teintes autorisées.
const VERT = '#006a4e';
const JAUNE = '#ffce00';
const ROUGE = '#d21034';
const ENCRE = '#1a1a1a';
const GRIS = '#5a5a5a';
const GRIS_CLAIR = '#8c8c8c';

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** « 2025-07-15 » → « 15 juillet 2025 ». Un acte ne s'écrit pas en ISO. */
function dateEnToutesLettres(valeur) {
  if (!valeur) return null;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return String(valeur).slice(0, 10);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Convertit une data-URL PNG en Buffer (pour l'embarquer dans le PDF). */
function dataUrlEnBuffer(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Buffer.from(base64, 'base64');
}

/**
 * Emblème dessiné : un cercle vert frappé d'une étoile à cinq branches,
 * évocation sobre des armoiries sans usurper le sceau de l'État.
 */
function emblème(doc, cx, cy, rayon) {
  doc.save();
  doc.circle(cx, cy, rayon).lineWidth(1.5).strokeColor(VERT).stroke();
  doc.circle(cx, cy, rayon - 3).lineWidth(0.5).strokeColor(JAUNE).stroke();

  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? rayon - 7 : (rayon - 7) / 2.4;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  doc.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) doc.lineTo(x, y);
  doc.closePath().fillColor(JAUNE).fill();
  doc.restore();
}

/** Filigrane diagonal répété, en très faible opacité. */
function filigrane(doc, texte) {
  doc.save();
  doc.rotate(-38, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.fillColor(VERT).opacity(0.05).font('Helvetica-Bold').fontSize(30);
  for (let y = -140; y < doc.page.height + 200; y += 96) {
    for (let x = -220; x < doc.page.width + 220; x += 250) {
      doc.text(texte, x, y, { lineBreak: false });
    }
  }
  doc.opacity(1).restore();
}

/** Bandeau d'invalidité — un PDF survit toujours à sa validité. */
function bandeauInvalide(doc, libelle, motif) {
  const y = doc.page.height / 2 - 40;
  doc.save();
  doc.rotate(-18, { origin: [doc.page.width / 2, y + 30] });
  doc.rect(-40, y, doc.page.width + 80, 62).fillColor(ROUGE).opacity(0.9).fill();
  doc.opacity(1).fillColor('#fff').font('Helvetica-Bold').fontSize(34);
  doc.text(libelle.toUpperCase(), -40, y + 8, { width: doc.page.width + 80, align: 'center' });
  if (motif) {
    doc.font('Helvetica').fontSize(9);
    doc.text(motif, -40, y + 46, { width: doc.page.width + 80, align: 'center' });
  }
  doc.restore();
}

/**
 * Génère le PDF d'un diplôme certifié.
 *
 * @param {object} d
 * @param {string} d.reference
 * @param {string} d.candidat_nom
 * @param {string} d.candidat_prenom
 * @param {string} [d.candidat_numero_etudiant]
 * @param {string} [d.date_naissance]
 * @param {string} [d.lieu_naissance]
 * @param {string} d.type_diplome
 * @param {string} [d.mention]
 * @param {string} [d.filiere]
 * @param {string} [d.parcours]
 * @param {string} [d.annee_academique]
 * @param {string} [d.date_obtention]
 * @param {string} d.etablissement_nom
 * @param {number} [d.version]      - > 1 si le diplôme remplace un précédent
 * @param {string} [d.statut]       - 'actif' | 'revoque' | 'remplace'
 * @param {string} [d.motif_revocation]
 * @param {string} d.hash
 * @param {string} d.signature
 * @param {string} d.qrDataUrl
 * @returns {Promise<{ nomFichier: string, url: string }>}
 */
export async function genererPdfDiplome(d) {
  const nomFichier = `${d.reference}.pdf`;
  let chemin;
  try {
    assurerDossierUploads();
    chemin = cheminUpload(nomFichier);
  } catch (err) {
    throw new ErreurApp(
      503,
      'STOCKAGE_INDISPONIBLE',
      `Le dossier de destination du diplôme est inaccessible (${err.code || err.message}).`
    );
  }

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `Diplôme ${d.reference}`,
        Author: 'République Togolaise — CertifTOGO',
        Subject: `${LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome} — ${d.candidat_nom} ${d.candidat_prenom}`,
        Keywords: `diplôme, certification, blockchain, ${d.reference}`,
        Creator: 'CertifTOGO',
      },
    });

    const flux = fs.createWriteStream(chemin);
    doc.pipe(flux);
    flux.on('finish', resolve);
    flux.on('error', reject);
    doc.on('error', reject);

    const L = doc.page.width;
    const H = doc.page.height;
    const M = 48; // marge du cadre
    const contenu = L - M * 2;
    const gauche = M + 22;
    const largeur = contenu - 44;

    // ── Fond et filigrane ────────────────────────────────────────
    filigrane(doc, 'CERTIFTOGO');

    // ── Cadre double ─────────────────────────────────────────────
    doc.rect(M, M, contenu, H - M * 2).lineWidth(2).strokeColor(VERT).stroke();
    doc.rect(M + 6, M + 6, contenu - 12, H - M * 2 - 12).lineWidth(0.5).strokeColor(JAUNE).stroke();

    // ── En-tête ──────────────────────────────────────────────────
    let y = M + 30;
    emblème(doc, L / 2, y + 26, 26);
    y += 62;

    doc.font('Helvetica-Bold').fontSize(13).fillColor(VERT);
    doc.text('RÉPUBLIQUE TOGOLAISE', gauche, y, { width: largeur, align: 'center' });
    y += 16;
    doc.font('Helvetica').fontSize(8).fillColor(GRIS);
    doc.text('Travail — Liberté — Patrie', gauche, y, { width: largeur, align: 'center' });
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(ENCRE);
    doc.text(
      "Ministère de l'Enseignement Supérieur et de la Recherche",
      gauche,
      y,
      { width: largeur, align: 'center' }
    );

    // Filet tricolore
    y += 22;
    const largeurFilet = largeur / 3;
    for (const [i, couleur] of [VERT, JAUNE, ROUGE].entries()) {
      doc.rect(gauche + i * largeurFilet, y, largeurFilet, 3).fillColor(couleur).fill();
    }

    // ── Titre ────────────────────────────────────────────────────
    y += 28;
    doc.font('Helvetica-Bold').fontSize(26).fillColor(ENCRE);
    doc.text('DIPLÔME', gauche, y, { width: largeur, align: 'center', characterSpacing: 4 });
    y += 32;
    doc.font('Helvetica').fontSize(11).fillColor(VERT);
    doc.text(
      (LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome || '').toUpperCase(),
      gauche,
      y,
      { width: largeur, align: 'center', characterSpacing: 2 }
    );

    // ── Formule de certification ─────────────────────────────────
    y += 30;
    doc.font('Helvetica').fontSize(10).fillColor(GRIS);
    doc.text(
      "Le Ministre de l'Enseignement Supérieur et de la Recherche certifie que",
      gauche,
      y,
      { width: largeur, align: 'center' }
    );

    y += 22;
    const titulaire = `${d.candidat_prenom || ''} ${(d.candidat_nom || '').toUpperCase()}`.trim();
    doc.font('Helvetica-Bold').fontSize(20).fillColor(ENCRE);
    doc.text(titulaire || '—', gauche, y, { width: largeur, align: 'center' });

    // État civil : c'est ce qui distingue deux homonymes.
    y += 26;
    const naissance = [
      dateEnToutesLettres(d.date_naissance) && `né(e) le ${dateEnToutesLettres(d.date_naissance)}`,
      d.lieu_naissance && `à ${d.lieu_naissance}`,
    ]
      .filter(Boolean)
      .join(' ');
    if (naissance) {
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(GRIS);
      doc.text(naissance, gauche, y, { width: largeur, align: 'center' });
      y += 14;
    }

    doc.font('Helvetica').fontSize(10).fillColor(GRIS);
    doc.text(
      'a satisfait aux épreuves et obtenu le diplôme mentionné ci-dessus.',
      gauche,
      y,
      { width: largeur, align: 'center' }
    );

    // ── Tableau des mentions ─────────────────────────────────────
    y += 26;
    const champs = [
      ['Établissement', d.etablissement_nom],
      ['Filière', d.filiere],
      ['Parcours', d.parcours],
      ['Mention', d.mention ? LIBELLES_MENTION[d.mention] || d.mention : null],
      ['Année académique', d.annee_academique],
      ["Date d'obtention", dateEnToutesLettres(d.date_obtention)],
      ['Numéro étudiant', d.candidat_numero_etudiant],
    ].filter(([, v]) => v);

    const hauteurLigne = 21;
    const hauteurTable = champs.length * hauteurLigne;
    doc.rect(gauche, y, largeur, hauteurTable).fillColor('#f7f9f8').fill();
    doc.rect(gauche, y, 3, hauteurTable).fillColor(VERT).fill();

    champs.forEach(([label, valeur], i) => {
      const yl = y + i * hauteurLigne;
      if (i > 0) {
        doc
          .moveTo(gauche + 12, yl)
          .lineTo(gauche + largeur - 12, yl)
          .lineWidth(0.4)
          .strokeColor('#e0e5e3')
          .stroke();
      }
      doc.font('Helvetica').fontSize(9).fillColor(GRIS);
      doc.text(label, gauche + 16, yl + 6.5, { width: 140 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(ENCRE);
      doc.text(String(valeur), gauche + 160, yl + 6, { width: largeur - 176, ellipsis: true });
    });
    y += hauteurTable + 24;

    // ── Vérification : QR à gauche, empreintes à droite ──────────
    const yBloc = y;
    const tailleQr = 104;

    try {
      doc.image(dataUrlEnBuffer(d.qrDataUrl), gauche, yBloc, { width: tailleQr });
    } catch {
      // QR indisponible : on trace un cadre plutôt que de casser la
      // génération — un diplôme sans PDF serait pire qu'un PDF sans QR.
      doc.rect(gauche, yBloc, tailleQr, tailleQr).lineWidth(0.5).strokeColor(GRIS_CLAIR).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(GRIS_CLAIR);
      doc.text('QR indisponible', gauche, yBloc + tailleQr / 2 - 4, {
        width: tailleQr,
        align: 'center',
      });
    }

    doc.font('Helvetica').fontSize(7).fillColor(GRIS);
    doc.text('Scannez pour vérifier', gauche, yBloc + tailleQr + 5, {
      width: tailleQr,
      align: 'center',
    });

    const xInfo = gauche + tailleQr + 20;
    const largeurInfo = largeur - tailleQr - 20;
    let yi = yBloc;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(VERT);
    doc.text('VÉRIFICATION DE L’AUTHENTICITÉ', xInfo, yi, { width: largeurInfo });
    yi += 14;

    doc.font('Helvetica').fontSize(8).fillColor(ENCRE);
    doc.text(
      "Ce document ne fait foi que confronté au registre national. Scannez le code ou saisissez la référence ci-dessous sur :",
      xInfo,
      yi,
      { width: largeurInfo }
    );
    yi += 22;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(VERT);
    doc.text(URL_VERIFICATION_PUBLIQUE, xInfo, yi, {
      width: largeurInfo,
      link: urlVerification(d.hash),
    });
    yi += 16;

    const empreinte = (label, valeur, taille = 6.5) => {
      doc.font('Helvetica').fontSize(7).fillColor(GRIS_CLAIR);
      doc.text(label, xInfo, yi, { width: largeurInfo });
      yi += 9;
      doc.font('Courier').fontSize(taille).fillColor(GRIS);
      doc.text(valeur || '—', xInfo, yi, { width: largeurInfo });
      yi = doc.y + 5;
    };

    empreinte('Référence du diplôme', d.reference, 8);
    empreinte('Empreinte SHA-256', d.hash);
    empreinte('Signature numérique du ministère', d.signature);

    // ── Signature manuscrite ─────────────────────────────────────
    const ySignature = Math.max(doc.y, yBloc + tailleQr + 24) + 14;
    if (ySignature < H - M - 96) {
      const xSig = gauche + largeur - 190;
      doc.font('Helvetica').fontSize(8.5).fillColor(GRIS);
      doc.text(
        `Fait à Lomé, le ${dateEnToutesLettres(new Date())}`,
        xSig,
        ySignature,
        { width: 190, align: 'center' }
      );
      doc
        .moveTo(xSig + 20, ySignature + 44)
        .lineTo(xSig + 170, ySignature + 44)
        .lineWidth(0.6)
        .strokeColor(GRIS_CLAIR)
        .stroke();
      doc.fontSize(8).fillColor(GRIS);
      doc.text('Le Ministre', xSig, ySignature + 48, { width: 190, align: 'center' });
    }

    // ── Pied de page ─────────────────────────────────────────────
    const yPied = H - M - 34;
    doc
      .moveTo(gauche, yPied)
      .lineTo(gauche + largeur, yPied)
      .lineWidth(0.5)
      .strokeColor('#dde3e0')
      .stroke();

    doc.font('Helvetica').fontSize(6.5).fillColor(GRIS_CLAIR);
    doc.text(
      'CertifTOGO — registre national des diplômes. Toute reproduction de ce document est sans valeur : ' +
        "seule la vérification en ligne atteste l'authenticité du diplôme.",
      gauche,
      yPied + 7,
      { width: largeur, align: 'center' }
    );

    if (d.version > 1) {
      doc.fontSize(6.5).fillColor(ROUGE);
      doc.text(
        `Ce diplôme est la version ${d.version} : il remplace un document précédent, révoqué.`,
        gauche,
        yPied + 22,
        { width: largeur, align: 'center' }
      );
    }

    // ── Invalidité ───────────────────────────────────────────────
    if (d.statut === 'revoque') {
      bandeauInvalide(doc, 'Diplôme révoqué', d.motif_revocation);
    } else if (d.statut === 'remplace') {
      bandeauInvalide(doc, 'Document remplacé', 'Une version corrigée a été émise.');
    }

    doc.end();
  }).catch((err) => {
    // Le flux a échoué en cours d'écriture : le fichier tronqué ne doit
    // pas rester, un diplôme à moitié imprimé circulerait comme un vrai.
    fs.rm(chemin, { force: true }, () => {});
    throw new ErreurApp(
      503,
      'PDF_INGENERABLE',
      `Le diplôme ${d.reference} n'a pas pu être imprimé (${err.code || err.message}).`
    );
  });

  return { nomFichier, url: urlUpload(nomFichier) };
}
