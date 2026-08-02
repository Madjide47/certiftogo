// ─────────────────────────────────────────────────────────────
// Service "import" — chargement d'une promotion entière depuis un
// fichier Excel ou CSV.
//
// Principe : on ne fait jamais confiance au fichier. Chaque ligne est
// validée AVANT toute écriture, et l'import est strict — s'il reste une
// seule erreur, rien n'est importé. L'établissement corrige son fichier
// et recommence, plutôt que de deviner ce qui est passé.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs';
import { withTransaction } from '../config/database.js';
import * as candidatModel from '../models/candidat.model.js';
import * as personneModel from '../models/personne.model.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import * as inscriptionModel from '../models/inscription.model.js';
import { ErreurApp } from '../utils/errors.js';
import {
  nettoyerTexte,
  canoniserTelephone,
  estTelephoneValide,
  estEmailValide,
  estDateValide,
  SEXES,
  MENTIONS,
} from '../utils/validators.js';

/**
 * En-têtes acceptés pour chaque champ. La comparaison se fait sur une
 * forme normalisée (sans accent, sans ponctuation), ce qui tolère les
 * fichiers réels : « N° Étudiant », « Numero etudiant », « MATRICULE ».
 */
const COLONNES = {
  numero_etudiant: ['matricule', 'numero_etudiant', 'numero etudiant', 'n etudiant', 'no etudiant', 'numero'],
  nom: ['nom'],
  prenom: ['prenom', 'prenoms'],
  telephone: ['telephone', 'tel', 'contact', 'numero de telephone'],
  email: ['email', 'mail', 'courriel'],
  date_naissance: ['date_naissance', 'date de naissance', 'ne le', 'naissance'],
  lieu_naissance: ['lieu_naissance', 'lieu de naissance'],
  sexe: ['sexe', 'genre'],
  moyenne: ['moyenne', 'moy'],
  mention: ['mention'],
};

export const CHAMPS_REQUIS = ['numero_etudiant', 'nom', 'prenom'];

/** Retire accents et ponctuation pour comparer des en-têtes réels. */
function normaliserEntete(valeur) {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Convertit une cellule ExcelJS en chaîne exploitable. */
function valeurCellule(cellule) {
  const v = cellule?.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // Cellule formule : ExcelJS expose { formula, result }.
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  if (typeof v === 'object' && 'text' in v) return String(v.text ?? '').trim();
  if (typeof v === 'object' && Array.isArray(v.richText)) {
    return v.richText.map((t) => t.text).join('').trim();
  }
  return String(v).trim();
}

/**
 * Lit le classeur et renvoie { entetes, lignes }.
 * `lignes[].numero` est le numéro de ligne DANS LE FICHIER, pour que le
 * rapport d'erreurs soit directement actionnable dans Excel.
 */
async function lireFichier(buffer, nomFichier = '') {
  const classeur = new ExcelJS.Workbook();

  try {
    if (nomFichier.toLowerCase().endsWith('.csv')) {
      const { Readable } = await import('node:stream');
      await classeur.csv.read(Readable.from(buffer.toString('utf8')));
    } else {
      await classeur.xlsx.load(buffer);
    }
  } catch {
    throw new ErreurApp(
      400,
      'FICHIER_ILLISIBLE',
      'Fichier illisible. Formats acceptés : .xlsx et .csv.'
    );
  }

  const feuille = classeur.worksheets[0];
  if (!feuille || feuille.rowCount < 2) {
    throw new ErreurApp(
      400,
      'FICHIER_VIDE',
      'Le fichier ne contient aucune donnée sous la ligne d\'en-têtes.'
    );
  }

  // Ligne 1 = en-têtes. On associe chaque colonne à un champ connu.
  const correspondance = {};
  feuille.getRow(1).eachCell((cellule, index) => {
    const entete = normaliserEntete(valeurCellule(cellule));
    for (const [champ, alias] of Object.entries(COLONNES)) {
      if (alias.includes(entete)) correspondance[champ] = index;
    }
  });

  const manquants = CHAMPS_REQUIS.filter((c) => !(c in correspondance));
  if (manquants.length > 0) {
    throw new ErreurApp(
      400,
      'COLONNES_MANQUANTES',
      `Colonnes obligatoires absentes : ${manquants.join(', ')}. ` +
        'La première ligne du fichier doit contenir les en-têtes.'
    );
  }

  const lignes = [];
  for (let n = 2; n <= feuille.rowCount; n += 1) {
    const rangee = feuille.getRow(n);
    const brut = {};
    for (const [champ, index] of Object.entries(correspondance)) {
      brut[champ] = valeurCellule(rangee.getCell(index));
    }
    // Une ligne entièrement vide est ignorée sans être signalée : les
    // fichiers Excel en contiennent souvent en fin de feuille.
    if (Object.values(brut).every((v) => v === '')) continue;
    lignes.push({ numero: n, brut });
  }

  if (lignes.length === 0) {
    throw new ErreurApp(400, 'FICHIER_VIDE', 'Aucune ligne exploitable dans le fichier.');
  }

  return { colonnes: Object.keys(correspondance), lignes };
}

/** Valide une ligne isolément. Renvoie { donnees, erreurs[] }. */
function validerLigne(brut) {
  const erreurs = [];
  const d = {};

  d.numero_etudiant = nettoyerTexte(brut.numero_etudiant);
  d.nom = nettoyerTexte(brut.nom);
  d.prenom = nettoyerTexte(brut.prenom);

  if (!d.numero_etudiant) erreurs.push('matricule manquant');
  if (!d.nom) erreurs.push('nom manquant');
  if (!d.prenom) erreurs.push('prénom manquant');

  // Le téléphone est normalisé AVANT tout contrôle : sans cela « 90 00 00 11 »
  // et « +22890000011 » seraient traités comme deux personnes différentes.
  const tel = canoniserTelephone(brut.telephone || '');
  if (tel) {
    if (!estTelephoneValide(tel)) erreurs.push(`téléphone invalide (${brut.telephone})`);
    else d.telephone = tel;
  } else {
    d.telephone = null;
  }

  d.email = nettoyerTexte(brut.email);
  if (d.email && !estEmailValide(d.email)) erreurs.push(`email invalide (${d.email})`);

  d.date_naissance = nettoyerTexte(brut.date_naissance);
  if (d.date_naissance && !estDateValide(d.date_naissance)) {
    erreurs.push(`date de naissance invalide (${d.date_naissance}), format attendu AAAA-MM-JJ`);
  }

  d.lieu_naissance = nettoyerTexte(brut.lieu_naissance);

  const sexe = nettoyerTexte(brut.sexe);
  if (sexe) {
    const abrege = sexe.toUpperCase().charAt(0);
    if (!SEXES.includes(abrege)) erreurs.push(`sexe invalide (${sexe})`);
    else d.sexe = abrege;
  } else {
    d.sexe = null;
  }

  const moyenneBrute = nettoyerTexte(brut.moyenne);
  if (moyenneBrute) {
    const moyenne = Number(String(moyenneBrute).replace(',', '.'));
    if (!Number.isFinite(moyenne) || moyenne < 0 || moyenne > 20) {
      erreurs.push(`moyenne hors barème (${moyenneBrute})`);
    } else {
      d.moyenne = moyenne;
    }
  } else {
    d.moyenne = null;
  }

  const mention = nettoyerTexte(brut.mention);
  if (mention) {
    const normalisee = normaliserEntete(mention).replace(/ /g, '_');
    if (!MENTIONS.includes(normalisee)) {
      erreurs.push(`mention inconnue (${mention}), valeurs : ${MENTIONS.join(', ')}`);
    } else {
      d.mention = normalisee;
    }
  } else {
    d.mention = null;
  }

  // Une mention traduit une délibération : l'étudiant est admis.
  d.statut_inscription = d.mention ? 'admis' : 'inscrit';

  return { donnees: d, erreurs };
}

/**
 * Analyse un fichier et produit un rapport complet, sans rien écrire.
 * @returns {{ total, valides, erreurs: Array<{ligne, erreurs}>, apercu }}
 */
export async function analyser({ buffer, nomFichier, etablissement_id, promotion_id }) {
  const { lignes } = await lireFichier(buffer, nomFichier);

  const rapport = { total: lignes.length, valides: 0, erreurs: [], apercu: [] };
  const validees = [];

  // Doublons internes au fichier.
  const matriculesVus = new Map();
  const telephonesVus = new Map();

  for (const ligne of lignes) {
    const { donnees, erreurs } = validerLigne(ligne.brut);

    if (donnees.numero_etudiant) {
      const cle = donnees.numero_etudiant.toLowerCase();
      if (matriculesVus.has(cle)) {
        erreurs.push(`matricule en double dans le fichier (déjà ligne ${matriculesVus.get(cle)})`);
      } else {
        matriculesVus.set(cle, ligne.numero);
      }
    }

    if (donnees.telephone) {
      if (telephonesVus.has(donnees.telephone)) {
        erreurs.push(
          `téléphone en double dans le fichier (déjà ligne ${telephonesVus.get(donnees.telephone)})`
        );
      } else {
        telephonesVus.set(donnees.telephone, ligne.numero);
      }
    }

    if (erreurs.length > 0) {
      rapport.erreurs.push({ ligne: ligne.numero, erreurs });
    } else {
      validees.push({ ...donnees, ligne: ligne.numero });
    }
  }

  // Confrontation à la base : matricules déjà pris dans l'établissement,
  // étudiants déjà inscrits dans cette promotion.
  for (const ligne of validees) {
    const problemes = [];

    if (await candidatModel.numeroExiste(etablissement_id, ligne.numero_etudiant)) {
      problemes.push(`matricule déjà présent dans l'établissement (${ligne.numero_etudiant})`);
    }

    if (problemes.length > 0) {
      rapport.erreurs.push({ ligne: ligne.ligne, erreurs: problemes });
      ligne.rejetee = true;
    }
  }

  const retenues = validees.filter((l) => !l.rejetee);
  rapport.valides = retenues.length;
  rapport.erreurs.sort((a, b) => a.ligne - b.ligne);
  rapport.apercu = retenues.slice(0, 5).map((l) => ({
    ligne: l.ligne,
    numero_etudiant: l.numero_etudiant,
    nom: l.nom,
    prenom: l.prenom,
    telephone: l.telephone,
    mention: l.mention,
  }));

  return { rapport, retenues, promotion_id };
}

/**
 * Importe réellement les lignes. Strict : si le rapport contient la
 * moindre erreur, rien n'est écrit.
 */
export async function importer({ buffer, nomFichier, etablissement_id, promotion_id }) {
  const { rapport, retenues } = await analyser({
    buffer,
    nomFichier,
    etablissement_id,
    promotion_id,
  });

  if (rapport.erreurs.length > 0) {
    throw new ErreurApp(
      422,
      'IMPORT_INVALIDE',
      `${rapport.erreurs.length} ligne(s) en erreur : aucun étudiant n'a été importé. ` +
        'Corrigez le fichier puis relancez l\'import.'
    );
  }

  // Tout ou rien : une promotion à moitié importée serait ingérable.
  const cree = await withTransaction(async (client) => {
    let compteur = 0;

    for (const ligne of retenues) {
      // Identité : on réutilise la personne si le numéro est déjà connu.
      let personne = ligne.telephone
        ? await personneModel.trouverParTelephone(ligne.telephone)
        : null;

      if (!personne) {
        personne = await personneModel.creer(ligne, client);
      }

      const candidat = await candidatModel.creer(
        { ...ligne, personne_id: personne.id, etablissement_id },
        client
      );

      // Compte de connexion, fermé jusqu'à la certification.
      if (personne.telephone) {
        const existant = await utilisateurModel.trouverParTelephone(personne.telephone);
        if (!existant) {
          await utilisateurModel.creer(
            {
              nom: personne.nom,
              prenom: personne.prenom,
              telephone: personne.telephone,
              role: 'candidat',
              personne_id: personne.id,
              actif: false,
            },
            client
          );
        }
      }

      await inscriptionModel.creer(
        {
          candidat_id: candidat.id,
          promotion_id,
          statut: ligne.statut_inscription,
          moyenne: ligne.moyenne,
          mention: ligne.mention,
        },
        client
      );

      compteur += 1;
    }

    return compteur;
  });

  return { ...rapport, importes: cree };
}

/**
 * Génère le modèle de fichier à remplir par l'établissement.
 * Fournir le gabarit évite la moitié des erreurs d'en-tête.
 */
export async function genererModele() {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'CertifTOGO';
  const feuille = classeur.addWorksheet('Étudiants');

  feuille.columns = [
    { header: 'matricule', key: 'matricule', width: 18 },
    { header: 'nom', key: 'nom', width: 20 },
    { header: 'prenom', key: 'prenom', width: 20 },
    { header: 'telephone', key: 'telephone', width: 18 },
    { header: 'email', key: 'email', width: 28 },
    { header: 'date_naissance', key: 'date_naissance', width: 16 },
    { header: 'lieu_naissance', key: 'lieu_naissance', width: 18 },
    { header: 'sexe', key: 'sexe', width: 8 },
    { header: 'moyenne', key: 'moyenne', width: 10 },
    { header: 'mention', key: 'mention', width: 14 },
  ];

  feuille.getRow(1).font = { bold: true };
  feuille.addRow({
    matricule: 'IAI-2026-001',
    nom: 'AGBEKO',
    prenom: 'Koffi',
    telephone: '+22890000011',
    email: 'koffi.agbeko@example.tg',
    date_naissance: '2000-03-15',
    lieu_naissance: 'Lomé',
    sexe: 'M',
    moyenne: 14.5,
    mention: 'bien',
  });

  // Deuxième feuille : le mode d'emploi, pour que le gabarit se suffise.
  const aide = classeur.addWorksheet('Consignes');
  aide.columns = [{ width: 24 }, { width: 90 }];
  const consignes = [
    ['Colonne', 'Règle'],
    ['matricule', 'Obligatoire. Unique dans l\'établissement et dans le fichier.'],
    ['nom', 'Obligatoire.'],
    ['prenom', 'Obligatoire.'],
    ['telephone', 'Recommandé : sert d\'identifiant de connexion. Format +228XXXXXXXX. Unique dans le fichier.'],
    ['email', 'Facultatif.'],
    ['date_naissance', 'Facultatif. Format AAAA-MM-JJ.'],
    ['lieu_naissance', 'Facultatif.'],
    ['sexe', 'Facultatif. M ou F.'],
    ['moyenne', 'Facultatif. Nombre entre 0 et 20.'],
    ['mention', `Facultatif. ${MENTIONS.join(', ')}. Une mention vaut admission.`],
    ['', ''],
    ['Import strict', 'Si une seule ligne est en erreur, aucun étudiant n\'est importé. Corrigez puis relancez.'],
    ['Simulation', 'Lancez d\'abord une simulation : elle signale chaque erreur avec son numéro de ligne.'],
  ];
  consignes.forEach((ligne, index) => {
    const r = aide.addRow(ligne);
    if (index === 0) r.font = { bold: true };
  });

  return Buffer.from(await classeur.xlsx.writeBuffer());
}
