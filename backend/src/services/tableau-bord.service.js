// ─────────────────────────────────────────────────────────────
// Service "tableau de bord" (CDC chapitre 27).
//
// Un seul point d'entrée, quatre vues : chaque rôle reçoit les
// indicateurs qui le concernent, et rien d'autre. Un établissement ne
// voit jamais les chiffres d'un confrère.
// ─────────────────────────────────────────────────────────────
import * as tb from '../models/tableau-bord.model.js';
import * as ancrageModel from '../models/ancrage.model.js';
import { instantane } from '../middlewares/metriques.middleware.js';
import { ErreurApp } from '../utils/errors.js';
import { versEntier } from '../utils/validators.js';

const parStatut = (lignes, champ = 'total') =>
  Object.fromEntries(lignes.map((l) => [l.statut, l[champ]]));

// ── Ministère ──────────────────────────────────────────────────────

async function ministere({ jours }) {
  const [volumes, top, delai, rejet, repartition, verifications, cout] = await Promise.all([
    tb.volumesCertification(),
    tb.topEtablissements(10),
    tb.delaiCertification(),
    tb.tauxRejet(),
    tb.repartitionDiplomes(),
    tb.verificationsParJour(jours),
    tb.coutBlockchain(),
  ]);

  return {
    role: 'ministere',
    certifications: volumes,
    top_etablissements: top,
    delai_certification: delai,
    rejet,
    repartition,
    verifications_par_jour: verifications,
    cout_blockchain: cout,
  };
}

// ── Établissement ──────────────────────────────────────────────────

async function etablissement(utilisateur, { jours }) {
  const id = utilisateur.etablissement_id;
  if (!id) {
    throw new ErreurApp(403, 'ETABLISSEMENT_REQUIS', 'Compte rattaché à un établissement requis.');
  }

  const [lots, promotions, delai, rejet, motifs, repartition] = await Promise.all([
    tb.lotsParStatut(id),
    tb.promotionsParStatut(id),
    tb.delaiCertification(id),
    tb.tauxRejet(id),
    tb.motifsRejet(id),
    tb.repartitionDiplomes(id),
  ]);

  return {
    role: 'etablissement',
    lots: {
      par_statut: parStatut(lots),
      etudiants_par_statut: parStatut(lots, 'etudiants'),
      // Ce que l'établissement veut savoir en premier : où en est ce
      // qu'il a envoyé, et ce qu'il doit corriger.
      en_attente: (lots.find((l) => l.statut === 'transmis')?.total || 0)
        + (lots.find((l) => l.statut === 'en_examen')?.total || 0),
      rejetes: lots.find((l) => l.statut === 'rejete')?.total || 0,
    },
    promotions: parStatut(promotions),
    delai_certification: delai,
    rejet,
    motifs_rejet: motifs,
    repartition,
    fenetre_jours: jours,
  };
}

// ── Candidat ───────────────────────────────────────────────────────

async function candidat(utilisateur) {
  if (!utilisateur.personne_id) {
    throw new ErreurApp(403, 'CANDIDAT_REQUIS', 'Compte candidat requis.');
  }
  const diplomes = await tb.verificationsDeMesDiplomes(utilisateur.personne_id);

  return {
    role: 'candidat',
    diplomes,
    total_diplomes: diplomes.length,
    // Voir combien de fois son diplôme a été consulté est le seul moyen,
    // pour le diplômé, de repérer un usage qu'il n'a pas autorisé.
    total_verifications: diplomes.reduce((somme, d) => somme + d.verifications, 0),
  };
}

// ── Administrateur ─────────────────────────────────────────────────

async function admin({ jours }) {
  const [sante, cout, file, verifications] = await Promise.all([
    tb.santeBase(),
    tb.coutBlockchain(),
    ancrageModel.etatFile(),
    tb.verificationsParJour(jours),
  ]);

  const transactions = Number(cout.transactions) || 0;
  const confirmees = Number(cout.confirmees) || 0;

  return {
    role: 'admin_systeme',
    sante: {
      ...sante,
      taille_base_mo: Math.round((Number(sante.taille_base_octets) / 1048576) * 100) / 100,
    },
    api: instantane(),
    blockchain: {
      ...cout,
      taux_succes_pourcent:
        transactions === 0 ? null : Math.round((confirmees / transactions) * 10000) / 100,
    },
    file_ancrage: parStatut(file),
    verifications_par_jour: verifications,
  };
}

/** Aiguille vers la vue correspondant au rôle appelant. */
export async function pour(utilisateur, options = {}) {
  const jours = Math.min(Math.max(versEntier(options.jours) || 30, 1), 365);

  switch (utilisateur.role) {
    case 'ministere':
      return ministere({ jours });
    case 'etablissement':
      return etablissement(utilisateur, { jours });
    case 'candidat':
      return candidat(utilisateur);
    case 'admin_systeme':
      return admin({ jours });
    default:
      throw new ErreurApp(403, 'ACCES_REFUSE', 'Aucun tableau de bord pour ce rôle.');
  }
}

/** Export CSV à plat — un couple indicateur/valeur par ligne. */
export async function exporter(utilisateur, options = {}) {
  const donnees = await pour(utilisateur, options);

  const lignes = [['indicateur', 'valeur']];
  const parcourir = (objet, prefixe = '') => {
    for (const [cle, valeur] of Object.entries(objet)) {
      const nom = prefixe ? `${prefixe}.${cle}` : cle;
      if (valeur === null || valeur === undefined) lignes.push([nom, '']);
      else if (Array.isArray(valeur)) lignes.push([nom, `${valeur.length} entrée(s)`]);
      else if (typeof valeur === 'object') parcourir(valeur, nom);
      else lignes.push([nom, String(valeur)]);
    }
  };
  parcourir(donnees);

  return lignes.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
