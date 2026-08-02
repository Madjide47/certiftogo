// ─────────────────────────────────────────────────────────────
// Service "référentiel" — années académiques et sessions.
//
// Référentiel national : seul le ministère écrit ; les établissements le
// lisent pour rattacher leurs promotions.
// ─────────────────────────────────────────────────────────────
import * as anneeModel from '../models/annee-academique.model.js';
import * as sessionModel from '../models/session-academique.model.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import {
  nettoyerTexte,
  estUuidValide,
  estLibelleAnneeValide,
  estDateValide,
  estDansEnum,
  TYPES_SESSION,
  STATUTS_ANNEE,
  STATUTS_SESSION,
  TRANSITIONS_ANNEE,
} from '../utils/validators.js';

// Contraintes du schéma → message métier. Sans cette table, une violation
// remonterait en « CONFLIT_UNICITE » générique, inexploitable côté interface.
const CONTRAINTES_ANNEE = {
  idx_annee_unique_ouverte: [
    409,
    'ANNEE_OUVERTE_EXISTE',
    'Une année académique est déjà ouverte. Clôturez-la avant d\'en ouvrir une autre.',
  ],
  annees_academiques_libelle_key: [
    409,
    'ANNEE_DUPLIQUEE',
    'Cette année académique existe déjà.',
  ],
  chk_annee_libelle: [400, 'LIBELLE_INVALIDE', 'Le libellé doit être au format AAAA-AAAA.'],
  chk_annee_periode: [
    400,
    'PERIODE_INVALIDE',
    'La date de fin doit être postérieure à la date de début.',
  ],
};

const CONTRAINTES_SESSION = {
  idx_session_unique_par_annee: [
    409,
    'SESSION_DUPLIQUEE',
    'Une session de ce type existe déjà pour cette année académique.',
  ],
  chk_session_periode: [
    400,
    'PERIODE_INVALIDE',
    'La date de fin ne peut pas précéder la date de début.',
  ],
  uq_sessions_id_annee: [409, 'SESSION_DUPLIQUEE', 'Session déjà enregistrée.'],
};

// ── Années académiques ─────────────────────────────────────────────

export async function listerAnnees({ statut } = {}) {
  if (!estDansEnum(statut, STATUTS_ANNEE)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut d\'année inconnu.');
  }
  return anneeModel.lister({ statut: nettoyerTexte(statut) });
}

export async function recupererAnnee(id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'ANNEE_INTROUVABLE', 'Année académique introuvable.');
  }
  const annee = await anneeModel.trouverParId(id);
  if (!annee) throw new ErreurApp(404, 'ANNEE_INTROUVABLE', 'Année académique introuvable.');
  return annee;
}

function validerAnnee(donnees) {
  const libelle = nettoyerTexte(donnees.libelle);
  if (!libelle) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le libellé de l\'année est requis.');
  if (!estLibelleAnneeValide(libelle)) {
    throw new ErreurApp(
      400,
      'LIBELLE_INVALIDE',
      'Le libellé doit être au format AAAA-AAAA sur deux années consécutives (ex : 2024-2025).'
    );
  }

  const date_debut = nettoyerTexte(donnees.date_debut);
  const date_fin = nettoyerTexte(donnees.date_fin);
  if (!date_debut || !date_fin) {
    throw new ErreurApp(400, 'CHAMP_REQUIS', 'Les dates de début et de fin sont requises.');
  }
  if (!estDateValide(date_debut) || !estDateValide(date_fin)) {
    throw new ErreurApp(400, 'DATE_INVALIDE', 'Les dates doivent être au format AAAA-MM-JJ.');
  }
  if (date_fin <= date_debut) {
    throw new ErreurApp(
      400,
      'PERIODE_INVALIDE',
      'La date de fin doit être postérieure à la date de début.'
    );
  }

  const statut = nettoyerTexte(donnees.statut) || 'preparation';
  if (!STATUTS_ANNEE.includes(statut)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut d\'année inconnu.');
  }

  return { libelle, date_debut, date_fin, statut };
}

export async function creerAnnee(donnees) {
  const data = validerAnnee(donnees);
  return avecErreursSql(() => anneeModel.creer(data), CONTRAINTES_ANNEE);
}

export async function changerStatutAnnee(id, statut) {
  const annee = await recupererAnnee(id);
  const cible = nettoyerTexte(statut);

  if (!cible || !STATUTS_ANNEE.includes(cible)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut d\'année inconnu.');
  }
  if (cible === annee.statut) return annee;

  if (!TRANSITIONS_ANNEE[annee.statut].includes(cible)) {
    throw new ErreurApp(
      409,
      'TRANSITION_INTERDITE',
      `Une année « ${annee.statut} » ne peut pas passer à « ${cible} ».`
    );
  }

  return avecErreursSql(() => anneeModel.changerStatut(id, cible), CONTRAINTES_ANNEE);
}

export async function supprimerAnnee(id) {
  await recupererAnnee(id);
  const promotions = await anneeModel.compterPromotions(id);
  if (promotions > 0) {
    throw new ErreurApp(
      409,
      'ANNEE_UTILISEE',
      `Suppression impossible : ${promotions} promotion(s) sont rattachées à cette année.`
    );
  }
  await avecErreursSql(() => anneeModel.supprimer(id));
}

// ── Sessions académiques ───────────────────────────────────────────

export async function listerSessions(annee_id) {
  await recupererAnnee(annee_id);
  return sessionModel.listerParAnnee(annee_id);
}

export async function recupererSession(id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'SESSION_INTROUVABLE', 'Session introuvable.');
  }
  const session = await sessionModel.trouverParId(id);
  if (!session) throw new ErreurApp(404, 'SESSION_INTROUVABLE', 'Session introuvable.');
  return session;
}

export async function creerSession(annee_id, donnees) {
  const annee = await recupererAnnee(annee_id);

  if (annee.statut === 'cloturee') {
    throw new ErreurApp(
      409,
      'ANNEE_CLOTUREE',
      'Impossible d\'ajouter une session à une année clôturée.'
    );
  }

  const type = nettoyerTexte(donnees.type);
  if (!type) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le type de session est requis.');
  if (!TYPES_SESSION.includes(type)) {
    throw new ErreurApp(
      400,
      'TYPE_INVALIDE',
      `Type de session inconnu. Valeurs acceptées : ${TYPES_SESSION.join(', ')}.`
    );
  }

  const date_debut = nettoyerTexte(donnees.date_debut);
  const date_fin = nettoyerTexte(donnees.date_fin);
  if (!estDateValide(date_debut) || !estDateValide(date_fin)) {
    throw new ErreurApp(400, 'DATE_INVALIDE', 'Les dates doivent être au format AAAA-MM-JJ.');
  }
  if (date_debut && date_fin && date_fin < date_debut) {
    throw new ErreurApp(
      400,
      'PERIODE_INVALIDE',
      'La date de fin ne peut pas précéder la date de début.'
    );
  }

  const statut = nettoyerTexte(donnees.statut) || 'preparation';
  if (!STATUTS_SESSION.includes(statut)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de session inconnu.');
  }

  return avecErreursSql(
    () =>
      sessionModel.creer({
        annee_id,
        type,
        libelle: nettoyerTexte(donnees.libelle),
        date_debut,
        date_fin,
        statut,
      }),
    CONTRAINTES_SESSION
  );
}

export async function changerStatutSession(id, statut) {
  const session = await recupererSession(id);
  const cible = nettoyerTexte(statut);

  if (!cible || !STATUTS_SESSION.includes(cible)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de session inconnu.');
  }
  if (cible === session.statut) return session;

  if (!TRANSITIONS_ANNEE[session.statut].includes(cible)) {
    throw new ErreurApp(
      409,
      'TRANSITION_INTERDITE',
      `Une session « ${session.statut} » ne peut pas passer à « ${cible} ».`
    );
  }

  return avecErreursSql(() => sessionModel.changerStatut(id, cible), CONTRAINTES_SESSION);
}

export async function supprimerSession(id) {
  await recupererSession(id);
  const promotions = await sessionModel.compterPromotions(id);
  if (promotions > 0) {
    throw new ErreurApp(
      409,
      'SESSION_UTILISEE',
      `Suppression impossible : ${promotions} promotion(s) sont présentées au titre de cette session.`
    );
  }
  await avecErreursSql(() => sessionModel.supprimer(id));
}
