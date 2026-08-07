// ─────────────────────────────────────────────────────────────
// Service "pièces d'une demande d'intégration".
//
// Le formulaire porte les DONNÉES, les pièces les PROUVENT. Un
// établissement déclare s'appeler « Université de X » et être agréé ;
// l'acte de création et l'arrêté d'agrément sont ce qui permet au
// ministère de le croire.
//
// Particularité : le déposant n'a AUCUN compte — c'est précisément ce
// qu'il demande. L'autorisation ne peut donc pas venir d'un JWT ; elle
// vient du couple référence + jeton rendu à la création. D'où les mêmes
// précautions que sur les pièces d'un dossier, en plus strict :
// signature binaire vérifiée, taille bornée, formats par type, et rien
// n'atteint le disque avant d'avoir été contrôlé.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cheminPiece, preparerCheminPiece } from '../config/storage.js';
import * as pieceModel from '../models/piece-demande.model.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import { nettoyerTexte, estUuidValide } from '../utils/validators.js';

export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;

/**
 * Familles de formats. L'Excel n'est admis qu'en `.xlsx` : le vieux
 * `.xls` est un conteneur OLE capable d'embarquer des macros, et un
 * agent du ministère ouvrira ce fichier sur son poste.
 */
const FAMILLES = {
  pdf: { 'application/pdf': ['.pdf'] },
  image: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
  tableur: {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  },
};

const SIGNATURES = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  // Un .xlsx est un ZIP : « PK\x03\x04 ».
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) =>
    b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
};

/**
 * Catalogue des pièces du dossier d'agrément.
 *
 * `exigence` a trois valeurs, et la nuance compte : `toujours` bloque le
 * dépôt, `prive` ne le bloque que pour un établissement privé (un
 * établissement public n'a ni registre de commerce ni NIF), `facultative`
 * ne bloque jamais.
 */
export const TYPES_PIECE_DEMANDE = {
  lettre_demande: {
    libelle: "Lettre de demande d'intégration signée",
    aide: 'Adressée au ministère, signée par le représentant légal.',
    exigence: 'toujours',
    familles: ['pdf'],
  },
  acte_creation: {
    libelle: "Acte de création ou autorisation d'exercer",
    aide: 'Décret, arrêté ou autorisation qui fonde juridiquement l’établissement.',
    exigence: 'toujours',
    familles: ['pdf'],
  },
  agrement: {
    libelle: 'Agrément ou accréditation',
    aide: 'L’acte par lequel l’État reconnaît les formations dispensées.',
    exigence: 'toujours',
    familles: ['pdf'],
  },
  registre_commerce: {
    libelle: 'Registre de commerce ou équivalent',
    aide: 'Établissements privés uniquement.',
    exigence: 'prive',
    familles: ['pdf'],
  },
  attestation_fiscale: {
    libelle: "Attestation d'identification fiscale",
    aide: 'Établissements privés uniquement.',
    exigence: 'prive',
    familles: ['pdf'],
  },
  presentation: {
    libelle: "Présentation de l'établissement",
    aide: 'Historique, effectifs, implantations, organisation.',
    exigence: 'toujours',
    familles: ['pdf'],
  },
  liste_formations: {
    libelle: 'Liste des formations et certifications délivrées',
    aide: 'PDF ou tableur (.xlsx).',
    exigence: 'toujours',
    familles: ['pdf', 'tableur'],
  },
  piece_identite_representant: {
    libelle: "Pièce d'identité du représentant légal",
    aide: 'PDF ou photographie lisible.',
    exigence: 'toujours',
    familles: ['pdf', 'image'],
  },
  logo: {
    libelle: "Logo de l'établissement",
    aide: 'PNG ou JPEG. Servira sur les attestations.',
    exigence: 'facultative',
    familles: ['image'],
  },
  autre: {
    libelle: 'Autre document',
    aide: 'Toute pièce complémentaire utile à l’instruction.',
    exigence: 'facultative',
    familles: ['pdf', 'image', 'tableur'],
  },
};

/** Codes exigés compte tenu du statut juridique déclaré. */
export function typesRequis(statut_juridique) {
  return Object.entries(TYPES_PIECE_DEMANDE)
    .filter(
      ([, t]) => t.exigence === 'toujours' || (t.exigence === 'prive' && statut_juridique === 'prive')
    )
    .map(([code]) => code);
}

/** Catalogue exposé au formulaire public — libellés, exigences, formats. */
export function catalogue() {
  return Object.entries(TYPES_PIECE_DEMANDE).map(([code, t]) => ({
    code,
    libelle: t.libelle,
    aide: t.aide,
    exigence: t.exigence,
    extensions: [...new Set(t.familles.flatMap((f) => Object.values(FAMILLES[f]).flat()))],
  }));
}

function assainirNom(nom) {
  const base = path.basename(String(nom || '')).replace(/[^\w.\- ]+/g, '_').trim();
  return base.slice(0, 200) || 'document';
}

/** Contrôle complet du fichier AVANT toute écriture disque. */
function validerFichier(fichier, type) {
  if (!fichier || !fichier.buffer?.length) {
    throw new ErreurApp(400, 'FICHIER_REQUIS', 'Aucun fichier reçu.');
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    throw new ErreurApp(
      413,
      'FICHIER_TROP_VOLUMINEUX',
      `Fichier limité à ${TAILLE_MAX_OCTETS / (1024 * 1024)} Mo.`
    );
  }

  const nom = assainirNom(fichier.originalname);
  const extension = path.extname(nom).toLowerCase();
  const mime = String(fichier.mimetype || '').toLowerCase();

  // Les formats dépendent du type de pièce : un logo n'est pas un PDF,
  // et une lettre signée n'est pas une capture d'écran.
  const acceptes = Object.assign({}, ...type.familles.map((f) => FAMILLES[f]));
  if (!acceptes[mime] || !acceptes[mime].includes(extension)) {
    const libelles = [...new Set(Object.values(acceptes).flat())].join(', ');
    throw new ErreurApp(
      415,
      'FORMAT_NON_SUPPORTE',
      `« ${type.libelle} » accepte : ${libelles}. Le type du fichier doit correspondre à son extension.`
    );
  }
  if (!SIGNATURES[mime](fichier.buffer)) {
    throw new ErreurApp(
      415,
      'CONTENU_INCOHERENT',
      "Le contenu du fichier ne correspond pas à son format annoncé."
    );
  }

  return { nom, mime };
}

/** Dépose une pièce sur une demande. La demande a déjà été authentifiée. */
export async function deposer(demande, donnees, fichier) {
  const code = nettoyerTexte(donnees.type_piece);
  const type = code && TYPES_PIECE_DEMANDE[code];
  if (!type) {
    throw new ErreurApp(
      400,
      'TYPE_PIECE_INCONNU',
      `Type de pièce inconnu. Valeurs : ${Object.keys(TYPES_PIECE_DEMANDE).join(', ')}.`
    );
  }
  if (demande.statut !== 'brouillon') {
    throw new ErreurApp(
      409,
      'DEMANDE_DEJA_DEPOSEE',
      'Cette demande a déjà été transmise au ministère : ses pièces ne peuvent plus être modifiées.'
    );
  }

  const { nom, mime } = validerFichier(fichier, type);
  const empreinte = crypto.createHash('sha256').update(fichier.buffer).digest('hex');
  const relatif = path.join(
    'demandes',
    demande.reference,
    `${code}-${empreinte.slice(0, 12)}${path.extname(nom).toLowerCase()}`
  );

  // Redéposer un acte REMPLACE le précédent : il n'existe pas deux
  // versions valides d'un arrêté d'agrément. Sans cela, l'index unique
  // renverrait un conflit là où l'intention est une correction.
  if (code !== 'autre') {
    const existantes = await pieceModel.listerParDemande(demande.id);
    for (const p of existantes.filter((x) => x.type_piece === code)) {
      await fs.rm(cheminPiece(p.chemin), { force: true }).catch(() => {});
      await pieceModel.supprimer(p.id);
    }
  }

  let absolu;
  try {
    absolu = preparerCheminPiece(relatif);
    await fs.writeFile(absolu, fichier.buffer);
  } catch (err) {
    throw new ErreurApp(
      503,
      'STOCKAGE_INDISPONIBLE',
      `Le document n'a pas pu être enregistré (${err.code || 'erreur disque'}). Réessayez.`
    );
  }

  try {
    return await avecErreursSql(() =>
      pieceModel.creer({
        demande_id: demande.id,
        type_piece: code,
        libelle: nettoyerTexte(donnees.libelle),
        nom_fichier: nom,
        chemin: relatif,
        type_mime: mime,
        taille_octets: fichier.size,
        empreinte,
      })
    );
  } catch (err) {
    await fs.rm(absolu, { force: true }).catch(() => {});
    throw err;
  }
}

export async function lister(demande_id) {
  return pieceModel.listerParDemande(demande_id);
}

/** Ce qui manque encore pour que la demande puisse être transmise. */
export async function manquants(demande) {
  const presents = new Set(await pieceModel.typesDeposes(demande.id));
  return typesRequis(demande.statut_juridique)
    .filter((code) => !presents.has(code))
    .map((code) => ({ code, libelle: TYPES_PIECE_DEMANDE[code].libelle }));
}

export async function supprimer(demande, piece_id) {
  if (!estUuidValide(piece_id)) {
    throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');
  }
  if (demande.statut !== 'brouillon') {
    throw new ErreurApp(
      409,
      'DEMANDE_DEJA_DEPOSEE',
      'Cette demande a déjà été transmise : ses pièces ne peuvent plus être retirées.'
    );
  }

  const piece = await pieceModel.trouverParId(piece_id);
  if (!piece || piece.demande_id !== demande.id) {
    throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');
  }

  await pieceModel.supprimer(piece_id);
  await fs.rm(cheminPiece(piece.chemin), { force: true }).catch(() => {});
  return { supprime: true };
}

/**
 * Sert le contenu d'une pièce — réservé au ministère, qui instruit.
 * L'empreinte est recontrôlée : un acte d'agrément substitué sur le
 * disque doit se voir, pas se lire.
 */
export async function contenu(piece_id) {
  if (!estUuidValide(piece_id)) {
    throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');
  }
  const piece = await pieceModel.trouverParId(piece_id);
  if (!piece) throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');

  let donnees;
  try {
    donnees = await fs.readFile(cheminPiece(piece.chemin));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ErreurApp(
        410,
        'FICHIER_ABSENT',
        "Le document n'est plus présent sur le serveur. Demandez à l'établissement de le redéposer."
      );
    }
    throw new ErreurApp(503, 'STOCKAGE_INDISPONIBLE', 'Le document n\'a pas pu être lu.');
  }

  const empreinte = crypto.createHash('sha256').update(donnees).digest('hex');
  if (empreinte !== piece.empreinte) {
    throw new ErreurApp(
      409,
      'PIECE_ALTEREE',
      'Le document ne correspond plus à son empreinte de dépôt : il a été modifié sur le serveur.'
    );
  }

  return { donnees, nom_fichier: piece.nom_fichier, type_mime: piece.type_mime };
}
