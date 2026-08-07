// ─────────────────────────────────────────────────────────────
// Service "gouvernance" — entrée d'un établissement dans CertifTOGO.
//
// Chaîne officielle : demande d'intégration → instruction par le
// ministère → création de l'établissement, de son code, de ses
// habilitations et de son agent principal.
//
// Répartition des responsabilités : le ministère AGRÉE (acte métier),
// l'administrateur système EXPLOITE la plateforme. L'administrateur ne
// certifie jamais ; le ministère n'administre pas la plateforme.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { withTransaction } from '../config/database.js';
import * as etablissementModel from '../models/etablissement.model.js';
import * as habilitationModel from '../models/habilitation.model.js';
import * as demandeModel from '../models/demande-integration.model.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import { ErreurApp, avecErreursSql } from '../utils/errors.js';
import { genererReferenceDemande, initialesEtablissement } from '../utils/reference-generator.js';
import { journaliser, ACTIONS } from './audit.service.js';
import * as notifications from './notification.service.js';
import * as permissions from './permissions.service.js';
import * as nomenclature from './nomenclature.service.js';
import * as piecesDemande from './piece-demande.service.js';
import {
  nettoyerTexte,
  estUuidValide,
  estEmailValide,
  estDansEnum,
  canoniserTelephone,
  estTelephoneValide,
  canoniserDate,
  FORMATS_DATE_ACCEPTES,
  TYPES_ETABLISSEMENT,
} from '../utils/validators.js';

const STATUTS_HABILITATION = ['active', 'suspendue', 'expiree'];

const CONTRAINTES = {
  uq_etablissements_code: [409, 'CODE_DUPLIQUE', 'Ce code établissement est déjà attribué.'],
  idx_habilitation_active: [
    409,
    'HABILITATION_EXISTANTE',
    'Cet établissement est déjà habilité pour ce type de diplôme.',
  ],
  utilisateurs_telephone_key: [409, 'TELEPHONE_EXISTANT', 'Ce numéro est déjà utilisé.'],
  demandes_integration_reference_key: [409, 'REFERENCE_DUPLIQUEE', 'Référence déjà utilisée.'],
};

// ── Code officiel ──────────────────────────────────────────────────

/**
 * Attribue le premier code libre de la forme INITIALES + compteur.
 * Reproduit la logique de la migration 005, pour que les établissements
 * créés aujourd'hui soient indiscernables de ceux repris.
 */
async function attribuerCode(nom, client) {
  const base = initialesEtablissement(nom);
  for (let compteur = 1; compteur < 1000; compteur += 1) {
    const propose = `${base}${String(compteur).padStart(3, '0')}`;
    if (!(await etablissementModel.codeExiste(propose, client))) return propose;
  }
  throw new ErreurApp(
    409,
    'CODE_INDISPONIBLE',
    `Aucun code libre pour « ${base} ». Renseignez un code manuellement.`
  );
}

// ── Validation ─────────────────────────────────────────────────────

function validerEtablissement(donnees) {
  const nom = nettoyerTexte(donnees.nom);
  const type = nettoyerTexte(donnees.type);
  const ville = nettoyerTexte(donnees.ville);
  const email = nettoyerTexte(donnees.email);

  if (!nom) throw new ErreurApp(400, 'CHAMP_REQUIS', 'Le nom est requis.');
  if (!ville) throw new ErreurApp(400, 'CHAMP_REQUIS', 'La ville est requise.');
  if (!type || !TYPES_ETABLISSEMENT.includes(type)) {
    throw new ErreurApp(400, 'TYPE_INVALIDE', "Type d'établissement invalide.");
  }
  if (!estEmailValide(email)) throw new ErreurApp(400, 'EMAIL_INVALIDE', 'Email invalide.');

  return {
    nom,
    type,
    ville,
    email,
    telephone: canoniserTelephone(donnees.telephone || ''),
    adresse: nettoyerTexte(donnees.adresse),
  };
}

function validerAgent(donnees, champ = 'agent') {
  const nom = nettoyerTexte(donnees?.nom);
  const prenom = nettoyerTexte(donnees?.prenom);
  const telephone = canoniserTelephone(donnees?.telephone || '');

  if (!nom || !prenom) {
    throw new ErreurApp(400, 'CHAMP_REQUIS', `Nom et prénom de l'${champ} sont requis.`);
  }
  if (!telephone || !estTelephoneValide(telephone)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', `Numéro de l'${champ} invalide.`);
  }
  return { nom, prenom, telephone };
}

/**
 * Identité étendue du demandeur (migration 018).
 *
 * Trois rôles distincts, et c'est délibéré : le **représentant légal**
 * engage l'établissement et signe la demande ; le **responsable des
 * certifications** l'exploitera au quotidien — c'est lui qui recevra le
 * compte ; le **contact technique** répond quand l'intégration casse.
 * Souvent trois personnes. Les confondre, c'est écrire au mauvais.
 *
 * Tous ces champs sont facultatifs au dépôt : le blocage est mis sur les
 * PIÈCES, qui font foi. Un formulaire trop exigeant se remplit de
 * n'importe quoi.
 */
function validerIdentiteDemande(donnees) {
  const juridique = nettoyerTexte(donnees.statut_juridique);
  if (juridique && !['public', 'prive'].includes(juridique)) {
    throw new ErreurApp(400, 'STATUT_JURIDIQUE_INVALIDE', 'Statut juridique : public ou prive.');
  }

  const email = nettoyerTexte(donnees.representant_email);
  if (email && !estEmailValide(email)) {
    throw new ErreurApp(400, 'EMAIL_INVALIDE', 'Email du représentant légal invalide.');
  }
  const emailTech = nettoyerTexte(donnees.contact_technique_email);
  if (emailTech && !estEmailValide(emailTech)) {
    throw new ErreurApp(400, 'EMAIL_INVALIDE', 'Email du contact informatique invalide.');
  }

  const telephone = canoniserTelephone(donnees.representant_telephone || '');
  if (telephone && !estTelephoneValide(telephone)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', 'Numéro du représentant légal invalide.');
  }
  const telTech = canoniserTelephone(donnees.contact_technique_telephone || '');
  if (telTech && !estTelephoneValide(telTech)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', 'Numéro du contact informatique invalide.');
  }

  return {
    statut_juridique: juridique || null,
    site_web: nettoyerTexte(donnees.site_web),
    representant_nom: nettoyerTexte(donnees.representant_nom),
    representant_prenom: nettoyerTexte(donnees.representant_prenom),
    representant_fonction: nettoyerTexte(donnees.representant_fonction),
    representant_telephone: telephone || null,
    representant_email: email || null,
    contact_technique_nom: nettoyerTexte(donnees.contact_technique_nom),
    contact_technique_telephone: telTech || null,
    contact_technique_email: emailTech || null,
  };
}

async function validerTypesDiplomes(valeur) {
  const liste = Array.isArray(valeur)
    ? valeur
    : String(valeur || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

  for (const type of liste) {
    if (!(await nomenclature.estTypeDiplomeValide(type))) {
      throw new ErreurApp(
        400,
        'TYPE_DIPLOME_INVALIDE',
        `Type de diplôme inconnu : ${type}. Valeurs : ${(await nomenclature.codesTypesDiplome()).join(', ')}.`
      );
    }
  }
  return [...new Set(liste)];
}

// ── Création d'un établissement par le ministère ───────────────────

/**
 * Crée d'un seul geste l'établissement, son code, ses habilitations et
 * son agent principal. Atomique : un établissement sans agent serait
 * inexploitable, personne ne pourrait s'y connecter.
 */
export async function creerEtablissement(donnees, agent_ministere_id = null) {
  const etab = validerEtablissement(donnees);
  const agent = validerAgent(donnees.agent_principal, 'agent principal');
  const habilitations = await validerTypesDiplomes(donnees.types_diplomes);

  if (habilitations.length === 0) {
    throw new ErreurApp(
      400,
      'HABILITATION_REQUISE',
      'Précisez au moins un type de diplôme que cet établissement est habilité à délivrer.'
    );
  }

  const existant = await utilisateurModel.trouverParTelephone(agent.telephone);
  if (existant) {
    throw new ErreurApp(409, 'TELEPHONE_EXISTANT', 'Ce numéro est déjà utilisé par un compte.');
  }

  const codeImpose = nettoyerTexte(donnees.code);

  const resultat = await avecErreursSql(
    () =>
      withTransaction(async (client) => {
        const code = codeImpose
          ? codeImpose.toUpperCase()
          : await attribuerCode(etab.nom, client);

        const etablissement = await etablissementModel.creer({ ...etab, code }, client);

        for (const type_diplome of habilitations) {
          await habilitationModel.creer(
            {
              etablissement_id: etablissement.id,
              type_diplome,
              reference_arrete: nettoyerTexte(donnees.reference_arrete),
            },
            client
          );
        }

        const compte = await utilisateurModel.creer(
          {
            ...agent,
            role: 'etablissement',
            etablissement_id: etablissement.id,
            est_agent_principal: true,
            // Le premier agent engage l'etablissement : c'est un directeur.
            sous_role: 'directeur',
            actif: true,
          },
          client
        );

        await journaliser(
          {
            action: ACTIONS.ETABLISSEMENT_CREE,
            entite: 'etablissements',
            entite_id: etablissement.id,
            etablissement_id: etablissement.id,
            apres: { code, nom: etablissement.nom, habilitations },
            message: `${etablissement.nom} (${code}) — agent principal ${compte.nom} ${compte.prenom}.`,
          },
          client
        );

        return { etablissement, agent_principal: compte, habilitations };
      }),
    CONTRAINTES
  );

  // L'agent principal doit savoir que son compte existe : sans ce message,
  // personne ne se connecte jamais à l'établissement qu'on vient d'agréer.
  await notifications.notifier(
    notifications.EVENEMENTS.COMPTE_CREE,
    [{
      id: resultat.agent_principal.id,
      telephone: resultat.agent_principal.telephone,
      nom: resultat.agent_principal.nom,
      prenom: resultat.agent_principal.prenom,
    }],
    { etablissement: resultat.etablissement.nom, etablissement_id: resultat.etablissement.id }
  );

  return resultat;
}

// ── Habilitations ──────────────────────────────────────────────────

export async function listerHabilitations(etablissement_id) {
  if (!estUuidValide(etablissement_id)) {
    throw new ErreurApp(404, 'ETABLISSEMENT_INTROUVABLE', 'Établissement introuvable.');
  }
  const etablissement = await etablissementModel.trouverParId(etablissement_id);
  if (!etablissement) {
    throw new ErreurApp(404, 'ETABLISSEMENT_INTROUVABLE', 'Établissement introuvable.');
  }
  return habilitationModel.lister(etablissement_id);
}

export async function accorderHabilitation(etablissement_id, donnees) {
  await listerHabilitations(etablissement_id); // valide l'existence

  const type_diplome = nettoyerTexte(donnees.type_diplome);
  if (!type_diplome || !(await nomenclature.estTypeDiplomeValide(type_diplome))) {
    throw new ErreurApp(
      400,
      'TYPE_DIPLOME_INVALIDE',
      `Type de diplôme inconnu. Valeurs : ${(await nomenclature.codesTypesDiplome()).join(', ')}.`
    );
  }

  const debutCanonise = canoniserDate(nettoyerTexte(donnees.date_debut));
  const finCanonisee = canoniserDate(nettoyerTexte(donnees.date_fin));
  if (debutCanonise === null || finCanonisee === null) {
    throw new ErreurApp(
      400,
      'DATE_INVALIDE',
      `Dates illisibles. Formats acceptés : ${FORMATS_DATE_ACCEPTES}.`
    );
  }
  const date_debut = debutCanonise ?? null;
  const date_fin = finCanonisee ?? null;
  if (date_debut && date_fin && date_fin <= date_debut) {
    throw new ErreurApp(
      400,
      'PERIODE_INVALIDE',
      "La fin d'habilitation doit être postérieure à son début."
    );
  }

  const habilitation = await avecErreursSql(
    () =>
      habilitationModel.creer({
        etablissement_id,
        type_diplome,
        reference_arrete: nettoyerTexte(donnees.reference_arrete),
        date_debut,
        date_fin,
      }),
    CONTRAINTES
  );

  await journaliser({
    action: ACTIONS.HABILITATION_ACCORDEE,
    entite: 'habilitations',
    entite_id: habilitation.id,
    etablissement_id,
    apres: habilitation,
    message: `Habilitation « ${type_diplome} » accordée.`,
  });

  return habilitation;
}

export async function changerStatutHabilitation(id, statut) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'HABILITATION_INTROUVABLE', 'Habilitation introuvable.');
  }
  const cible = nettoyerTexte(statut);
  if (!cible || !STATUTS_HABILITATION.includes(cible)) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut d\'habilitation inconnu.');
  }

  const habilitation = await habilitationModel.trouverParId(id);
  if (!habilitation) {
    throw new ErreurApp(404, 'HABILITATION_INTROUVABLE', 'Habilitation introuvable.');
  }

  return avecErreursSql(() => habilitationModel.changerStatut(id, cible), CONTRAINTES);
}

// ── Demandes d'intégration ─────────────────────────────────────────

/**
 * Dépôt public : l'établissement n'a pas encore de compte.
 *
 * La demande naît en **brouillon** quand elle doit encore recevoir ses
 * pièces (`avec_pieces`), et n'entre dans la file du ministère qu'une
 * fois transmise. On ne peut pas joindre huit actes dans la requête qui
 * porte le formulaire, et une demande arrivée sans ses justificatifs
 * ferait perdre son tour à l'établissement.
 *
 * Sans `avec_pieces`, le comportement historique est conservé : dépôt
 * immédiat, statut « soumise ».
 */
export async function deposerDemande(donnees) {
  const etab = validerEtablissement(donnees);
  const responsable = validerAgent(
    {
      nom: donnees.responsable_nom,
      prenom: donnees.responsable_prenom,
      telephone: donnees.responsable_telephone,
    },
    'responsable'
  );

  if (!etab.email) {
    throw new ErreurApp(400, 'CHAMP_REQUIS', 'Un email de contact est requis.');
  }
  if (!etab.telephone || !estTelephoneValide(etab.telephone)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', "Numéro de l'établissement invalide.");
  }

  const types = await validerTypesDiplomes(donnees.types_diplomes_demandes);
  const identite = validerIdentiteDemande(donnees);
  const brouillon = donnees.avec_pieces === true || donnees.avec_pieces === 'true';
  // 32 octets : ce jeton tient lieu de mot de passe au dossier.
  const jeton = brouillon ? crypto.randomBytes(32).toString('hex') : null;

  const demande = await avecErreursSql(
    () =>
      demandeModel.creer({
        reference: genererReferenceDemande(),
        ...etab,
        ...identite,
        responsable_nom: responsable.nom,
        responsable_prenom: responsable.prenom,
        responsable_telephone: responsable.telephone,
        types_diplomes_demandes: types.join(','),
        message: nettoyerTexte(donnees.message),
        statut: brouillon ? 'brouillon' : 'soumise',
        jeton_depot: jeton,
      }),
    CONTRAINTES
  );
  if (jeton) demande.jeton_depot = jeton;

  // Un brouillon n'est pas un dépôt : on ne le journalise qu'à la
  // transmission, sinon le journal annoncerait une demande que le
  // ministère n'a jamais reçue.
  if (!brouillon) await journaliserDepot(demande, types.join(','));

  return demande;
}

/** Dépôt anonyme : l'auteur est l'établissement candidat lui-même. */
async function journaliserDepot(demande, types) {
  await journaliser({
    action: ACTIONS.DEMANDE_DEPOSEE,
    entite: 'demandes_integration',
    entite_id: demande.id,
    auteur_libelle: `${demande.nom} (demande ${demande.reference})`,
    apres: { reference: demande.reference, nom: demande.nom, types },
    message: `Demande d'intégration de « ${demande.nom} ».`,
  });
}

/**
 * Retrouve un brouillon à partir de son couple référence + jeton.
 * Utilisé par toutes les opérations du déposant, qui n'a pas de compte.
 */
export async function recupererParJeton(reference, jeton) {
  const demande = await demandeModel.trouverParJeton(
    nettoyerTexte(reference) || '',
    nettoyerTexte(jeton) || ''
  );
  if (!demande) {
    // 404 et non 403 : dire « jeton faux » confirmerait l'existence de la
    // demande à qui a deviné la référence.
    throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable ou lien expiré.');
  }
  return demande;
}

/**
 * Transmet le dossier au ministère : brouillon → soumise.
 *
 * Contrôle des pièces obligatoires ICI et pas seulement dans le
 * navigateur : un formulaire se contourne, et une demande incomplète
 * ferait perdre son temps à l'instructeur comme au demandeur.
 */
export async function transmettreDemande(reference, jeton) {
  const demande = await recupererParJeton(reference, jeton);
  if (demande.statut !== 'brouillon') {
    throw new ErreurApp(
      409,
      'DEMANDE_DEJA_DEPOSEE',
      'Cette demande a déjà été transmise au ministère.'
    );
  }

  const manquants = await piecesDemande.manquants(demande);
  if (manquants.length > 0) {
    throw new ErreurApp(
      409,
      'PIECES_MANQUANTES',
      `Pièces obligatoires manquantes : ${manquants.map((m) => m.libelle).join(', ')}.`
    );
  }

  const transmise = await demandeModel.transmettre(demande.id);
  await journaliserDepot(transmise, transmise.types_diplomes_demandes || '');
  return transmise;
}

/** Suivi public par référence — vue volontairement restreinte. */
export async function suivreDemande(reference) {
  const demande = await demandeModel.trouverParReference(nettoyerTexte(reference) || '');
  // Un brouillon reste invisible au suivi public : sa référence se
  // devine, et son état ne regarde que celui qui détient le jeton.
  if (!demande || demande.statut === 'brouillon') {
    throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Aucune demande ne porte cette référence.');
  }
  return {
    reference: demande.reference,
    nom: demande.nom,
    statut: demande.statut,
    motif_refus: demande.statut === 'refusee' ? demande.motif_refus : null,
    date_soumission: demande.date_soumission,
    date_traitement: demande.date_traitement,
  };
}

export async function listerDemandes({ statut } = {}) {
  const filtre = nettoyerTexte(statut);
  if (!estDansEnum(filtre, ['soumise', 'en_examen', 'acceptee', 'refusee'])) {
    throw new ErreurApp(400, 'STATUT_INVALIDE', 'Statut de demande inconnu.');
  }
  const demandes = await demandeModel.lister({ statut: filtre });
  const repartition = await demandeModel.compterParStatut();
  return { demandes, repartition };
}

export async function recupererDemande(id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable.');
  }
  const demande = await demandeModel.trouverParId(id);
  if (!demande) throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable.');
  return demande;
}

/** Une décision est définitive : on n'instruit pas deux fois. */
function assurerInstruisable(demande) {
  if (demande.statut === 'acceptee' || demande.statut === 'refusee') {
    throw new ErreurApp(
      409,
      'DEMANDE_DEJA_TRAITEE',
      `Cette demande a déjà été ${demande.statut === 'acceptee' ? 'acceptée' : 'refusée'}.`
    );
  }
}

export async function examinerDemande(id, agent_ministere_id) {
  const demande = await recupererDemande(id);
  assurerInstruisable(demande);
  return demandeModel.statuer(id, { statut: 'en_examen', agent_ministere_id });
}

/**
 * Acceptation : crée l'établissement et son agent principal, puis lie la
 * demande à l'établissement créé — la décision reste traçable.
 */
export async function accepterDemande(id, agent_ministere_id, donnees = {}) {
  const demande = await recupererDemande(id);
  assurerInstruisable(demande);

  // Les données de la demande servent de base ; le ministère peut les
  // corriger au moment de l'agrément (nom officiel, types accordés…).
  const resultat = await creerEtablissement(
    {
      nom: donnees.nom || demande.nom,
      type: donnees.type || demande.type,
      ville: donnees.ville || demande.ville,
      adresse: donnees.adresse || demande.adresse,
      email: donnees.email || demande.email,
      telephone: donnees.telephone || demande.telephone,
      code: donnees.code,
      reference_arrete: donnees.reference_arrete,
      types_diplomes: donnees.types_diplomes || demande.types_diplomes_demandes,
      agent_principal: donnees.agent_principal || {
        nom: demande.responsable_nom,
        prenom: demande.responsable_prenom,
        telephone: demande.responsable_telephone,
      },
    },
    agent_ministere_id
  );

  const majDemande = await demandeModel.statuer(id, {
    statut: 'acceptee',
    etablissement_id: resultat.etablissement.id,
    agent_ministere_id,
  });

  await notifications.notifier(
    notifications.EVENEMENTS.DEMANDE_ACCEPTEE,
    [{ telephone: demande.responsable_telephone, email: demande.email }],
    {
      etablissement: resultat.etablissement.nom,
      code: resultat.etablissement.code,
      telephone: demande.responsable_telephone,
    }
  );

  await journaliser({
    action: ACTIONS.DEMANDE_ACCEPTEE,
    entite: 'demandes_integration',
    entite_id: id,
    etablissement_id: resultat.etablissement.id,
    avant: { statut: demande.statut },
    apres: { statut: 'acceptee', etablissement_id: resultat.etablissement.id },
    message: `${demande.nom} agréé sous le code ${resultat.etablissement.code}.`,
  });

  return { ...resultat, demande: majDemande };
}

export async function refuserDemande(id, agent_ministere_id, motif) {
  const demande = await recupererDemande(id);
  assurerInstruisable(demande);

  const motif_refus = nettoyerTexte(motif);
  if (!motif_refus) {
    throw new ErreurApp(400, 'MOTIF_REQUIS', 'Un motif de refus est obligatoire.');
  }

  const refusee = await demandeModel.statuer(id, {
    statut: 'refusee',
    motif_refus,
    agent_ministere_id,
  });

  await notifications.notifier(
    notifications.EVENEMENTS.DEMANDE_REFUSEE,
    [{ telephone: demande.responsable_telephone, email: demande.email }],
    { reference: demande.reference, motif: motif_refus }
  );

  await journaliser({
    action: ACTIONS.DEMANDE_REFUSEE,
    entite: 'demandes_integration',
    entite_id: id,
    avant: { statut: demande.statut },
    apres: { statut: 'refusee', motif_refus },
    message: `${demande.nom} — ${motif_refus}`,
  });

  return refusee;
}

// ── Agents d'un établissement ──────────────────────────────────────

export async function listerAgents(etablissement_id) {
  return utilisateurModel.listerParEtablissement(etablissement_id);
}

/**
 * Création d'un agent par l'agent principal de son propre établissement.
 * Décharge le ministère sans ouvrir l'inscription libre : le créateur est
 * lui-même un compte agréé, et son action est rattachable à son identité.
 */
export async function creerAgent(demandeur, donnees) {
  if (!demandeur.est_agent_principal) {
    throw new ErreurApp(
      403,
      'AGENT_PRINCIPAL_REQUIS',
      'Seul l\'agent principal de l\'établissement peut créer des comptes.'
    );
  }

  const agent = validerAgent(donnees);

  const sous_role = nettoyerTexte(donnees.sous_role) || 'agent_saisie';
  if (!permissions.SOUS_ROLES.includes(sous_role)) {
    throw new ErreurApp(
      400,
      'SOUS_ROLE_INVALIDE',
      `Sous-role inconnu. Valeurs : ${permissions.SOUS_ROLES.join(', ')}.`
    );
  }

  const existant = await utilisateurModel.trouverParTelephone(agent.telephone);
  if (existant) {
    throw new ErreurApp(409, 'TELEPHONE_EXISTANT', 'Ce numéro est déjà utilisé par un compte.');
  }

  const compte = await avecErreursSql(
    () =>
      utilisateurModel.creer({
        ...agent,
        role: 'etablissement',
        etablissement_id: demandeur.etablissement_id,
        // Un seul agent principal par établissement : celui désigné par le
        // ministère à l'agrément. Les agents créés ici sont ordinaires.
        est_agent_principal: false,
        sous_role,
        actif: true,
      }),
    CONTRAINTES
  );

  await notifications.notifier(
    notifications.EVENEMENTS.COMPTE_CREE,
    [{ id: compte.id, telephone: compte.telephone, nom: compte.nom, prenom: compte.prenom }],
    { etablissement_id: demandeur.etablissement_id }
  );

  await journaliser({
    action: ACTIONS.AGENT_CREE,
    entite: 'utilisateurs',
    entite_id: compte.id,
    etablissement_id: demandeur.etablissement_id,
    apres: { nom: compte.nom, prenom: compte.prenom, telephone: compte.telephone },
    message: `${compte.nom} ${compte.prenom} ajouté comme agent.`,
  });

  return compte;
}

// ── Mode de fonctionnement interne ─────────────────────────────────

/**
 * Bascule l'établissement entre workflow simple et hiérarchique.
 * Réservé à l'agent principal : c'est une décision d'organisation, pas
 * un réglage technique.
 */
export async function definirModeWorkflow(demandeur, mode) {
  if (!demandeur.est_agent_principal) {
    throw new ErreurApp(
      403,
      'AGENT_PRINCIPAL_REQUIS',
      "Seul l'agent principal peut changer le mode de fonctionnement."
    );
  }

  const cible = nettoyerTexte(mode);
  if (!cible || !permissions.MODES_WORKFLOW.includes(cible)) {
    throw new ErreurApp(
      400,
      'MODE_INVALIDE',
      `Mode inconnu. Valeurs : ${permissions.MODES_WORKFLOW.join(', ')}.`
    );
  }

  const { query } = await import('../config/database.js');
  const { rows } = await query(
    `UPDATE etablissements SET mode_workflow = $2 WHERE id = $1
     RETURNING id, code, nom, mode_workflow`,
    [demandeur.etablissement_id, cible]
  );
  permissions.viderCache();

  await journaliser({
    action: ACTIONS.MODE_WORKFLOW_CHANGE,
    entite: 'etablissements',
    entite_id: demandeur.etablissement_id,
    etablissement_id: demandeur.etablissement_id,
    apres: { mode_workflow: cible },
    message: `Mode de fonctionnement passé en « ${cible} ».`,
  });

  return rows[0];
}
