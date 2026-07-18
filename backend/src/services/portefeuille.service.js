// ─────────────────────────────────────────────────────────────
// Service "portefeuille" — diplômes d'un candidat (module candidat, Phase 6).
// Le candidat ne voit que ses propres diplômes (isolation par candidat_id).
// ─────────────────────────────────────────────────────────────
import * as diplomeModel from '../models/diplome.model.js';
import { ErreurApp } from '../utils/errors.js';

const STATUTS = ['actif', 'revoque'];

/** Vue "portefeuille" d'un diplôme (champs utiles au candidat). */
function vue(d) {
  return {
    id: d.id,
    reference: d.reference,
    statut: d.statut,
    type_diplome: d.type_diplome,
    mention: d.mention,
    filiere: d.filiere,
    etablissement: d.etablissement_nom,
    date_certification: d.date_certification,
    hash: d.hash_sha256,
    transaction_id: d.transaction_id,
    pdf_url: d.pdf_url,
    qr_code_url: d.qr_code_url,
    motif_revocation: d.statut === 'revoque' ? d.motif_revocation : null,
  };
}

/** Liste les diplômes du candidat courant. */
export async function lister(candidat_id) {
  if (!candidat_id) {
    throw new ErreurApp(403, 'CANDIDAT_REQUIS', 'Compte candidat requis.');
  }
  const diplomes = await diplomeModel.listerParCandidat(candidat_id);
  return diplomes.map(vue);
}

/** Statistiques du portefeuille (répartition par statut). */
export async function statistiques(candidat_id) {
  if (!candidat_id) {
    throw new ErreurApp(403, 'CANDIDAT_REQUIS', 'Compte candidat requis.');
  }
  const repartition = await diplomeModel.compterParCandidat(candidat_id);
  const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0]));
  let total = 0;
  for (const { statut, total: n } of repartition) {
    parStatut[statut] = n;
    total += n;
  }
  return { total_diplomes: total, diplomes_par_statut: parStatut };
}
