// ─────────────────────────────────────────────────────────────
// Service "statistiques" — agrégats pour le tableau de bord.
// ─────────────────────────────────────────────────────────────
import * as candidatModel from '../models/candidat.model.js';
import * as dossierModel from '../models/dossier.model.js';

// Statuts de dossier connus (ordre d'affichage).
const STATUTS = ['brouillon', 'soumis', 'en_examen', 'valide', 'rejete', 'certifie', 'revoque'];

/** Statistiques du tableau de bord établissement. */
export async function statistiquesEtablissement(etablissement_id) {
  const [totalCandidats, repartition] = await Promise.all([
    candidatModel.compter(etablissement_id),
    dossierModel.compterParStatut(etablissement_id),
  ]);

  // Normalise la répartition en incluant les statuts à 0.
  const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0]));
  let totalDossiers = 0;
  for (const { statut, total } of repartition) {
    parStatut[statut] = total;
    totalDossiers += total;
  }

  return {
    total_candidats: totalCandidats,
    total_dossiers: totalDossiers,
    dossiers_par_statut: parStatut,
  };
}
