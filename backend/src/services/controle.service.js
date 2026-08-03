// ─────────────────────────────────────────────────────────────
// Service "contrôles automatiques" — niveau 1 de l'instruction.
//
// Le ministère ne peut pas relire 250 dossiers un par un, encore moins
// 12 000. La machine vérifie d'abord ce qui est vérifiable, puis met en
// évidence ce qui mérite un œil humain.
//
// Deux natures de signalement, à ne pas confondre :
//   • BLOQUANT  — le dossier est objectivement invalide, il ne peut pas
//                 être certifié en l'état ;
//   • ANOMALIE  — rien n'est faux, mais la statistique est suspecte et
//                 justifie un contrôle humain (250 étudiants nés la même
//                 année, 249 mentions identiques…).
//
// La machine ne décide jamais : elle instruit, l'agent tranche.
// ─────────────────────────────────────────────────────────────
import * as lotModel from '../models/lot.model.js';
import * as habilitationModel from '../models/habilitation.model.js';
import * as pieces from './piece-jointe.service.js';
import { estTelephoneValide, MENTIONS } from '../utils/validators.js';

const AGE_MINIMUM = 15;
const AGE_MAXIMUM = 75;
/** Au-delà, une mention unique traduit plus souvent une erreur de saisie qu'un exploit. */
const SEUIL_MENTION_UNIFORME = 0.9;

const jour = (valeur) => (valeur ? new Date(valeur).toISOString().slice(0, 10) : null);

function anneesEntre(debut, fin) {
  if (!debut || !fin) return null;
  const d = new Date(debut);
  const f = new Date(fin);
  if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime())) return null;
  return (f - d) / (365.25 * 24 * 3600 * 1000);
}

/**
 * Contrôle un lot entier.
 * @returns {{ synthese, bloquants, anomalies }}
 */
export async function controlerLot(lot) {
  const dossiers = await lotModel.listerDossiers(lot.id);

  // Chargés une seule fois : à 12 000 dossiers, une requête par ligne
  // multiplierait le temps d'instruction par mille.
  const habilitations = await habilitationModel.lister(lot.etablissement_id, { statut: 'active' });
  const typesHabilites = new Set(habilitations.map((h) => h.type_diplome));
  const dejaDiplomes = await lotModel.diplomesExistants(lot.id);

  const doublons = new Map();
  for (const { candidat_id, type_diplome_existant } of dejaDiplomes) {
    if (!doublons.has(candidat_id)) doublons.set(candidat_id, new Set());
    doublons.get(candidat_id).add(type_diplome_existant);
  }

  // E-12 — pièces justificatives. Un dossier sans relevé de notes n'est
  // pas instruisable : il n'y a rien à vérifier, seulement une
  // déclaration à croire sur parole.
  const dossierPieces = await pieces.controlerLot(lot, dossiers);

  const aujourdhui = jour(new Date());
  const bloquants = [];
  const matriculesVus = new Map();

  for (const d of dossiers) {
    const erreurs = [];

    // E-01 — champs obligatoires
    if (!d.nom) erreurs.push('nom manquant');
    if (!d.prenom) erreurs.push('prénom manquant');
    if (!d.type_diplome) erreurs.push('type de diplôme manquant');
    if (!d.date_obtention) erreurs.push("date d'obtention manquante");

    // E-08 — matricule
    if (!d.numero_etudiant) {
      erreurs.push('matricule manquant');
    } else {
      const cle = d.numero_etudiant.toLowerCase();
      if (matriculesVus.has(cle)) {
        erreurs.push(`matricule en double dans le lot (${d.numero_etudiant})`);
      } else {
        matriculesVus.set(cle, d.reference);
      }
    }

    // E-06 — format du téléphone
    if (d.telephone && !estTelephoneValide(d.telephone)) {
      erreurs.push(`téléphone invalide (${d.telephone})`);
    }

    // E-03 — cohérence des dates
    const dateObtention = jour(d.date_obtention);
    if (dateObtention && dateObtention > aujourdhui) {
      erreurs.push(`date d'obtention dans le futur (${dateObtention})`);
    }
    if (d.date_naissance && dateObtention) {
      const age = anneesEntre(d.date_naissance, d.date_obtention);
      if (age !== null && age < 0) {
        erreurs.push('date de naissance postérieure à la date d\'obtention');
      } else if (age !== null && age < AGE_MINIMUM) {
        erreurs.push(`âge invraisemblable à l'obtention (${Math.floor(age)} ans)`);
      } else if (age !== null && age > AGE_MAXIMUM) {
        erreurs.push(`âge invraisemblable à l'obtention (${Math.floor(age)} ans)`);
      }
    }

    // E-04 / E-05 — établissement habilité pour ce diplôme
    if (d.type_diplome && !typesHabilites.has(d.type_diplome)) {
      erreurs.push(
        `établissement non habilité à délivrer un diplôme de type « ${d.type_diplome} »`
      );
    }

    // E-02 — doublon : diplôme identique déjà délivré
    if (d.type_diplome && doublons.get(d.candidat_id)?.has(d.type_diplome)) {
      erreurs.push(`un diplôme « ${d.type_diplome} » a déjà été délivré à cet étudiant`);
    }

    // E-07 — cohérence de la promotion
    if (d.type_diplome && lot.type_diplome && d.type_diplome !== lot.type_diplome) {
      erreurs.push(
        `type de diplôme (${d.type_diplome}) incohérent avec la filière de la promotion (${lot.type_diplome})`
      );
    }
    if (d.mention && !MENTIONS.includes(d.mention)) {
      erreurs.push(`mention inconnue (${d.mention})`);
    }

    // E-12 — pièces manquantes ou rejetées pour cet étudiant.
    erreurs.push(...(dossierPieces.manquantsParDossier.get(d.id) || []));

    if (erreurs.length > 0) {
      bloquants.push({
        dossier_id: d.id,
        reference: d.reference,
        etudiant: `${d.nom} ${d.prenom}`.trim(),
        numero_etudiant: d.numero_etudiant,
        erreurs,
      });
    }
  }

  const anomalies = detecterAnomalies(lot, dossiers);

  // Les pièces collectives manquent au lot entier, pas à un dossier :
  // les imputer à un étudiant ferait rejeter la mauvaise personne.
  if (dossierPieces.manquantsCollectifs.length > 0) {
    anomalies.push({
      code: 'PIECES_COLLECTIVES_MANQUANTES',
      message: `Acte(s) de délibération absent(s) : ${dossierPieces.manquantsCollectifs.join(', ')}. La validation du lot est bloquée tant qu'ils manquent.`,
    });
  }
  if (dossierPieces.nonExaminees > 0) {
    anomalies.push({
      code: 'PIECES_NON_EXAMINEES',
      message: `${dossierPieces.nonExaminees} pièce(s) n'ont pas encore été ouvertes. Le lot ne peut pas être validé avant leur examen.`,
    });
  }

  return {
    synthese: {
      ...synthetiser(lot, dossiers, bloquants),
      pieces: {
        non_examinees: dossierPieces.nonExaminees,
        rejetees: dossierPieces.rejetees,
        collectives_manquantes: dossierPieces.manquantsCollectifs,
      },
    },
    bloquants,
    anomalies,
  };
}

/** Tableau de bord d'un lot, avant décision humaine. */
function synthetiser(lot, dossiers, bloquants) {
  const parMention = {};
  const parStatut = {};
  for (const d of dossiers) {
    const m = d.mention || 'sans_mention';
    parMention[m] = (parMention[m] || 0) + 1;
    parStatut[d.statut] = (parStatut[d.statut] || 0) + 1;
  }

  const moyennes = dossiers.map((d) => Number(d.moyenne)).filter((n) => Number.isFinite(n));
  const moyenneGenerale = moyennes.length
    ? Number((moyennes.reduce((a, b) => a + b, 0) / moyennes.length).toFixed(2))
    : null;

  return {
    effectif_declare: lot.effectif,
    dossiers_recus: dossiers.length,
    dossiers_bloquants: bloquants.length,
    dossiers_conformes: dossiers.length - bloquants.length,
    repartition_mentions: parMention,
    repartition_statuts: parStatut,
    moyenne_generale: moyenneGenerale,
  };
}

/** E-09 — signaux statistiques qui méritent un œil humain. */
function detecterAnomalies(lot, dossiers) {
  const anomalies = [];
  if (dossiers.length === 0) return anomalies;

  // Effectif annoncé différent du nombre réellement transmis.
  if (lot.effectif !== dossiers.length) {
    anomalies.push({
      code: 'EFFECTIF_DIVERGENT',
      message: `Le lot annonce ${lot.effectif} étudiants mais en contient ${dossiers.length}.`,
    });
  }

  // Mention quasi uniforme.
  const compte = {};
  for (const d of dossiers) {
    const m = d.mention || 'sans_mention';
    compte[m] = (compte[m] || 0) + 1;
  }
  for (const [mention, total] of Object.entries(compte)) {
    const part = total / dossiers.length;
    if (dossiers.length >= 10 && part >= SEUIL_MENTION_UNIFORME && mention !== 'sans_mention') {
      anomalies.push({
        code: 'MENTION_UNIFORME',
        message: `${total} étudiants sur ${dossiers.length} portent la mention « ${mention} » (${Math.round(part * 100)} %).`,
      });
    }
  }

  // Toutes les naissances la même année.
  const annees = new Set(
    dossiers.filter((d) => d.date_naissance).map((d) => new Date(d.date_naissance).getFullYear())
  );
  if (dossiers.length >= 10 && annees.size === 1) {
    anomalies.push({
      code: 'NAISSANCES_IDENTIQUES',
      message: `Les ${dossiers.length} étudiants sont tous nés en ${[...annees][0]}.`,
    });
  }

  // Étudiants sans numéro de téléphone : ils ne pourront pas se connecter.
  const sansTelephone = dossiers.filter((d) => !d.telephone).length;
  if (sansTelephone > 0) {
    anomalies.push({
      code: 'SANS_TELEPHONE',
      message: `${sansTelephone} étudiant(s) sans numéro : ils ne pourront pas accéder à leur diplôme.`,
    });
  }

  return anomalies;
}
