// ─────────────────────────────────────────────────────────────
// Service "audit" — répond à la seule question qui compte en cas de
// litige : qui a fait quoi, quand, depuis où, avec quel résultat ?
//
// Deux principes :
//
//  • La journalisation ne casse JAMAIS l'action métier. Si l'écriture de
//    la trace échoue, on log l'incident et l'opération continue — refuser
//    une certification parce que le journal est plein serait absurde.
//    Sauf si un `client` transactionnel est fourni : la trace fait alors
//    partie de l'opération et tombe avec elle.
//
//  • L'identité de l'auteur est FIGÉE dans la trace. Un compte supprimé
//    ne doit pas effacer l'historique de ses actes.
// ─────────────────────────────────────────────────────────────
import * as journalModel from '../models/journal.model.js';
import { contexteCourant } from '../config/contexte.js';
import { logger } from '../utils/logger.js';
import { ErreurApp } from '../utils/errors.js';
import { estUuidValide, nettoyerTexte, versEntier } from '../utils/validators.js';

/**
 * Catalogue des actions journalisées obligatoirement (CDC §21.2).
 * Nommage `ENTITE_VERBE`, au passé, pour se lire comme un journal.
 */
export const ACTIONS = {
  // Authentification et comptes
  OTP_DEMANDE: 'otp_demande',
  CONNEXION_REUSSIE: 'connexion_reussie',
  CONNEXION_ECHOUEE: 'connexion_echouee',
  COMPTE_CREE: 'compte_cree',
  COMPTE_ACTIVE: 'compte_active',
  COMPTE_DESACTIVE: 'compte_desactive',
  AGENT_CREE: 'agent_cree',
  AGENT_DEPART: 'agent_depart',
  CHANGEMENT_NUMERO_DEMANDE: 'changement_numero_demande',
  CHANGEMENT_NUMERO_APPLIQUE: 'changement_numero_applique',
  RECUPERATION_DEMANDEE: 'recuperation_demandee',
  RECUPERATION_VALIDEE: 'recuperation_validee',
  RECUPERATION_REFUSEE: 'recuperation_refusee',
  CLE_COMPROMISE: 'cle_compromise',
  VALIDATION_DEMANDEE: 'validation_demandee',
  VALIDATION_APPROUVEE: 'validation_approuvee',
  VALIDATION_REFUSEE: 'validation_refusee',
  SOLDE_BAS: 'solde_bas',
  MODE_WORKFLOW_CHANGE: 'mode_workflow_change',

  // Gouvernance
  DEMANDE_DEPOSEE: 'demande_deposee',
  DEMANDE_EXAMINEE: 'demande_examinee',
  DEMANDE_ACCEPTEE: 'demande_acceptee',
  DEMANDE_REFUSEE: 'demande_refusee',
  ETABLISSEMENT_CREE: 'etablissement_cree',
  ETABLISSEMENT_SUSPENDU: 'etablissement_suspendu',
  HABILITATION_ACCORDEE: 'habilitation_accordee',
  HABILITATION_MODIFIEE: 'habilitation_modifiee',

  // Référentiel académique
  ANNEE_CREEE: 'annee_creee',
  ANNEE_STATUT_CHANGE: 'annee_statut_change',
  SESSION_CREEE: 'session_creee',
  FACULTE_CREEE: 'faculte_creee',
  FACULTE_MODIFIEE: 'faculte_modifiee',
  FILIERE_CREEE: 'filiere_creee',
  FILIERE_MODIFIEE: 'filiere_modifiee',

  // Étudiants et promotions
  CANDIDAT_CREE: 'candidat_cree',
  CANDIDAT_MODIFIE: 'candidat_modifie',
  CANDIDAT_SUPPRIME: 'candidat_supprime',
  PROMOTION_CREEE: 'promotion_creee',
  PROMOTION_MODIFIEE: 'promotion_modifiee',
  PROMOTION_STATUT_CHANGE: 'promotion_statut_change',
  PROMOTION_SUPPRIMEE: 'promotion_supprimee',
  ETUDIANT_INSCRIT: 'etudiant_inscrit',
  ETUDIANT_DESINSCRIT: 'etudiant_desinscrit',
  RESULTAT_ENREGISTRE: 'resultat_enregistre',
  IMPORT_SIMULE: 'import_simule',
  IMPORT_EXECUTE: 'import_execute',

  // Pièces justificatives
  PIECE_DEPOSEE: 'piece_deposee',
  PIECE_CONSULTEE: 'piece_consultee',
  PIECE_VALIDEE: 'piece_validee',
  PIECE_REJETEE: 'piece_rejetee',
  PIECE_SUPPRIMEE: 'piece_supprimee',

  // Transmission et instruction
  LOT_TRANSMIS: 'lot_transmis',
  LOT_EXAMINE: 'lot_examine',
  LOT_VALIDE: 'lot_valide',
  LOT_REJETE: 'lot_rejete',
  DOSSIER_VALIDE: 'dossier_valide',
  DOSSIER_REJETE: 'dossier_rejete',

  // Certification et ancrage
  LOT_CERTIFIE: 'lot_certifie',
  ANCRAGE_ABANDONNE: 'ancrage_abandonne',
  ANCRAGE_RELANCE: 'ancrage_relance',
  DIPLOME_CERTIFIE: 'diplome_certifie',
  DIPLOME_REVOQUE: 'diplome_revoque',
  DIPLOME_CORRIGE: 'diplome_corrige',

  // Exploitation
  ELEMENT_SUPPRIME: 'element_supprime',
  ELEMENT_RESTAURE: 'element_restaure',
  JOURNAL_EXPORTE: 'journal_exporte',
};

/** Durée de conservation par défaut : 5 ans (CDC §21.3). */
export const CONSERVATION_JOURS = Number(process.env.AUDIT_CONSERVATION_JOURS || 1825);

function auteurLibelle(utilisateur) {
  if (!utilisateur) return 'anonyme';
  const nom = [utilisateur.nom, utilisateur.prenom].filter(Boolean).join(' ');
  return nom || utilisateur.telephone || utilisateur.utilisateur_id || 'inconnu';
}

/**
 * Écrit une entrée de journal.
 *
 * @param {object} entree
 * @param {string} entree.action        une valeur de ACTIONS
 * @param {string} [entree.entite]      table ou concept concerné
 * @param {string} [entree.entite_id]
 * @param {object} [entree.avant]       état avant modification
 * @param {object} [entree.apres]       état après modification
 * @param {'succes'|'echec'} [entree.resultat]
 * @param {string} [entree.message]
 * @param {string} [entree.transaction_hash]
 * @param {object} [client]  client transactionnel : la trace devient atomique
 */
export async function journaliser(entree, client = null) {
  const contexte = contexteCourant();

  const ligne = {
    action: entree.action,
    entite: entree.entite || null,
    entite_id: estUuidValide(entree.entite_id) ? entree.entite_id : null,
    valeurs_avant: entree.avant || null,
    valeurs_apres: entree.apres || null,
    resultat: entree.resultat || 'succes',
    message: entree.message || null,
    transaction_hash: entree.transaction_hash || null,
    utilisateur_id: entree.utilisateur_id || contexte?.utilisateur_id || null,
    role: entree.role || contexte?.role || null,
    etablissement_id: entree.etablissement_id || contexte?.etablissement_id || null,
    adresse_ip: contexte?.adresse_ip || null,
    user_agent: contexte?.user_agent || null,
    auteur_libelle: entree.auteur_libelle || auteurLibelle(contexte?.utilisateur),
  };

  if (client) {
    // Trace atomique : elle tombe avec l'opération si celle-ci échoue.
    return journalModel.enregistrer(ligne, client);
  }

  try {
    return await journalModel.enregistrer(ligne);
  } catch (err) {
    // Best effort : une panne du journal ne doit pas annuler l'acte métier.
    logger.error(`[audit] Trace « ${entree.action} » non enregistrée : ${err.message}`);
    return null;
  }
}

/** Trace le changement de statut d'un dossier — chronologie du diplôme. */
export async function journaliserStatutDossier(entree, client = null) {
  const contexte = contexteCourant();
  const ligne = {
    ...entree,
    utilisateur_id: entree.utilisateur_id || contexte?.utilisateur_id || null,
    auteur_libelle: entree.auteur_libelle || auteurLibelle(contexte?.utilisateur),
  };

  if (client) return journalModel.enregistrerChangementStatut(ligne, client);

  try {
    return await journalModel.enregistrerChangementStatut(ligne);
  } catch (err) {
    logger.error(`[audit] Historique de statut non enregistré : ${err.message}`);
    return null;
  }
}

export function historiqueDossier(dossier_id) {
  if (!estUuidValide(dossier_id)) {
    throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');
  }
  return journalModel.historiqueDossier(dossier_id);
}

// ── Consultation ───────────────────────────────────────────────────

/**
 * Droits de consultation (CDC §21.4) :
 *   • admin système  → tout ;
 *   • ministère      → tout, en lecture ;
 *   • établissement  → uniquement les actions rattachées à son établissement.
 */
function porteeAutorisee(utilisateur, filtres) {
  if (utilisateur.role === 'admin_systeme' || utilisateur.role === 'ministere') {
    return filtres;
  }
  if (utilisateur.role === 'etablissement') {
    return { ...filtres, etablissement_id: utilisateur.etablissement_id };
  }
  throw new ErreurApp(403, 'ACCES_REFUSE', 'Consultation du journal non autorisée.');
}

export async function consulter(utilisateur, filtres = {}) {
  const portee = porteeAutorisee(utilisateur, {
    action: nettoyerTexte(filtres.action),
    entite: nettoyerTexte(filtres.entite),
    entite_id: estUuidValide(filtres.entite_id) ? filtres.entite_id : null,
    utilisateur_id: estUuidValide(filtres.utilisateur_id) ? filtres.utilisateur_id : null,
    resultat: nettoyerTexte(filtres.resultat),
    depuis: nettoyerTexte(filtres.depuis),
    jusqua: nettoyerTexte(filtres.jusqua),
    limit: Math.min(versEntier(filtres.limit) || 100, 500),
    offset: versEntier(filtres.offset) || 0,
  });

  const [entrees, total] = await Promise.all([
    journalModel.lister(portee),
    journalModel.compter(portee),
  ]);

  return { entrees, total, limite: portee.limit, offset: portee.offset };
}

export async function repartition(utilisateur) {
  porteeAutorisee(utilisateur, {});
  return journalModel.repartitionActions({});
}

/** Échappe une valeur pour un CSV (RFC 4180). */
function champCsv(valeur) {
  if (valeur === null || valeur === undefined) return '';
  const texte = typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur);
  return `"${texte.replace(/"/g, '""')}"`;
}

/** Export CSV du journal (CDC §21.5). L'export est lui-même journalisé. */
export async function exporter(utilisateur, filtres = {}) {
  const { entrees } = await consulter(utilisateur, { ...filtres, limit: 500 });

  const colonnes = [
    'date_action', 'auteur_libelle', 'role', 'action', 'entite', 'entite_id',
    'resultat', 'message', 'adresse_ip', 'transaction_hash',
  ];

  const lignes = [
    colonnes.join(','),
    ...entrees.map((e) => colonnes.map((c) => champCsv(e[c])).join(',')),
  ];

  await journaliser({
    action: ACTIONS.JOURNAL_EXPORTE,
    entite: 'journal_audit',
    message: `${entrees.length} entrée(s) exportée(s).`,
  });

  return lignes.join('\n');
}

/** Purge au-delà de la durée de conservation. Réservée à l'administrateur. */
export async function purger(utilisateur, jours = CONSERVATION_JOURS) {
  if (utilisateur.role !== 'admin_systeme') {
    throw new ErreurApp(403, 'ACCES_REFUSE', 'Purge réservée à l\'administrateur système.');
  }
  const nombre = versEntier(jours);
  if (nombre === null || nombre < 365) {
    throw new ErreurApp(
      400,
      'CONSERVATION_INSUFFISANTE',
      'La durée de conservation ne peut pas descendre sous 365 jours.'
    );
  }
  return journalModel.purger(nombre);
}

// ── Corbeille ──────────────────────────────────────────────────────

/** Dépose une ligne supprimée dans la corbeille avant de la retirer. */
export async function deposerCorbeille(entree, client = null) {
  const contexte = contexteCourant();
  return journalModel.deposerCorbeille(
    {
      ...entree,
      supprime_par: contexte?.utilisateur_id || null,
      auteur_libelle: auteurLibelle(contexte?.utilisateur),
      etablissement_id: entree.etablissement_id || contexte?.etablissement_id || null,
    },
    client
  );
}

export async function listerCorbeille(utilisateur, { table_source } = {}) {
  const filtres = { table_source: nettoyerTexte(table_source), restaure: false };
  if (utilisateur.role === 'etablissement') {
    filtres.etablissement_id = utilisateur.etablissement_id;
  } else if (!['admin_systeme', 'ministere'].includes(utilisateur.role)) {
    throw new ErreurApp(403, 'ACCES_REFUSE', 'Accès à la corbeille non autorisé.');
  }
  return journalModel.listerCorbeille(filtres);
}

/**
 * Restaure une ligne : elle est réinsérée telle quelle dans sa table
 * d'origine, identifiant compris, pour que les références qui la
 * désignaient redeviennent valides.
 */
export async function restaurer(utilisateur, id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'ELEMENT_INTROUVABLE', 'Élément introuvable dans la corbeille.');
  }

  const element = await journalModel.trouverCorbeille(id);
  if (!element || element.restaure) {
    throw new ErreurApp(404, 'ELEMENT_INTROUVABLE', 'Élément introuvable ou déjà restauré.');
  }
  if (
    utilisateur.role === 'etablissement' &&
    element.etablissement_id !== utilisateur.etablissement_id
  ) {
    throw new ErreurApp(404, 'ELEMENT_INTROUVABLE', 'Élément introuvable dans la corbeille.');
  }

  const { withTransaction, query } = await import('../config/database.js');

  // On ne réinsère que ce que la table accepte AUJOURD'HUI.
  //
  // Le JSON déposé en corbeille est un instantané : il peut contenir un
  // champ calculé au moment de la lecture, ou une colonne qu'une
  // migration a depuis supprimée. Rejouer les clés telles quelles faisait
  // échouer la restauration en 500 — et une suppression qu'on ne peut
  // plus annuler n'est plus une corbeille, c'est une destruction.
  const { rows: schema } = await query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [element.table_source]
  );
  const reelles = new Set(schema.map((c) => c.column_name));

  const colonnes = Object.keys(element.donnees).filter((c) => reelles.has(c));
  if (colonnes.length === 0) {
    throw new ErreurApp(
      409,
      'RESTAURATION_IMPOSSIBLE',
      `Aucune donnée de cet élément ne correspond encore à la structure de « ${element.table_source} ».`
    );
  }
  const valeurs = colonnes.map((c) => element.donnees[c]);
  const placeholders = colonnes.map((_, i) => `$${i + 1}`);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO ${element.table_source} (${colonnes.join(', ')})
       VALUES (${placeholders.join(', ')})`,
      valeurs
    );
    await journalModel.marquerRestaure(id, client);
    await journaliser(
      {
        action: ACTIONS.ELEMENT_RESTAURE,
        entite: element.table_source,
        entite_id: element.enregistrement_id,
        apres: element.donnees,
        message: `Restauration de « ${element.libelle || element.enregistrement_id} ».`,
      },
      client
    );
  });

  return { table_source: element.table_source, enregistrement_id: element.enregistrement_id };
}
