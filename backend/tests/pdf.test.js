// ─────────────────────────────────────────────────────────────
// Tests du PDF de diplôme.
//
// On ne vérifie pas le rendu — c'est l'œil qui juge une mise en page.
// On verrouille ce qui casse silencieusement en production :
//   • une donnée manquante ne doit jamais faire échouer la génération,
//     sinon la certification entière échoue pour un lieu de naissance vide ;
//   • un diplôme révoqué doit produire un document VISIBLEMENT différent,
//     puisqu'un PDF continue de circuler après avoir cessé d'être valable ;
//   • le document doit tenir sur une seule page, quelles que soient les
//     données : un diplôme à rallonge n'existe pas.
// ─────────────────────────────────────────────────────────────
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { genererPdfDiplome } from '../src/services/pdf.service.js';
import { cheminUpload } from '../src/config/storage.js';

const BASE = {
  candidat_nom: 'AGBEKO',
  candidat_prenom: 'Koffi',
  candidat_numero_etudiant: 'IAI-2022-014',
  date_naissance: '2001-03-19',
  lieu_naissance: 'Kpalimé',
  type_diplome: 'licence',
  mention: 'tres_bien',
  filiere: 'Génie Logiciel',
  parcours: "Systèmes d'information",
  annee_academique: '2024-2025',
  date_obtention: '2025-07-15',
  etablissement_nom: "Institut Africain d'Informatique",
  hash: 'a3f1'.repeat(16),
  signature: 'b7c2'.repeat(24),
  qrDataUrl: '',
};

const generes = [];

async function generer(reference, extra = {}) {
  const res = await genererPdfDiplome({ ...BASE, reference, ...extra });
  generes.push(reference);
  const chemin = cheminUpload(res.nomFichier);
  return { res, chemin, contenu: fs.readFileSync(chemin) };
}

/** Compte les pages : `/Type /Pages` porte le total dans /Count. */
function nombreDePages(buffer) {
  const m = buffer.toString('latin1').match(/\/Count\s+(\d+)/);
  return m ? Number(m[1]) : 0;
}

describe('PDF de diplôme', () => {
  test('génère un document non trivial et renvoie son URL', async () => {
    const { res, contenu } = await generer('DIP-TEST-0001');
    assert.equal(res.nomFichier, 'DIP-TEST-0001.pdf');
    assert.match(res.url, /DIP-TEST-0001\.pdf$/);
    assert.equal(contenu.subarray(0, 4).toString(), '%PDF');
    assert.ok(contenu.length > 4000, `PDF trop léger : ${contenu.length} octets`);
  });

  test('tient sur une seule page', async () => {
    const { contenu } = await generer('DIP-TEST-0002');
    assert.equal(nombreDePages(contenu), 1);
  });

  test("reste sur une page même avec des libellés à rallonge", async () => {
    const { contenu } = await generer('DIP-TEST-0003', {
      candidat_prenom: 'Koffi Mawuli Sénamé Elom Kokou',
      etablissement_nom:
        "Institut Africain d'Informatique — Représentation du Togo, Campus de Lomé-Tokoin",
      filiere: 'Génie Logiciel et Systèmes d’Information Répartis',
      parcours: 'Architecture des systèmes distribués et sécurité applicative',
    });
    assert.equal(nombreDePages(contenu), 1);
  });

  test('ne casse pas quand les champs facultatifs manquent', async () => {
    // Un dossier certifié peut n'avoir ni mention, ni parcours, ni état
    // civil complet : ce n'est pas une raison pour refuser le diplôme.
    const { contenu } = await generer('DIP-TEST-0004', {
      mention: null,
      filiere: null,
      parcours: null,
      annee_academique: null,
      date_naissance: null,
      lieu_naissance: null,
      candidat_numero_etudiant: null,
      date_obtention: null,
    });
    assert.equal(contenu.subarray(0, 4).toString(), '%PDF');
    assert.equal(nombreDePages(contenu), 1);
  });

  test('un QR illisible ne bloque pas la génération', async () => {
    const { contenu } = await generer('DIP-TEST-0005', {
      qrDataUrl: 'data:image/png;base64,pas-du-base64-valide',
    });
    assert.equal(contenu.subarray(0, 4).toString(), '%PDF');
  });

  test('un diplôme révoqué produit un document différent de l’original', async () => {
    const actif = await generer('DIP-TEST-0006');
    const revoque = await generer('DIP-TEST-0007', {
      statut: 'revoque',
      motif_revocation: 'Fraude établie lors du contrôle a posteriori',
    });
    assert.ok(
      revoque.contenu.length > actif.contenu.length,
      'le bandeau de révocation doit alourdir le document'
    );
  });

  test('une version supérieure à 1 est signalée dans le document', async () => {
    const v1 = await generer('DIP-TEST-0008');
    const v2 = await generer('DIP-TEST-0009', { version: 2 });
    assert.ok(v2.contenu.length > v1.contenu.length);
  });

  test('renseigne les métadonnées du document', async () => {
    const { contenu } = await generer('DIP-TEST-0010');
    const texte = contenu.toString('latin1');
    assert.ok(texte.includes('CertifTOGO'), 'le producteur doit être identifié');
  });

  test.after(() => {
    for (const ref of generes) {
      try {
        fs.unlinkSync(cheminUpload(`${ref}.pdf`));
      } catch {
        /* déjà supprimé */
      }
    }
  });
});
