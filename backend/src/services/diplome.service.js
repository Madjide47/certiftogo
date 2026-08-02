// ─────────────────────────────────────────────────────────────
// Service "diplôme" — certification et révocation (module ministère, slice 2).
//
// Certification d'un dossier validé :
//   1. fige un snapshot des données (donnees_signees)
//   2. calcule l'empreinte SHA-256 puis la signature numérique
//   3. ancre la transaction en blockchain (mock en Phase 4)
//   4. génère le QR de vérification et le PDF officiel
//   5. écrit diplôme + transaction + statut dossier dans une transaction SQL
// ─────────────────────────────────────────────────────────────
import * as diplomeModel from '../models/diplome.model.js';
import * as dossierModel from '../models/dossier.model.js';
import * as txModel from '../models/transaction-blockchain.model.js';
import { withTransaction } from '../config/database.js';
import { journaliser, journaliserStatutDossier, ACTIONS } from './audit.service.js';
import { ErreurApp } from '../utils/errors.js';
import { genererReferenceDiplome } from '../utils/reference-generator.js';
import { calculerHash } from './hash.service.js';
import { signer } from './signature.service.js';
import * as blockchain from './blockchain.service.js';
import { genererQrFichier, genererQrDataUrl } from './qr.service.js';
import { genererPdfDiplome } from './pdf.service.js';

/** Liste les diplômes (vue ministère). */
export async function lister({ statut, limit, offset } = {}) {
  return diplomeModel.lister({ statut, limit, offset });
}

/** Récupère un diplôme par id. */
export async function recuperer(id) {
  const diplome = await diplomeModel.trouverParId(id);
  if (!diplome) {
    throw new ErreurApp(404, 'DIPLOME_INTROUVABLE', 'Diplôme introuvable.');
  }
  return diplome;
}

/** Construit le snapshot des données signées à partir d'un dossier. */
function construireSnapshot(dossier) {
  return {
    dossier_reference: dossier.reference,
    candidat: {
      nom: dossier.candidat_nom,
      prenom: dossier.candidat_prenom,
      numero_etudiant: dossier.candidat_numero_etudiant,
    },
    etablissement: dossier.etablissement_nom,
    type_diplome: dossier.type_diplome,
    filiere: dossier.filiere,
    parcours: dossier.parcours,
    mention: dossier.mention,
    date_obtention: dossier.date_obtention
      ? String(dossier.date_obtention).slice(0, 10)
      : null,
    annee_academique: dossier.annee_academique,
    notes: dossier.notes ?? null,
  };
}

/** Génère une référence DIP-AAAA-XXXXX unique. */
async function genererReferenceUnique() {
  for (let i = 0; i < 5; i += 1) {
    const reference = genererReferenceDiplome();
    if (!(await diplomeModel.referenceExiste(reference))) return reference;
  }
  throw new ErreurApp(500, 'REFERENCE_INDISPONIBLE', 'Impossible de générer une référence unique.');
}

/**
 * Prépare tout ce qui précède l'écriture d'un diplôme : snapshot figé,
 * empreinte, signature, référence, QR et PDF.
 *
 * Extrait de `certifier` pour être partagé avec la certification de
 * masse : les deux chemins doivent produire exactement le même diplôme,
 * seul le moment de l'ancrage diffère.
 */
export async function construireDiplomeDepuisDossier(dossier) {
  const snapshot = construireSnapshot(dossier);
  const hash = calculerHash(snapshot);
  const signature = signer(hash);
  const reference = await genererReferenceUnique();

  // IO hors transaction : réutilisables si l'insertion échoue.
  const qr = await genererQrFichier(hash, reference);
  const qrDataUrl = await genererQrDataUrl(hash);
  const pdf = await genererPdfDiplome({
    reference,
    candidat_nom: dossier.candidat_nom,
    candidat_prenom: dossier.candidat_prenom,
    type_diplome: dossier.type_diplome,
    mention: dossier.mention,
    filiere: dossier.filiere,
    date_obtention: dossier.date_obtention,
    etablissement_nom: dossier.etablissement_nom,
    hash,
    signature,
    qrDataUrl,
  });

  return {
    hash,
    signature,
    reference,
    donnees: {
      reference,
      dossier_id: dossier.id,
      candidat_id: dossier.candidat_id,
      etablissement_id: dossier.etablissement_id,
      donnees_signees: snapshot,
      hash_sha256: hash,
      signature_numerique: signature,
      qr_code_url: qr.url,
      pdf_url: pdf.url,
    },
  };
}

/**
 * Certifie un dossier validé → crée le diplôme.
 * @param {string} dossier_id
 * @param {string} ministere_id - ministère de l'agent (depuis le JWT)
 */
export async function certifier(dossier_id, ministere_id) {
  if (!ministere_id) {
    throw new ErreurApp(403, 'MINISTERE_REQUIS', 'Compte ministère requis pour certifier.');
  }
  const dossier = await dossierModel.trouverParIdMinistere(dossier_id);
  if (!dossier) {
    throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');
  }
  if (dossier.statut !== 'valide') {
    throw new ErreurApp(
      409,
      'DOSSIER_NON_CERTIFIABLE',
      'Seul un dossier validé peut être certifié.'
    );
  }
  const existant = await diplomeModel.trouverParDossier(dossier_id);
  if (existant) {
    throw new ErreurApp(409, 'DEJA_CERTIFIE', 'Ce dossier a déjà été certifié.');
  }

  const { donnees, hash, signature, reference } = await construireDiplomeDepuisDossier(dossier);

  // Certification UNITAIRE : l'ancrage reste synchrone. Sur un seul
  // diplôme, attendre la confirmation est acceptable et le résultat
  // immédiat est plus clair pour l'agent. La certification de masse,
  // elle, passe par la file (voir ancrage.service.js).
  const tx = await blockchain.certifier({ reference, hash, signature });
  const qr = { url: donnees.qr_code_url };
  const pdf = { url: donnees.pdf_url };
  const snapshot = donnees.donnees_signees;

  // 5. Écriture atomique : diplôme + transaction + statut dossier.
  const diplome = await withTransaction(async (client) => {
    const cree = await diplomeModel.creer(
      {
        reference,
        dossier_id,
        candidat_id: dossier.candidat_id,
        etablissement_id: dossier.etablissement_id,
        ministere_id,
        donnees_signees: snapshot,
        hash_sha256: hash,
        signature_numerique: signature,
        transaction_id: tx.transactionHash,
        qr_code_url: qr.url,
        pdf_url: pdf.url,
      },
      client
    );
    await txModel.creer(
      {
        diplome_id: cree.id,
        transaction_hash: tx.transactionHash,
        block_number: tx.blockNumber,
        adresse_contrat: tx.adresseContrat,
        gas_used: tx.gasUsed,
        gas_price: tx.gasPrice,
        statut: tx.statut,
      },
      client
    );
    await dossierModel.definirStatut(dossier_id, 'certifie', client);

    // Le compte du diplômé, créé fermé à la saisie, s'ouvre ici : le
    // diplôme est désormais officiel, il a quelque chose à consulter.
    await client.query(
      `UPDATE utilisateurs u
          SET actif = TRUE
         FROM candidats c
        WHERE c.id = $1
          AND u.personne_id = c.personne_id
          AND u.role = 'candidat'
          AND u.actif = FALSE`,
      [dossier.candidat_id]
    );

    // Trace ATOMIQUE : la certification est l'acte le plus sensible du
    // système, sa trace ne doit pas pouvoir manquer. Elle tombe avec la
    // transaction si celle-ci échoue.
    await journaliserStatutDossier(
      {
        dossier_id,
        statut_avant: dossier.statut,
        statut_apres: 'certifie',
        motif: `Certification — diplôme ${reference}.`,
      },
      client
    );

    await journaliser(
      {
        action: ACTIONS.DIPLOME_CERTIFIE,
        entite: 'diplomes',
        entite_id: cree.id,
        apres: { reference, hash_sha256: hash, dossier_id },
        transaction_hash: tx.transactionHash,
        etablissement_id: dossier.etablissement_id,
        message: `${dossier.candidat_nom} ${dossier.candidat_prenom} — ${reference}.`,
      },
      client
    );

    return cree;
  });

  return diplome;
}

/** Révoque un diplôme actif (motif requis). */
export async function revoquer(id, motif) {
  const motifNet = typeof motif === 'string' ? motif.trim() : '';
  if (!motifNet) {
    throw new ErreurApp(400, 'MOTIF_REQUIS', 'Un motif de révocation est requis.');
  }
  const diplome = await diplomeModel.trouverParId(id);
  if (!diplome) {
    throw new ErreurApp(404, 'DIPLOME_INTROUVABLE', 'Diplôme introuvable.');
  }
  if (diplome.statut !== 'actif') {
    throw new ErreurApp(409, 'DIPLOME_NON_REVOCABLE', 'Ce diplôme est déjà révoqué.');
  }

  const tx = await blockchain.revoquer({
    reference: diplome.reference,
    hash: diplome.hash_sha256,
    motif: motifNet,
  });

  return withTransaction(async (client) => {
    const revoque = await diplomeModel.revoquer(id, motifNet, client);
    await journaliser(
      {
        action: ACTIONS.DIPLOME_REVOQUE,
        entite: 'diplomes',
        entite_id: id,
        avant: { statut: 'actif' },
        apres: { statut: 'revoque', motif_revocation: motifNet },
        transaction_hash: tx.transactionHash,
        etablissement_id: diplome.etablissement_id,
        message: `${diplome.reference} — ${motifNet}`,
      },
      client
    );
    await txModel.creer(
      {
        diplome_id: id,
        transaction_hash: tx.transactionHash,
        block_number: tx.blockNumber,
        adresse_contrat: tx.adresseContrat,
        gas_used: tx.gasUsed,
        gas_price: tx.gasPrice,
        statut: tx.statut,
      },
      client
    );
    await dossierModel.definirStatut(diplome.dossier_id, 'revoque', client);
    return revoque;
  });
}
