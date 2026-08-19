// ─────────────────────────────────────────────────────────────
// Service "correction de diplôme" — ERR-001 et ERR-002 du CDC.
//
// Deux cas réels : une diplômée se marie et change de nom ; une erreur de
// mention est découverte après certification.
//
// On ne MODIFIE jamais un diplôme certifié. Le hash ancré on-chain ne
// correspondrait plus — et c'est précisément ce que la blockchain sert à
// empêcher. On produit une nouvelle version et on marque l'ancienne
// comme remplacée.
//
// « Remplacé » n'est pas « révoqué » : un diplôme révoqué a été retiré à
// son titulaire, un diplôme remplacé reste légitime. Confondre les deux
// ferait passer une mariée pour une fraudeuse.
//
// Côté contrat, `RegistreDiplomes` ne connaît que certifier() et
// revoquer() : un remplacement s'y traduit par une révocation de l'ancien
// hash suivie de la certification du nouveau. Le lien entre versions vit
// hors chaîne, dans `corrections_diplome`.
// ─────────────────────────────────────────────────────────────
import { withTransaction, query } from '../config/database.js';
import * as diplomeModel from '../models/diplome.model.js';
import * as dossierModel from '../models/dossier.model.js';
import * as txModel from '../models/transaction-blockchain.model.js';
import * as blockchain from './blockchain.service.js';
import { calculerHash } from './hash.service.js';
import { signer, empreinteCle } from './signature.service.js';
import { idCleCourante } from './exceptions.service.js';
import { genererQrFichier, genererQrDataUrl } from './qr.service.js';
import { genererPdfDiplome } from './pdf.service.js';
import * as references from './reference.service.js';
import { journaliser, ACTIONS } from './audit.service.js';
import * as notifications from './notification.service.js';
import { contexteCourant } from '../config/contexte.js';
import { ErreurApp } from '../utils/errors.js';
import * as nomenclature from './nomenclature.service.js';
import { nettoyerTexte, estUuidValide } from '../utils/validators.js';

const TYPES_CORRECTION = ['changement_nom', 'erreur_donnees', 'autre'];

/** Champs qu'une correction peut toucher, et leur emplacement. */
const CHAMPS_IDENTITE = ['nom', 'prenom', 'date_naissance', 'lieu_naissance'];
const CHAMPS_DIPLOME = ['mention', 'filiere', 'parcours', 'type_diplome', 'date_obtention'];

async function validerCorrections(corrections = {}) {
  const identite = {};
  const diplome = {};

  for (const [champ, valeur] of Object.entries(corrections)) {
    const propre = typeof valeur === 'string' ? nettoyerTexte(valeur) : valeur;
    if (propre === null || propre === undefined || propre === '') continue;

    if (CHAMPS_IDENTITE.includes(champ)) identite[champ] = propre;
    else if (CHAMPS_DIPLOME.includes(champ)) diplome[champ] = propre;
    else {
      throw new ErreurApp(
        400,
        'CHAMP_NON_CORRIGEABLE',
        `Le champ « ${champ} » ne peut pas être corrigé. Champs autorisés : ${[...CHAMPS_IDENTITE, ...CHAMPS_DIPLOME].join(', ')}.`
      );
    }
  }

  if (diplome.mention && !(await nomenclature.estMentionValide(diplome.mention))) {
    throw new ErreurApp(400, 'MENTION_INVALIDE', 'Mention inconnue.');
  }
  if (Object.keys(identite).length + Object.keys(diplome).length === 0) {
    throw new ErreurApp(400, 'AUCUNE_CORRECTION', 'Précisez au moins un champ à corriger.');
  }

  return { identite, diplome };
}

/**
 * Corrige un diplôme certifié en émettant une nouvelle version.
 *
 * @param {string} diplome_id
 * @param {string} ministere_id
 * @param {{ type, motif, corrections }} donnees
 */
export async function corriger(diplome_id, ministere_id, donnees = {}) {
  if (!ministere_id) {
    throw new ErreurApp(403, 'MINISTERE_REQUIS', 'Compte ministère requis.');
  }
  if (!estUuidValide(diplome_id)) {
    throw new ErreurApp(404, 'DIPLOME_INTROUVABLE', 'Diplôme introuvable.');
  }

  const origine = await diplomeModel.trouverParId(diplome_id);
  if (!origine) throw new ErreurApp(404, 'DIPLOME_INTROUVABLE', 'Diplôme introuvable.');

  if (origine.statut === 'remplace') {
    throw new ErreurApp(
      409,
      'DIPLOME_DEJA_REMPLACE',
      'Ce diplôme a déjà été remplacé. Corrigez la version en vigueur.'
    );
  }
  if (origine.statut === 'revoque') {
    throw new ErreurApp(
      409,
      'DIPLOME_REVOQUE',
      'Un diplôme révoqué ne se corrige pas : il a été retiré à son titulaire.'
    );
  }

  const type = nettoyerTexte(donnees.type);
  if (!type || !TYPES_CORRECTION.includes(type)) {
    throw new ErreurApp(
      400,
      'TYPE_INVALIDE',
      `Type de correction inconnu. Valeurs : ${TYPES_CORRECTION.join(', ')}.`
    );
  }

  const motif = nettoyerTexte(donnees.motif);
  if (!motif) {
    throw new ErreurApp(
      400,
      'MOTIF_REQUIS',
      'Un motif est obligatoire : c\'est lui qui justifie le remplacement en cas de contestation.'
    );
  }

  const { identite, diplome: champsDiplome } = await validerCorrections(donnees.corrections);

  // ── 1. Appliquer les corrections au dossier et à l'identité ──
  // L'identité change sur la PERSONNE : un mariage ne concerne pas une
  // seule inscription, il concerne l'individu.
  const dossier = await dossierModel.trouverParIdMinistere(origine.dossier_id);
  const valeurs_avant = {
    nom: origine.candidat_nom,
    prenom: origine.candidat_prenom,
    mention: origine.mention,
    filiere: origine.filiere,
    type_diplome: origine.type_diplome,
  };

  await withTransaction(async (client) => {
    if (Object.keys(identite).length > 0) {
      const colonnes = Object.keys(identite);
      const affectations = colonnes.map((c, i) => `${c} = $${i + 2}`).join(', ');
      const valeurs = colonnes.map((c) => identite[c]);

      await client.query(
        `UPDATE personnes SET ${affectations} WHERE id =
           (SELECT personne_id FROM candidats WHERE id = $1)`,
        [origine.candidat_id, ...valeurs]
      );
      await client.query(
        `UPDATE candidats SET ${affectations} WHERE personne_id =
           (SELECT personne_id FROM candidats WHERE id = $1)`,
        [origine.candidat_id, ...valeurs]
      );
    }

    if (Object.keys(champsDiplome).length > 0) {
      const colonnes = Object.keys(champsDiplome);
      const affectations = colonnes.map((c, i) => `${c} = $${i + 2}`).join(', ');
      await client.query(
        `UPDATE dossiers SET ${affectations} WHERE id = $1`,
        [origine.dossier_id, ...colonnes.map((c) => champsDiplome[c])]
      );
    }
  });

  // ── 2. Reconstruire le diplôme à partir des données corrigées ──
  const dossierCorrige = await dossierModel.trouverParIdMinistere(origine.dossier_id);
  const snapshot = {
    ...(origine.donnees_signees || {}),
    candidat: {
      nom: dossierCorrige.candidat_nom,
      prenom: dossierCorrige.candidat_prenom,
      numero_etudiant: dossierCorrige.candidat_numero_etudiant,
    },
    type_diplome: dossierCorrige.type_diplome,
    filiere: dossierCorrige.filiere,
    parcours: dossierCorrige.parcours,
    mention: dossierCorrige.mention,
    date_obtention: dossierCorrige.date_obtention
      ? String(dossierCorrige.date_obtention).slice(0, 10)
      : null,
    // Le snapshot porte sa propre version : deux versions d'un même
    // diplôme ne doivent jamais produire le même hash.
    version: origine.version + 1,
    remplace: origine.reference,
  };

  const hash = calculerHash(snapshot);
  const signature = signer(hash);
  const cleSignature = await idCleCourante();
  const reference = await references.reserverUne('DIP');

  // ── 3. Chaîne : révoquer l'ancien hash, ancrer le nouveau ──
  const txRevocation = await blockchain.revoquer({
    reference: origine.reference,
    hash: origine.hash_sha256,
    motif: `Remplacé par ${reference} — ${motif}`,
  });
  const txEmission = await blockchain.certifier({ reference, hash, signature });

  const qr = await genererQrFichier(hash, reference);
  const qrDataUrl = await genererQrDataUrl(hash);
  const pdf = await genererPdfDiplome({
    reference,
    candidat_nom: dossierCorrige.candidat_nom,
    candidat_prenom: dossierCorrige.candidat_prenom,
    type_diplome: dossierCorrige.type_diplome,
    mention: dossierCorrige.mention,
    filiere: dossierCorrige.filiere,
    date_obtention: dossierCorrige.date_obtention,
    etablissement_nom: dossierCorrige.etablissement_nom,
    hash,
    signature,
    qrDataUrl,
  });

  // ── 4. Écriture atomique ──
  const resultat = await withTransaction(async (client) => {
    await diplomeModel.marquerRemplace(
      diplome_id,
      `Remplacé par ${reference} — ${motif}`,
      client
    );

    const nouveau = await diplomeModel.creer(
      {
        reference,
        dossier_id: origine.dossier_id,
        candidat_id: origine.candidat_id,
        etablissement_id: origine.etablissement_id,
        ministere_id,
        donnees_signees: snapshot,
        hash_sha256: hash,
        signature_numerique: signature,
        // L-10 — la version corrigée est signée comme l'originale : elle
        // doit dire avec quelle clé, sinon la moitié du stock devient
        // intraçable au premier changement de clé.
        cle_signature_id: cleSignature,
        transaction_id: txEmission.transactionHash,
        qr_code_url: qr.url,
        pdf_url: pdf.url,
        statut: 'actif',
        version: origine.version + 1,
        diplome_precedent_id: diplome_id,
        motif_version: motif,
      },
      client
    );

    for (const [tx, cible] of [
      [txRevocation, diplome_id],
      [txEmission, nouveau.id],
    ]) {
      await txModel.creer(
        {
          diplome_id: cible,
          transaction_hash: tx.transactionHash,
          block_number: tx.blockNumber,
          adresse_contrat: tx.adresseContrat,
          gas_used: tx.gasUsed,
          gas_price: tx.gasPrice,
          statut: tx.statut,
        },
        client
      );
    }

    const valeurs_apres = {
      nom: dossierCorrige.candidat_nom,
      prenom: dossierCorrige.candidat_prenom,
      mention: dossierCorrige.mention,
      filiere: dossierCorrige.filiere,
      type_diplome: dossierCorrige.type_diplome,
      signature_empreinte_cle: empreinteCle(),
    };

    await client.query(
      `INSERT INTO corrections_diplome
         (diplome_origine_id, diplome_remplacant_id, type, motif,
          valeurs_avant, valeurs_apres, demandeur_id, hash_avant, hash_apres,
          transaction_revocation, transaction_emission)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)`,
      [
        diplome_id,
        nouveau.id,
        type,
        motif,
        JSON.stringify(valeurs_avant),
        JSON.stringify(valeurs_apres),
        contexteCourant()?.utilisateur_id || null,
        origine.hash_sha256,
        hash,
        txRevocation.transactionHash,
        txEmission.transactionHash,
      ]
    );

    await journaliser(
      {
        action: ACTIONS.DIPLOME_CORRIGE,
        entite: 'diplomes',
        entite_id: nouveau.id,
        avant: valeurs_avant,
        apres: valeurs_apres,
        transaction_hash: txEmission.transactionHash,
        etablissement_id: origine.etablissement_id,
        message: `${origine.reference} (v${origine.version}) remplacé par ${reference} (v${nouveau.version}) — ${motif}`,
      },
      client
    );

    return { nouveau, valeurs_avant, valeurs_apres };
  });

  await notifications.notifierDiplome(
    notifications.EVENEMENTS.DIPLOME_CORRIGE,
    origine.candidat_id,
    {
      reference: resultat.nouveau.reference,
      ancienne_reference: origine.reference,
      motif,
      entite: 'diplomes',
      entite_id: resultat.nouveau.id,
      etablissement_id: origine.etablissement_id,
    }
  );

  return {
    ancien: { id: diplome_id, reference: origine.reference, version: origine.version },
    nouveau: resultat.nouveau,
    corrections: { avant: resultat.valeurs_avant, apres: resultat.valeurs_apres },
    blockchain: {
      revocation: txRevocation.transactionHash,
      emission: txEmission.transactionHash,
    },
  };
}

/** Chaîne complète des versions, depuis n'importe laquelle. */
export async function historiqueVersions(diplome_id) {
  if (!estUuidValide(diplome_id)) {
    throw new ErreurApp(404, 'DIPLOME_INTROUVABLE', 'Diplôme introuvable.');
  }
  const versions = await diplomeModel.chaineVersions(diplome_id);
  if (versions.length === 0) {
    throw new ErreurApp(404, 'DIPLOME_INTROUVABLE', 'Diplôme introuvable.');
  }

  const { rows: corrections } = await query(
    `SELECT id, diplome_origine_id, diplome_remplacant_id, type, motif,
            valeurs_avant, valeurs_apres, hash_avant, hash_apres, date_correction
       FROM corrections_diplome
      WHERE diplome_origine_id = ANY($1::uuid[])
      ORDER BY date_correction`,
    [versions.map((v) => v.id)]
  );

  return { versions, corrections, version_courante: versions[versions.length - 1] };
}
