// ─────────────────────────────────────────────────────────────
// Service "fiche étudiant" — tout ce qui concerne une personne, en une
// lecture.
//
// PROBLÈME RÉSOLU
// L'information existait, éparpillée sur cinq écrans : l'état civil dans
// « Étudiants », le parcours dans une modale à part, les résultats dans
// la promotion, les pièces dans une troisième modale, les dossiers et
// diplômes ailleurs encore. Un agent qui doit se prononcer sur un cas —
// une réclamation, un doute sur une mention, un dossier renvoyé — devait
// reconstituer de tête ce que le système savait déjà.
//
// La fiche rassemble. Elle ne montre RIEN de nouveau : elle met côte à
// côte ce qui doit être lu ensemble, et c'est le rapprochement qui rend
// l'examen possible.
//
// Deux portes d'entrée, une seule forme de réponse :
//   • l'établissement part de l'ÉTUDIANT, qu'il a saisi ;
//   • le ministère part du DOSSIER, seul objet qu'il reçoit.
// Les deux aboutissent à la même fiche, donc au même écran.
// ─────────────────────────────────────────────────────────────
import * as ficheModel from '../models/fiche.model.js';
import * as inscriptionModel from '../models/inscription.model.js';
import * as dossierModel from '../models/dossier.model.js';
import * as pieces from './piece-jointe.service.js';
import { ErreurApp } from '../utils/errors.js';
import { estUuidValide } from '../utils/validators.js';

/**
 * Assemble la fiche à partir d'une fiche étudiant déjà authentifiée.
 * `utilisateur` sert au contrôle d'accès des pièces, rien de plus.
 */
async function assembler(candidat, utilisateur, { dossier_courant = null } = {}) {
  const [parcours, dossiers, diplomes, autresFiches, consultations, grille] = await Promise.all([
    inscriptionModel.listerParCandidat(candidat.id),
    ficheModel.dossiersDuCandidat(candidat.id),
    ficheModel.diplomesDeLaPersonne(candidat.personne_id),
    ficheModel.fichesDeLaPersonne(candidat.personne_id, candidat.id),
    ficheModel.consultationsDeLaPersonne(candidat.personne_id),
    pieces.grilleCandidat(candidat.id, utilisateur),
  ]);

  // Ce qui manque à la fiche pour être exploitable, dit une fois pour
  // toutes : l'agent ne doit pas avoir à croiser trois blocs pour s'en
  // apercevoir.
  const alertes = [];
  if (!candidat.telephone) {
    alertes.push({
      code: 'NUMERO_MANQUANT',
      message:
        "Aucun numéro de téléphone : le diplômé ne pourra ni être averti de sa certification ni ouvrir son portefeuille, et la promotion ne pourra pas être transmise.",
    });
  }
  if (!candidat.date_naissance) {
    alertes.push({
      code: 'NAISSANCE_MANQUANTE',
      message:
        "Date de naissance absente : c'est elle qui distingue deux homonymes sur le diplôme imprimé.",
    });
  }
  if (!grille.complet) {
    alertes.push({
      code: 'PIECES_INCOMPLETES',
      message: `Pièces obligatoires manquantes : ${grille.manquantes.map((m) => m.libelle).join(', ')}.`,
    });
  }

  return {
    candidat: {
      id: candidat.id,
      personne_id: candidat.personne_id,
      numero_etudiant: candidat.numero_etudiant,
      nom: candidat.nom,
      prenom: candidat.prenom,
      sexe: candidat.sexe,
      date_naissance: candidat.date_naissance,
      lieu_naissance: candidat.lieu_naissance,
      telephone: candidat.telephone,
      email: candidat.email,
      date_creation: candidat.date_creation,
      etablissement_id: candidat.etablissement_id,
      etablissement_nom: candidat.etablissement_nom,
      etablissement_code: candidat.etablissement_code,
    },
    parcours,
    dossiers,
    dossier_courant,
    diplomes,
    // Le portefeuille d'un diplômé peut couvrir plusieurs écoles : le
    // taire ferait passer un parcours complet pour un parcours partiel.
    autres_fiches: autresFiches,
    consultations,
    pieces: grille,
    alertes,
  };
}

/** Fiche vue par l'établissement, isolée à ses propres étudiants. */
export async function pourEtablissement(candidat_id, utilisateur) {
  if (!estUuidValide(candidat_id)) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  }
  const candidat = await ficheModel.candidatAvecEtablissement(candidat_id);
  if (!candidat || candidat.etablissement_id !== utilisateur.etablissement_id) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');
  }
  return assembler(candidat, utilisateur);
}

/**
 * Fiche vue par le ministère, atteinte depuis un dossier.
 *
 * C'est le seul chemin cohérent de son côté : le ministère n'administre
 * pas d'étudiants, il instruit des dossiers. Partir de l'étudiant lui
 * donnerait un annuaire national de personnes, qui n'entre pas dans sa
 * mission d'instruction.
 */
export async function pourMinistere(dossier_id, utilisateur) {
  if (!estUuidValide(dossier_id)) {
    throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');
  }
  const dossier = await dossierModel.trouverParIdMinistere(dossier_id);
  if (!dossier) throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');

  const candidat = await ficheModel.candidatAvecEtablissement(dossier.candidat_id);
  if (!candidat) throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Étudiant introuvable.');

  return assembler(candidat, utilisateur, { dossier_courant: dossier_id });
}
