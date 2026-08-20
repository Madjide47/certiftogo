// ─────────────────────────────────────────────────────────────
// Service "candidat" — logique métier du module établissement.
// Contrôle l'appartenance à l'établissement et la validation.
// ─────────────────────────────────────────────────────────────
import * as candidatModel from '../models/candidat.model.js';
import * as personneModel from '../models/personne.model.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import { ErreurApp } from '../utils/errors.js';
import { journaliser, deposerCorbeille, ACTIONS } from './audit.service.js';
import { query } from '../config/database.js';
import {
  nettoyerTexte,
  estEmailValide,
  estDansEnum,
  canoniserTelephone,
  estTelephoneValide,
  canoniserDate,
  FORMATS_DATE_ACCEPTES,
  motifDateNaissanceInvraisemblable,
  SEXES,
} from '../utils/validators.js';

/** Liste les candidats de l'établissement courant. */
export async function lister(etablissement_id, { recherche, limit, offset } = {}) {
  return candidatModel.lister({ etablissement_id, recherche, limit, offset });
}

/** Récupère un candidat en garantissant qu'il appartient à l'établissement. */
export async function recuperer(id, etablissement_id) {
  const candidat = await candidatModel.trouverParId(id);
  if (!candidat || candidat.etablissement_id !== etablissement_id) {
    throw new ErreurApp(404, 'CANDIDAT_INTROUVABLE', 'Candidat introuvable.');
  }
  return candidat;
}

/** Valide et normalise les données d'un candidat. */
function validerDonnees(donnees) {
  const numero_etudiant = nettoyerTexte(donnees.numero_etudiant);
  const nom = nettoyerTexte(donnees.nom);
  const prenom = nettoyerTexte(donnees.prenom);

  if (!nom) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le nom est requis.');
  if (!prenom) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le prénom est requis.');

  const email = nettoyerTexte(donnees.email);
  if (!estEmailValide(email)) throw new ErreurApp(400, 'EMAIL_INVALIDE', 'Email invalide.');

  const sexe = nettoyerTexte(donnees.sexe);
  if (!estDansEnum(sexe, SEXES)) throw new ErreurApp(400, 'SEXE_INVALIDE', 'Le sexe doit être M ou F.');

  // Le téléphone est normalisé avant d'être stocké : sans cela
  // « 90 00 00 11 » et « +22890000011 » désigneraient deux personnes
  // distinctes, et le portefeuille national se fragmenterait.
  const telephone = canoniserTelephone(donnees.telephone || '');
  if (telephone && !estTelephoneValide(telephone)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', 'Numéro de téléphone invalide.');
  }

  // Sans ce contrôle, une date fantaisiste descendait jusqu'à PostgreSQL :
  // l'agent recevait une erreur de base de données au lieu du champ fautif.
  const date_naissance = canoniserDate(donnees.date_naissance);
  if (date_naissance === null) {
    throw new ErreurApp(
      400,
      'DATE_INVALIDE',
      `Date de naissance illisible. Formats acceptés : ${FORMATS_DATE_ACCEPTES}.`
    );
  }

  // Une date bien formée peut rester absurde. Un étudiant né aujourd'hui
  // passe tous les contrôles de syntaxe — et la faute ne se découvre
  // qu'une fois le diplôme certifié, quand son hash est ancré et que la
  // seule correction possible est une réémission.
  const invraisemblance = motifDateNaissanceInvraisemblable(date_naissance);
  if (invraisemblance) {
    throw new ErreurApp(
      400,
      'DATE_NAISSANCE_INVRAISEMBLABLE',
      `Date de naissance invraisemblable : ${invraisemblance}.`
    );
  }

  return {
    numero_etudiant,
    nom,
    prenom,
    date_naissance: date_naissance ?? null,
    lieu_naissance: nettoyerTexte(donnees.lieu_naissance),
    sexe,
    telephone,
    email,
  };
}

/**
 * Rattache la fiche à une personne : on réutilise l'identité existante si
 * le numéro est déjà connu, sinon on en crée une. C'est ce qui permet à un
 * diplômé de deux établissements de n'avoir qu'un seul portefeuille.
 */
async function resoudrePersonne(data) {
  if (data.telephone) {
    const existante = await personneModel.trouverParTelephone(data.telephone);
    if (existante) return existante;
  }
  return personneModel.creer(data);
}

/**
 * Crée le compte de connexion, désactivé.
 * Décision métier : le compte naît avec la saisie mais reste fermé tant
 * qu'aucun diplôme n'est certifié — la certification l'active. Cela évite
 * de créer des milliers de comptes pendant une certification de masse.
 */
async function assurerCompte(personne) {
  if (!personne.telephone) return null; // sans numéro, pas de connexion possible
  const existant = await utilisateurModel.trouverParTelephone(personne.telephone);
  if (existant) return existant;

  return utilisateurModel.creer({
    nom: personne.nom,
    prenom: personne.prenom,
    telephone: personne.telephone,
    role: 'candidat',
    personne_id: personne.id,
    actif: false,
  });
}

/**
 * Préfixe de matricule d'un établissement : son code, débarrassé du
 * « ETB- » administratif. `ETB-UL` donne `UL`, `IAI001` donne `IAI`.
 *
 * On garde les lettres de tête plutôt que le code entier : c'est la forme
 * déjà employée par les matricules existants, et un matricule se lit à
 * voix haute au guichet.
 */
function prefixeMatricule(code) {
  const nu = String(code || '').replace(/^ETB-/i, '');
  const lettres = (nu.match(/^[A-Za-z]+/) || [nu])[0];
  return (lettres || 'ETU').toUpperCase();
}

/**
 * Attribue le prochain matricule libre de l'établissement.
 *
 * POURQUOI L'ATTRIBUER PLUTÔT QUE LE DEMANDER
 * Le matricule était saisi à la main. Sur une promotion entière, cela
 * revient à demander à un agent de tenir un compteur de tête : il ressaisit
 * un numéro déjà pris — et le serveur le refuse après coup, une fois tout
 * le formulaire rempli — ou il en saute, et la numérotation devient
 * illisible. Aucune de ces deux erreurs n'apporte quoi que ce soit : le
 * numéro ne porte aucune information que l'établissement seul détienne.
 *
 * Format `PRÉFIXE-ANNÉE-NNN`, celui des matricules déjà en base. L'année
 * est celle de l'année académique ouverte, à défaut l'année courante : un
 * étudiant inscrit en 2026-2027 porte 2026, quelle que soit la date de
 * saisie.
 *
 * Le rang repart du DERNIER attribué, et non de zéro : la base contient
 * déjà des matricules, et recommencer à 001 les heurterait tous.
 */
async function prochainMatricule(etablissement_id) {
  const { rows } = await query(
    `SELECT e.code,
            COALESCE((SELECT substring(a.libelle from '^[0-9]{4}')::int
                        FROM annees_academiques a
                       WHERE a.statut = 'ouverte'
                       LIMIT 1),
                     EXTRACT(YEAR FROM now())::int) AS annee
       FROM etablissements e
      WHERE e.id = $1`,
    [etablissement_id]
  );
  if (!rows[0]) {
    throw new ErreurApp(404, 'ETABLISSEMENT_INTROUVABLE', 'Établissement introuvable.');
  }

  const prefixe = prefixeMatricule(rows[0].code);
  const annee = Number(rows[0].annee);
  const debut = `${prefixe}-${annee}-`;

  const { rows: max } = await query(
    `SELECT COALESCE(MAX(substring(numero_etudiant from '[0-9]+$')::int), 0) AS dernier
       FROM candidats
      WHERE etablissement_id = $1
        AND numero_etudiant LIKE $2 || '%'`,
    [etablissement_id, debut]
  );

  return { debut, rang: Number(max[0].dernier) + 1 };
}

/** Crée un candidat pour l'établissement courant. */
export async function creer(etablissement_id, donnees) {
  const data = validerDonnees(donnees);

  if (data.numero_etudiant) {
    // Un matricule fourni reste accepté : l'import d'un fichier
    // d'établissement en porte de légitimes, et une reprise d'historique
    // ne doit pas être renumérotée.
    if (await candidatModel.numeroExiste(etablissement_id, data.numero_etudiant)) {
      throw new ErreurApp(409, 'NUMERO_DUPLIQUE', 'Ce numéro étudiant existe déjà.');
    }
  } else {
    // Deux agents qui saisissent en même temps lisent le même « dernier »
    // et visent donc le même rang. La contrainte d'unicité
    // (etablissement_id, numero_etudiant) tranche ; on avance d'un cran et
    // on retente. C'est aussi ce qui fait rattraper les matricules déjà
    // présents sans avoir à les inventorier.
    const { debut, rang } = await prochainMatricule(etablissement_id);
    let candidat = null;
    for (let essai = 0; essai < 20 && !candidat; essai += 1) {
      data.numero_etudiant = `${debut}${String(rang + essai).padStart(3, '0')}`;
      if (await candidatModel.numeroExiste(etablissement_id, data.numero_etudiant)) continue;
      candidat = await enregistrer(etablissement_id, data);
    }
    if (!candidat) {
      throw new ErreurApp(
        409,
        'MATRICULE_INDISPONIBLE',
        "Aucun matricule libre n'a pu être attribué. Réessayez."
      );
    }
    return candidat;
  }

  return enregistrer(etablissement_id, data);
}

/** Écrit la fiche et journalise. Partagé par les deux voies d'attribution. */
async function enregistrer(etablissement_id, data) {
  const personne = await resoudrePersonne(data);
  await assurerCompte(personne);

  const candidat = await candidatModel.creer({
    ...data,
    personne_id: personne.id,
    etablissement_id,
  });

  await journaliser({
    action: ACTIONS.CANDIDAT_CREE,
    entite: 'candidats',
    entite_id: candidat.id,
    apres: candidat,
    message: `${candidat.nom} ${candidat.prenom} (${candidat.numero_etudiant}).`,
  });

  return candidat;
}

/** Met à jour un candidat de l'établissement courant. */
export async function modifier(id, etablissement_id, donnees) {
  const avant = await recuperer(id, etablissement_id); // garantit l'appartenance
  const data = validerDonnees(donnees);

  // Le matricule est devenu facultatif à la SAISIE, parce qu'il s'attribue
  // seul. À la modification, un champ vide ne veut donc pas dire « efface
  // le numéro » — il n'y a aucune raison légitime d'en priver une fiche —
  // mais « n'y touche pas ».
  if (!data.numero_etudiant) data.numero_etudiant = avant.numero_etudiant;

  if (await candidatModel.numeroExiste(etablissement_id, data.numero_etudiant, id)) {
    throw new ErreurApp(409, 'NUMERO_DUPLIQUE', 'Ce numéro étudiant existe déjà.');
  }

  const apres = await candidatModel.modifier(id, data);

  await journaliser({
    action: ACTIONS.CANDIDAT_MODIFIE,
    entite: 'candidats',
    entite_id: id,
    avant,
    apres,
    message: `${apres.nom} ${apres.prenom} (${apres.numero_etudiant}).`,
  });

  return apres;
}

/** Supprime un candidat (refusé s'il possède des dossiers). */
export async function supprimer(id, etablissement_id) {
  const candidat = await recuperer(id, etablissement_id);
  try {
    // La ligne part d'abord en corbeille : toute suppression est réversible.
    await deposerCorbeille({
      table_source: 'candidats',
      enregistrement_id: id,
      donnees: candidat,
      libelle: `${candidat.nom} ${candidat.prenom} (${candidat.numero_etudiant})`,
      etablissement_id,
    });

    await candidatModel.supprimer(id);

    await journaliser({
      action: ACTIONS.CANDIDAT_SUPPRIME,
      entite: 'candidats',
      entite_id: id,
      avant: candidat,
      message: `${candidat.nom} ${candidat.prenom} (${candidat.numero_etudiant}).`,
    });
  } catch (err) {
    if (err.code === '23503') {
      throw new ErreurApp(
        409,
        'CANDIDAT_LIE',
        'Impossible de supprimer : ce candidat possède des dossiers.'
      );
    }
    throw err;
  }
}
