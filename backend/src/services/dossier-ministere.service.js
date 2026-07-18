// ─────────────────────────────────────────────────────────────
// Service "dossier" — point de vue ministère (instruction des dossiers).
// Cycle de vie côté ministère : soumis → en_examen → valide | rejete.
// La certification (valide → certifie) sera ajoutée au slice 2 (module diplôme).
// ─────────────────────────────────────────────────────────────
import * as dossierModel from '../models/dossier.model.js';
import * as etablissementModel from '../models/etablissement.model.js';
import { ErreurApp } from '../utils/errors.js';
import { nettoyerTexte } from '../utils/validators.js';

/** Liste les établissements (lecture seule, vue ministère). */
export async function listerEtablissements() {
  return etablissementModel.lister();
}

/** Liste les dossiers transmis (tous établissements, filtre statut optionnel). */
export async function lister({ statut, limit, offset } = {}) {
  return dossierModel.listerPourMinistere({ statut, limit, offset });
}

/** Récupère un dossier transmis par id. */
export async function recuperer(id) {
  const dossier = await dossierModel.trouverParIdMinistere(id);
  if (!dossier) {
    throw new ErreurApp(404, 'DOSSIER_INTROUVABLE', 'Dossier introuvable.');
  }
  return dossier;
}

/** Répartition des dossiers transmis par statut. */
export async function statistiques() {
  const lignes = await dossierModel.compterParStatutMinistere();
  return lignes.reduce((acc, { statut, total }) => ({ ...acc, [statut]: total }), {});
}

/** Prend un dossier en examen : soumis → en_examen. */
export async function prendreEnExamen(id, agent_ministere_id) {
  const dossier = await recuperer(id);
  if (dossier.statut !== 'soumis') {
    throw new ErreurApp(
      409,
      'TRANSITION_INVALIDE',
      'Seul un dossier soumis peut être mis en examen.'
    );
  }
  return dossierModel.changerStatut(id, { statut: 'en_examen', agent_ministere_id });
}

/** Valide un dossier : soumis | en_examen → valide (prêt à certifier). */
export async function valider(id, agent_ministere_id) {
  const dossier = await recuperer(id);
  if (!['soumis', 'en_examen'].includes(dossier.statut)) {
    throw new ErreurApp(
      409,
      'TRANSITION_INVALIDE',
      'Seul un dossier soumis ou en examen peut être validé.'
    );
  }
  return dossierModel.changerStatut(id, {
    statut: 'valide',
    agent_ministere_id,
    marquerTraitement: true,
  });
}

/** Rejette un dossier avec motif : soumis | en_examen → rejete. */
export async function rejeter(id, agent_ministere_id, motif) {
  const motifNet = nettoyerTexte(motif);
  if (!motifNet) {
    throw new ErreurApp(400, 'MOTIF_REQUIS', 'Un motif de rejet est requis.');
  }
  const dossier = await recuperer(id);
  if (!['soumis', 'en_examen'].includes(dossier.statut)) {
    throw new ErreurApp(
      409,
      'TRANSITION_INVALIDE',
      'Seul un dossier soumis ou en examen peut être rejeté.'
    );
  }
  return dossierModel.changerStatut(id, {
    statut: 'rejete',
    motif_rejet: motifNet,
    agent_ministere_id,
    marquerTraitement: true,
  });
}
