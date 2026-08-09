// ─────────────────────────────────────────────────────────────
// Service "pièces justificatives".
//
// Une certification s'appuie sur des ACTES : relevés de notes, procès-
// verbal de délibération, rapport de stage. Sans eux, le ministère
// n'instruit pas, il enregistre ce que l'établissement affirme.
//
// Trois règles gouvernent ce fichier :
//
//   1. Ce qui est déposé est figé. Une pièce transmise n'est plus
//      modifiable par son émetteur — sinon le document instruit et le
//      document archivé pourraient différer.
//   2. Ce qui est servi est vérifié. L'empreinte est recalculée à chaque
//      lecture : une substitution sur le disque est détectée, pas subie.
//   3. Aucune défaillance de stockage ne remonte en erreur serveur. Un
//      disque plein, un fichier disparu, un type refusé : chacun a son
//      code métier et son message actionnable.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cheminPiece, preparerCheminPiece } from '../config/storage.js';
import * as pieceModel from '../models/piece-jointe.model.js';
import * as candidatModel from '../models/candidat.model.js';
import * as promotionModel from '../models/promotion.model.js';
import { journaliser, ACTIONS } from './audit.service.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import { nettoyerTexte, estUuidValide } from '../utils/validators.js';

/**
 * Catalogue des pièces. `portee` dit à quoi la pièce se rattache, et
 * `requise` si son absence empêche la transmission puis la validation.
 *
 * Le procès-verbal est COLLECTIF : c'est l'acte de la délibération, il
 * vaut pour la promotion entière. Le faire déposer une fois par étudiant
 * produirait 250 copies d'un même document, donc 250 occasions de
 * divergence.
 *
 * TOUTES les pièces individuelles sont obligatoires : un dossier de fin
 * de cycle se juge sur l'ensemble de ses actes — résultats, travail
 * soutenu, état civil — et non sur le seul relevé de notes. Le dossier
 * est complet ou il ne l'est pas.
 *
 * Conséquence assumée : une filière sans mémoire ni stage ne peut pas
 * transmettre tant que ces cases restent vides. Si le cas se présente,
 * la sortie n'est pas de rendre la pièce facultative pour tout le monde
 * — ce serait la rendre inexigible partout — mais de rattacher la liste
 * des pièces requises à la FILIÈRE, qui est le seul niveau où la
 * question a une réponse juste.
 *
 * `autre` n'est jamais requis : c'est le fourre-tout, il n'a pas de case
 * dans la grille et ne peut donc pas être réclamé.
 */
export const TYPES_PIECE = {
  releve_notes: {
    libelle: 'Relevé de notes',
    portee: 'candidat',
    requise: true,
    aide: 'Relevé de la dernière année, signé par la scolarité.',
  },
  rapport_stage: {
    libelle: 'Rapport de stage',
    portee: 'candidat',
    requise: true,
    aide: 'Rapport du stage de fin de cycle, visé par le maître de stage.',
  },
  // La page de garde porte le titre du mémoire, le directeur et la date de
  // soutenance, signés par le jury : c'est elle qu'on relit, pas les 80 pages.
  page_garde_memoire: {
    libelle: 'Page de garde du mémoire',
    portee: 'candidat',
    requise: true,
    aide: 'Page signée par le jury : titre, directeur de mémoire, date de soutenance.',
  },
  memoire: {
    libelle: 'Mémoire de fin de cycle',
    portee: 'candidat',
    requise: true,
    aide: 'Le document complet, tel que soutenu devant le jury.',
  },
  acte_naissance: {
    libelle: 'Acte de naissance',
    portee: 'candidat',
    requise: true,
    aide: "Établit l'état civil qui figurera sur le diplôme.",
  },
  piece_identite: {
    libelle: "Pièce d'identité",
    portee: 'candidat',
    requise: true,
    aide: "Carte nationale d'identité ou passeport en cours de validité.",
  },
  attestation: {
    libelle: 'Attestation',
    portee: 'candidat',
    requise: true,
    aide: 'Attestation nominative complétant le dossier.',
  },
  proces_verbal: {
    libelle: 'Procès-verbal de délibération',
    portee: 'promotion',
    requise: true,
    aide: 'Acte du jury pour la promotion entière : sans lui, rien ne prouve la délibération.',
  },
  arrete_jury: {
    libelle: 'Arrêté de jury',
    portee: 'promotion',
    requise: false,
    aide: 'Acte de nomination du jury, quand il existe.',
  },
  autre: {
    libelle: 'Autre document',
    portee: 'candidat',
    requise: false,
    aide: 'Hors nomenclature : à nommer explicitement.',
  },
};

export const TYPES_REQUIS_CANDIDAT = Object.entries(TYPES_PIECE)
  .filter(([, t]) => t.portee === 'candidat' && t.requise)
  .map(([code]) => code);

export const TYPES_REQUIS_PROMOTION = Object.entries(TYPES_PIECE)
  .filter(([, t]) => t.portee === 'promotion' && t.requise)
  .map(([code]) => code);

/**
 * Formats acceptés. Volontairement restreint : un acte administratif se
 * lit sans logiciel particulier et ne doit pas pouvoir exécuter de code.
 * Les formats bureautiques sont exclus — ils embarquent des macros.
 */
const FORMATS = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;

/** Signatures binaires : le type déclaré par le navigateur ne prouve rien. */
const SIGNATURES = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

/** Le chemin sur le disque ne regarde pas le client : il n'en sort jamais. */
function formater(piece) {
  if (!piece) return piece;
  const { chemin, ...visible } = piece;
  return {
    ...visible,
    type_libelle: TYPES_PIECE[piece.type_piece]?.libelle || piece.type_piece,
  };
}

function exigerUuid(id, message) {
  if (!estUuidValide(id)) throw new ErreurApp(404, 'PIECE_INTROUVABLE', message);
  return id;
}

/** Nom de fichier sûr : ni chemin, ni caractère exotique, ni nom vide. */
function assainirNom(nom) {
  const base = path.basename(String(nom || '')).replace(/[^\w.\- ]+/g, '_').trim();
  return base.slice(0, 200) || 'document';
}

// ── Dépôt ──────────────────────────────────────────────────────────

/**
 * Contrôle le fichier reçu avant toute écriture : type déclaré, extension,
 * signature binaire, taille. Un fichier refusé ne touche jamais le disque.
 */
function validerFichier(fichier) {
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
  const type = String(fichier.mimetype || '').toLowerCase();

  if (!FORMATS[type] || !FORMATS[type].includes(extension)) {
    throw new ErreurApp(
      415,
      'FORMAT_NON_SUPPORTE',
      'Formats acceptés : PDF, JPEG, PNG. Le type du fichier doit correspondre à son extension.'
    );
  }

  // Le navigateur annonce ce qu'il veut : c'est le contenu qui tranche.
  // Sans ce contrôle, un exécutable renommé « releve.pdf » serait stocké
  // puis re-servi tel quel à l'agent du ministère.
  if (!SIGNATURES[type](fichier.buffer)) {
    throw new ErreurApp(
      415,
      'CONTENU_INCOHERENT',
      "Le contenu du fichier ne correspond pas à son format annoncé."
    );
  }

  return { nom, type };
}

function validerType(type_piece, portee) {
  const code = nettoyerTexte(type_piece);
  const type = code && TYPES_PIECE[code];
  if (!type) {
    throw new ErreurApp(
      400,
      'TYPE_PIECE_INCONNU',
      `Type de pièce inconnu. Valeurs : ${Object.keys(TYPES_PIECE).join(', ')}.`
    );
  }
  // « autre » est le fourre-tout assumé : il s'attache où on le dépose.
  if (code !== 'autre' && type.portee !== portee) {
    throw new ErreurApp(
      400,
      'PORTEE_INCOHERENTE',
      type.portee === 'promotion'
        ? `« ${type.libelle} » est un acte collectif : déposez-le sur la promotion, pas sur un étudiant.`
        : `« ${type.libelle} » se dépose sur un étudiant, pas sur la promotion.`
    );
  }
  return code;
}

/** Écrit le fichier puis enregistre la ligne. En cas d'échec, rien ne subsiste. */
async function enregistrer(fichier, meta) {
  const empreinte = crypto.createHash('sha256').update(fichier.buffer).digest('hex');
  const relatif = path.join(
    'pieces',
    meta.etablissement_id,
    `${empreinte.slice(0, 16)}${path.extname(meta.nom_fichier).toLowerCase()}`
  );

  let absolu;
  try {
    absolu = preparerCheminPiece(relatif);
    await fs.writeFile(absolu, fichier.buffer);
  } catch (err) {
    // Disque plein, droits insuffisants, chemin invalide : l'agent doit
    // savoir que sa pièce n'est pas partie, pas recevoir « erreur serveur ».
    throw new ErreurApp(
      503,
      'STOCKAGE_INDISPONIBLE',
      `Le document n'a pas pu être enregistré (${err.code || 'erreur disque'}). Réessayez ; si le problème persiste, prévenez l'administrateur.`
    );
  }

  try {
    return await avecErreursSql(
      () => pieceModel.creer({ ...meta, chemin: relatif, empreinte, taille_octets: fichier.size }),
      {
        // Sans ce libellé, un double dépôt ressortirait en « conflit
        // d'unicité » : exact, et parfaitement inexploitable pour l'agent.
        idx_piece_unique_candidat: [
          409,
          'PIECE_DEJA_DEPOSEE',
          'Ce document a déjà été déposé pour cet étudiant. Retirez la version précédente ou renommez le fichier.',
        ],
      }
    );
  } catch (err) {
    // La ligne n'existe pas : le fichier orphelin ne doit pas rester.
    await fs.rm(absolu, { force: true }).catch(() => {});
    throw err;
  }
}

/** Dépôt d'une pièce individuelle, rattachée à un étudiant. */
export async function deposerPourCandidat(candidat_id, utilisateur, donnees, fichier) {
  exigerUuid(candidat_id, 'Étudiant introuvable.');

  const candidat = await candidatModel.trouverParId(candidat_id);
  if (!candidat || candidat.etablissement_id !== utilisateur.etablissement_id) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  }

  const type_piece = validerType(donnees.type_piece, 'candidat');
  const { nom, type } = validerFichier(fichier);

  const piece = await enregistrer(fichier, {
    candidat_id,
    etablissement_id: utilisateur.etablissement_id,
    type_piece,
    libelle: nettoyerTexte(donnees.libelle),
    nom_fichier: nom,
    type_mime: type,
    deposee_par_id: utilisateur.utilisateur_id,
  });

  await journaliser({
    action: ACTIONS.PIECE_DEPOSEE,
    entite: 'pieces_jointes',
    entite_id: piece.id,
    utilisateur_id: utilisateur.utilisateur_id,
    role: utilisateur.role,
    etablissement_id: utilisateur.etablissement_id,
    apres: { type_piece, nom_fichier: nom, candidat_id },
    message: `Pièce « ${TYPES_PIECE[type_piece].libelle} » déposée pour ${candidat.nom} ${candidat.prenom}.`,
  });

  return formater(piece);
}

/** Dépôt d'une pièce collective, rattachée à la promotion. */
export async function deposerPourPromotion(promotion_id, utilisateur, donnees, fichier) {
  exigerUuid(promotion_id, 'Promotion introuvable.');

  const promotion = await promotionModel.trouverParId(promotion_id);
  if (!promotion || promotion.etablissement_id !== utilisateur.etablissement_id) {
    throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  }

  const type_piece = validerType(donnees.type_piece, 'promotion');
  const { nom, type } = validerFichier(fichier);

  const piece = await enregistrer(fichier, {
    promotion_id,
    etablissement_id: utilisateur.etablissement_id,
    type_piece,
    libelle: nettoyerTexte(donnees.libelle),
    nom_fichier: nom,
    type_mime: type,
    deposee_par_id: utilisateur.utilisateur_id,
  });

  await journaliser({
    action: ACTIONS.PIECE_DEPOSEE,
    entite: 'pieces_jointes',
    entite_id: piece.id,
    utilisateur_id: utilisateur.utilisateur_id,
    role: utilisateur.role,
    etablissement_id: utilisateur.etablissement_id,
    apres: { type_piece, nom_fichier: nom, promotion_id },
    message: `Pièce « ${TYPES_PIECE[type_piece].libelle} » déposée pour la promotion ${promotion.libelle}.`,
  });

  return formater(piece);
}

// ── Consultation ───────────────────────────────────────────────────

export async function listerPourCandidat(candidat_id, utilisateur) {
  exigerUuid(candidat_id, 'Étudiant introuvable.');

  const candidat = await candidatModel.trouverParId(candidat_id);
  if (!candidat) throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  if (
    utilisateur.role === 'etablissement' &&
    candidat.etablissement_id !== utilisateur.etablissement_id
  ) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  }

  return (await pieceModel.listerParCandidat(candidat_id)).map(formater);
}

export async function listerPourPromotion(promotion_id, utilisateur) {
  exigerUuid(promotion_id, 'Promotion introuvable.');

  const promotion = await promotionModel.trouverParId(promotion_id);
  if (!promotion) throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  if (
    utilisateur.role === 'etablissement' &&
    promotion.etablissement_id !== utilisateur.etablissement_id
  ) {
    throw new ErreurApp(404, 'PROMOTION_INTROUVABLE', 'Promotion introuvable.');
  }

  return (await pieceModel.listerParPromotion(promotion_id)).map(formater);
}

// ── Grille de dépôt ────────────────────────────────────────────────

/**
 * La liste des pièces déposées ne dit pas ce qui MANQUE : elle ne montre
 * que ce qui est là. Un agent qui a déposé trois documents sur quatre
 * voit trois lignes vertes et rien qui l'avertisse.
 *
 * La grille inverse la lecture : une case par nature attendue, remplie
 * ou vide, obligatoire ou facultative. Ce qu'il reste à faire devient
 * visible sans que personne ait à connaître la nomenclature par cœur.
 *
 * @returns {{ cases, complementaires, manquantes, complet }}
 */
function construireGrille(portee, pieces) {
  const formatees = pieces.map(formater);

  const cases = Object.entries(TYPES_PIECE)
    .filter(([code, t]) => t.portee === portee && code !== 'autre')
    // Les obligatoires d'abord : l'ordre de la grille est l'ordre du travail.
    .sort(([, a], [, b]) => Number(b.requise) - Number(a.requise))
    .map(([code, t]) => {
      const deposees = formatees.filter((p) => p.type_piece === code);
      // Une pièce rejetée ne remplit pas sa case : elle laisse la case
      // vide ET explique pourquoi, ce qui n'est pas la même chose qu'un
      // simple manque.
      const retenue = deposees.find((p) => p.statut !== 'rejetee') || null;
      const rejetee = deposees.find((p) => p.statut === 'rejetee') || null;

      return {
        type_piece: code,
        libelle: t.libelle,
        aide: t.aide,
        requise: t.requise,
        remplie: Boolean(retenue),
        piece: retenue,
        rejetee,
        versions: deposees.length,
      };
    });

  // « Autre document » n'a pas de case : c'est le fourre-tout assumé, il
  // s'ajoute au dossier sans jamais être attendu.
  const complementaires = formatees.filter((p) => p.type_piece === 'autre');
  const manquantes = cases.filter((c) => c.requise && !c.remplie);

  return {
    cases,
    complementaires,
    manquantes: manquantes.map((c) => ({ type_piece: c.type_piece, libelle: c.libelle })),
    complet: manquantes.length === 0,
  };
}

/** Grille de dépôt d'un étudiant. */
export async function grilleCandidat(candidat_id, utilisateur) {
  const pieces = await listerPourCandidat(candidat_id, utilisateur);
  // `listerPourCandidat` a déjà formaté ; la grille reformate sans
  // dommage — `formater` est idempotent sur une pièce sans `chemin`.
  return construireGrille('candidat', pieces);
}

/** Grille de dépôt d'une promotion — les actes collectifs. */
export async function grillePromotion(promotion_id, utilisateur) {
  const pieces = await listerPourPromotion(promotion_id, utilisateur);
  return construireGrille('promotion', pieces);
}

/**
 * Ce qui manque, du point de vue des pièces, pour que la promotion parte
 * au ministère.
 *
 * Ce contrôle existait déjà — mais à la RÉCEPTION, chez le ministère, où
 * il produisait un rejet. Un rejet, c'est un aller-retour de plusieurs
 * jours pour un document que l'établissement avait sous la main. Le
 * même contrôle, joué avant l'envoi, ne coûte que le temps de le déposer.
 *
 * @param {string} promotion_id
 * @param {Array<{candidat_id: string, nom: string, prenom: string, numero_etudiant: string}>} etudiants
 */
export async function controlerAvantTransmission(promotion_id, etudiants) {
  const [collectives, typesAcquis] = await Promise.all([
    pieceModel.listerParPromotion(promotion_id),
    pieceModel.typesAcquisParCandidats(etudiants.map((e) => e.candidat_id)),
  ]);

  const acquisesCollectives = new Set(
    collectives.filter((p) => p.statut !== 'rejetee').map((p) => p.type_piece)
  );
  const manquantsCollectifs = TYPES_REQUIS_PROMOTION.filter(
    (t) => !acquisesCollectives.has(t)
  ).map((t) => TYPES_PIECE[t].libelle);

  const incomplets = [];
  for (const etudiant of etudiants) {
    const presents = new Set(typesAcquis.get(etudiant.candidat_id) || []);
    const manquants = TYPES_REQUIS_CANDIDAT.filter((t) => !presents.has(t)).map(
      (t) => TYPES_PIECE[t].libelle
    );
    if (manquants.length > 0) {
      incomplets.push({
        candidat_id: etudiant.candidat_id,
        nom: etudiant.nom,
        prenom: etudiant.prenom,
        numero_etudiant: etudiant.numero_etudiant,
        manquants,
      });
    }
  }

  return {
    complet: incomplets.length === 0 && manquantsCollectifs.length === 0,
    incomplets,
    manquantsCollectifs,
  };
}

/** Dossier de pièces d'un lot, groupé pour l'instruction ministérielle. */
export async function listerPourLot(lot_id) {
  exigerUuid(lot_id, 'Lot introuvable.');
  const pieces = await pieceModel.listerParLot(lot_id);
  const compteurs = await pieceModel.compterParStatutPourLot(lot_id);

  return {
    collectives: pieces.filter((p) => !p.candidat_id).map(formater),
    individuelles: pieces.filter((p) => p.candidat_id).map(formater),
    compteurs: {
      deposee: compteurs.deposee || 0,
      vue: compteurs.vue || 0,
      validee: compteurs.validee || 0,
      rejetee: compteurs.rejetee || 0,
    },
  };
}

/**
 * Dossier de pièces d'UN dossier, même forme que pour un lot.
 *
 * La voie normale reste le lot ; celle-ci sert quand l'agent part d'un
 * dossier isolé — une régularisation, une contestation — et doit tout de
 * même voir sur quels actes il s'apprête à statuer.
 */
export async function listerPourDossier(dossier_id) {
  exigerUuid(dossier_id, 'Dossier introuvable.');
  const pieces = (await pieceModel.listerParDossier(dossier_id)).map(formater);
  const compteurs = pieces.reduce((acc, p) => ({ ...acc, [p.statut]: (acc[p.statut] || 0) + 1 }), {});

  return {
    collectives: pieces.filter((p) => !p.candidat_id),
    individuelles: pieces.filter((p) => p.candidat_id),
    compteurs: {
      deposee: compteurs.deposee || 0,
      vue: compteurs.vue || 0,
      validee: compteurs.validee || 0,
      rejetee: compteurs.rejetee || 0,
    },
  };
}

/** Vérifie qu'un utilisateur a le droit d'ouvrir cette pièce. */
function exigerAcces(piece, utilisateur) {
  if (utilisateur.role === 'ministere' || utilisateur.role === 'admin_systeme') return;
  if (
    utilisateur.role === 'etablissement' &&
    piece.etablissement_id === utilisateur.etablissement_id
  ) {
    return;
  }
  // 404 et non 403 : confirmer l'existence d'une pièce à qui n'y a pas
  // droit est déjà une fuite d'information.
  throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');
}

/**
 * Prépare le service du fichier : contrôle d'accès, existence, intégrité.
 * Le ministère qui ouvre une pièce la fait passer de « déposée » à « vue ».
 */
export async function contenu(piece_id, utilisateur) {
  exigerUuid(piece_id, 'Pièce introuvable.');

  const piece = await pieceModel.trouverParId(piece_id);
  if (!piece) throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');
  exigerAcces(piece, utilisateur);

  let absolu;
  let donnees;
  try {
    absolu = cheminPiece(piece.chemin);
    donnees = await fs.readFile(absolu);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // La ligne existe, le fichier non : le dire franchement vaut mieux
      // qu'un téléchargement vide que personne ne sait interpréter.
      throw new ErreurApp(
        410,
        'FICHIER_ABSENT',
        'Le document n\'est plus présent sur le serveur. Demandez à l\'établissement de le redéposer.'
      );
    }
    throw new ErreurApp(
      503,
      'STOCKAGE_INDISPONIBLE',
      `Le document n'a pas pu être lu (${err.code || 'erreur disque'}).`
    );
  }

  const empreinte = crypto.createHash('sha256').update(donnees).digest('hex');
  if (empreinte !== piece.empreinte) {
    throw new ErreurApp(
      409,
      'PIECE_ALTEREE',
      'Le document ne correspond plus à son empreinte de dépôt : il a été modifié sur le serveur. Signalez-le à l\'administrateur.'
    );
  }

  if (utilisateur.role === 'ministere' && piece.statut === 'deposee') {
    // Une consultation n'est pas une décision : la pièce devient « vue »,
    // pas « validée ». La distinction est ce qui rend l'instruction
    // vérifiable après coup.
    const vue = await pieceModel.marquerVue(piece_id, utilisateur.utilisateur_id);
    if (vue) {
      await journaliser({
        action: ACTIONS.PIECE_CONSULTEE,
        entite: 'pieces_jointes',
        entite_id: piece_id,
        utilisateur_id: utilisateur.utilisateur_id,
        role: utilisateur.role,
        message: `Pièce « ${TYPES_PIECE[piece.type_piece]?.libelle || piece.type_piece} » consultée.`,
      });
    }
  }

  return { donnees, nom_fichier: piece.nom_fichier, type_mime: piece.type_mime };
}

// ── Décision du ministère ──────────────────────────────────────────

const DECISIONS = { validee: ACTIONS.PIECE_VALIDEE, rejetee: ACTIONS.PIECE_REJETEE };

export async function decider(piece_id, utilisateur, { statut, motif } = {}) {
  exigerUuid(piece_id, 'Pièce introuvable.');

  if (!DECISIONS[statut]) {
    throw new ErreurApp(400, 'DECISION_INCONNUE', 'Décision attendue : validee ou rejetee.');
  }
  const motif_rejet = nettoyerTexte(motif);
  if (statut === 'rejetee' && !motif_rejet) {
    throw new ErreurApp(
      400,
      'MOTIF_REQUIS',
      'Un rejet doit dire ce qui manque : l\'établissement ne peut pas corriger à l\'aveugle.'
    );
  }

  const piece = await pieceModel.trouverParId(piece_id);
  if (!piece) throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');

  const decidee = await avecErreursSql(() =>
    pieceModel.decider(piece_id, {
      statut,
      motif_rejet: statut === 'rejetee' ? motif_rejet : null,
      agent_ministere_id: utilisateur.utilisateur_id,
    })
  );

  await journaliser({
    action: DECISIONS[statut],
    entite: 'pieces_jointes',
    entite_id: piece_id,
    utilisateur_id: utilisateur.utilisateur_id,
    role: utilisateur.role,
    avant: { statut: piece.statut },
    apres: { statut, motif_rejet: motif_rejet || null },
    message: `Pièce « ${TYPES_PIECE[piece.type_piece]?.libelle || piece.type_piece} » ${statut === 'validee' ? 'validée' : `rejetée : ${motif_rejet}`}.`,
  });

  return formater(decidee);
}

// ── Retrait ────────────────────────────────────────────────────────

export async function supprimer(piece_id, utilisateur) {
  exigerUuid(piece_id, 'Pièce introuvable.');

  const piece = await pieceModel.trouverParId(piece_id);
  if (!piece) throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');
  if (piece.etablissement_id !== utilisateur.etablissement_id) {
    throw new ErreurApp(404, 'PIECE_INTROUVABLE', 'Pièce introuvable.');
  }
  // Une pièce déjà instruite fait partie du dossier d'instruction : la
  // retirer effacerait la trace de ce que le ministère a examiné.
  if (piece.statut !== 'deposee') {
    throw new ErreurApp(
      409,
      'PIECE_INSTRUITE',
      'Cette pièce a déjà été examinée par le ministère : elle ne peut plus être retirée. Déposez une nouvelle version.'
    );
  }

  await pieceModel.supprimer(piece_id);
  // Le fichier peut avoir déjà disparu : ce n'est pas une raison de faire
  // échouer une suppression qui, en base, a réussi.
  await fs.rm(cheminPiece(piece.chemin), { force: true }).catch(() => {});

  await journaliser({
    action: ACTIONS.PIECE_SUPPRIMEE,
    entite: 'pieces_jointes',
    entite_id: piece_id,
    utilisateur_id: utilisateur.utilisateur_id,
    role: utilisateur.role,
    etablissement_id: utilisateur.etablissement_id,
    avant: { type_piece: piece.type_piece, nom_fichier: piece.nom_fichier },
    message: `Pièce « ${TYPES_PIECE[piece.type_piece]?.libelle || piece.type_piece} » retirée.`,
  });

  return { supprimee: true };
}

// ── Contrôle à l'instruction ───────────────────────────────────────

/**
 * Ce qui, du point de vue des pièces, empêche de statuer sur CHAQUE
 * dossier — et séparément sur le lot entier.
 *
 * `controlerLot` répond « ce lot est-il validable ? ». C'est une
 * question de tout ou rien : tant qu'une seule pièce sur 250 dossiers
 * n'a pas été ouverte, la réponse est non, et l'agent doit tout traiter
 * d'une traite avant de pouvoir valider quoi que ce soit. Une promotion
 * de 12 000 diplômés ne s'instruit pas en une séance.
 *
 * Cette fonction découpe le verdict : l'obstacle est imputé au dossier
 * qu'il concerne. Un dossier dont les pièces sont examinées peut être
 * validé aujourd'hui, les autres attendront demain.
 *
 * Les actes COLLECTIFS restent hors découpage : le procès-verbal fonde
 * la délibération entière, il bloque tout tant qu'il manque. Mais c'est
 * un ou deux documents, pas 250 — les examiner d'abord est tenable.
 *
 * @returns {{ collectifs: string[], parDossier: Map<string, string[]> }}
 */
export async function obstaclesParDossier(lot, dossiers) {
  const toutes = await pieceModel.listerParLot(lot.id);

  const collectives = toutes.filter((p) => !p.candidat_id);
  const parCandidat = new Map();
  for (const piece of toutes) {
    if (!piece.candidat_id) continue;
    if (!parCandidat.has(piece.candidat_id)) parCandidat.set(piece.candidat_id, []);
    parCandidat.get(piece.candidat_id).push(piece);
  }

  const collectifs = [];
  const acquisesCollectives = new Set(
    collectives.filter((p) => p.statut !== 'rejetee').map((p) => p.type_piece)
  );
  for (const type of TYPES_REQUIS_PROMOTION) {
    if (!acquisesCollectives.has(type)) {
      collectifs.push(`acte collectif absent ou rejeté : ${TYPES_PIECE[type].libelle.toLowerCase()}`);
    }
  }
  const collectivesNonOuvertes = collectives.filter((p) => p.statut === 'deposee').length;
  if (collectivesNonOuvertes > 0) {
    collectifs.push(
      `${collectivesNonOuvertes} acte(s) collectif(s) pas encore ouvert(s) : ils fondent toute la promotion.`
    );
  }

  const parDossier = new Map();
  for (const dossier of dossiers) {
    const siennes = parCandidat.get(dossier.candidat_id) || [];
    const valables = new Set(siennes.filter((p) => p.statut !== 'rejetee').map((p) => p.type_piece));
    const rejetees = siennes.filter((p) => p.statut === 'rejetee');
    const obstacles = [];

    for (const type of TYPES_REQUIS_CANDIDAT) {
      if (valables.has(type)) continue;
      const libelle = TYPES_PIECE[type].libelle.toLowerCase();
      obstacles.push(
        rejetees.some((p) => p.type_piece === type)
          ? `pièce obligatoire rejetée et non remplacée : ${libelle}`
          : `pièce obligatoire manquante : ${libelle}`
      );
    }

    // Une pièce facultative rejetée n'invalide pas le dossier mais mérite
    // d'être dite : l'agent doit savoir sur quoi il statue.
    const rejetsFacultatifs = rejetees.filter((p) => !TYPES_REQUIS_CANDIDAT.includes(p.type_piece));
    if (rejetsFacultatifs.length > 0) {
      obstacles.push(`${rejetsFacultatifs.length} pièce(s) complémentaire(s) rejetée(s)`);
    }

    const nonOuvertes = siennes.filter((p) => p.statut === 'deposee').length;
    if (nonOuvertes > 0) {
      obstacles.push(`${nonOuvertes} pièce(s) de ce dossier n'ont pas encore été ouvertes`);
    }

    if (obstacles.length > 0) parDossier.set(dossier.id, obstacles);
  }

  return { collectifs, parDossier };
}

/**
 * Ce qui manque ou bloque, du point de vue des pièces, pour valider un lot.
 *
 * @returns {{ manquantsParDossier: Map, manquantsCollectifs: string[],
 *             rejetees: number, nonExaminees: number }}
 */
export async function controlerLot(lot, dossiers) {
  const [collectives, typesParCandidat, compteurs] = await Promise.all([
    pieceModel.listerParPromotion(lot.promotion_id),
    pieceModel.typesParCandidatPourLot(lot.id),
    pieceModel.compterParStatutPourLot(lot.id),
  ]);

  const collectivesValides = new Set(
    collectives.filter((p) => p.statut !== 'rejetee').map((p) => p.type_piece)
  );
  const manquantsCollectifs = TYPES_REQUIS_PROMOTION.filter((t) => !collectivesValides.has(t));

  const rejeteesParCandidat = new Set();
  for (const piece of await pieceModel.listerParLot(lot.id)) {
    if (piece.statut === 'rejetee' && piece.candidat_id) rejeteesParCandidat.add(piece.candidat_id);
  }

  const manquantsParDossier = new Map();
  for (const dossier of dossiers) {
    const presents = new Set(typesParCandidat.get(dossier.candidat_id) || []);
    const manquants = TYPES_REQUIS_CANDIDAT.filter((t) => !presents.has(t)).map(
      (t) => `pièce obligatoire manquante : ${TYPES_PIECE[t].libelle.toLowerCase()}`
    );
    if (rejeteesParCandidat.has(dossier.candidat_id)) {
      manquants.push('une pièce de ce dossier a été rejetée par le ministère');
    }
    if (manquants.length > 0) manquantsParDossier.set(dossier.id, manquants);
  }

  return {
    manquantsParDossier,
    manquantsCollectifs: manquantsCollectifs.map((t) => TYPES_PIECE[t].libelle),
    rejetees: compteurs.rejetee || 0,
    nonExaminees: compteurs.deposee || 0,
  };
}
