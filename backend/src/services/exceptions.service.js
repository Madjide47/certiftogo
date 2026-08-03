// ─────────────────────────────────────────────────────────────
// Service "cas exceptionnels" — ERR-003 à ERR-006 du CDC.
//
// Un système national se juge moins sur son parcours nominal que sur ce
// qu'il fait quand la réalité s'en écarte : un téléphone perdu, un agent
// qui part, un établissement suspendu, une clé compromise.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { query, withTransaction } from '../config/database.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import * as sessions from './session.service.js';
import { journaliser, ACTIONS } from './audit.service.js';
import * as notifications from './notification.service.js';
import { ErreurApp } from '../utils/errors.js';
import {
  nettoyerTexte,
  estUuidValide,
  canoniserTelephone,
  estTelephoneValide,
  estDateValide,
} from '../utils/validators.js';

const reference = (prefixe) =>
  `${prefixe}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

// ═══ ERR-003 — Perte du téléphone ═══════════════════════════════════

/**
 * Dépôt public : le demandeur n'a plus accès à son compte, par définition.
 *
 * Aucun élément fourni ici ne prouve quoi que ce soit — c'est l'agent qui
 * tranchera, pièce d'identité en main. La demande sert à ouvrir le
 * dossier et à laisser une trace.
 */
export async function deposerRecuperation(donnees) {
  const telephone_nouveau = canoniserTelephone(donnees.telephone_nouveau || '');
  const nom = nettoyerTexte(donnees.nom);
  const prenom = nettoyerTexte(donnees.prenom);

  if (!telephone_nouveau || !estTelephoneValide(telephone_nouveau)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', 'Nouveau numéro invalide.');
  }
  if (!nom || !prenom) {
    throw new ErreurApp(400, 'CHAMP_REQUIS', 'Nom et prénom sont requis.');
  }

  const date_naissance = nettoyerTexte(donnees.date_naissance);
  if (date_naissance && !estDateValide(date_naissance)) {
    throw new ErreurApp(400, 'DATE_INVALIDE', 'Date de naissance invalide (AAAA-MM-JJ).');
  }

  // Le nouveau numéro ne doit pas déjà servir : sinon la récupération
  // deviendrait un moyen de fusionner deux comptes.
  const occupe = await utilisateurModel.trouverParTelephone(telephone_nouveau);
  if (occupe) {
    throw new ErreurApp(
      409,
      'TELEPHONE_EXISTANT',
      'Ce numéro est déjà rattaché à un compte. Utilisez-en un autre.'
    );
  }

  const telephone_ancien = canoniserTelephone(donnees.telephone_ancien || '');

  // Rapprochement indicatif, à confirmer par l'agent.
  const { rows: pistes } = await query(
    `SELECT p.id AS personne_id, u.id AS utilisateur_id, c.etablissement_id
       FROM personnes p
       LEFT JOIN utilisateurs u ON u.personne_id = p.id AND u.role = 'candidat'
       LEFT JOIN candidats c    ON c.personne_id = p.id
      WHERE (p.telephone = $1 AND $1 IS NOT NULL)
         OR (upper(p.nom) = upper($2) AND upper(p.prenom) = upper($3))
      LIMIT 1`,
    [telephone_ancien, nom, prenom]
  );

  const { rows } = await query(
    `INSERT INTO demandes_recuperation
       (reference, telephone_ancien, telephone_nouveau, nom, prenom,
        numero_etudiant, date_naissance, reference_diplome,
        personne_id, utilisateur_id, etablissement_id, piece_justificative)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING reference, statut, date_demande`,
    [
      reference('REC'),
      telephone_ancien,
      telephone_nouveau,
      nom,
      prenom,
      nettoyerTexte(donnees.numero_etudiant),
      date_naissance,
      nettoyerTexte(donnees.reference_diplome),
      pistes[0]?.personne_id || null,
      pistes[0]?.utilisateur_id || null,
      pistes[0]?.etablissement_id || null,
      nettoyerTexte(donnees.piece_justificative),
    ]
  );

  await journaliser({
    action: ACTIONS.RECUPERATION_DEMANDEE,
    entite: 'demandes_recuperation',
    auteur_libelle: `${nom} ${prenom} (${telephone_nouveau})`,
    message: `Demande de récupération ${rows[0].reference}.`,
  });

  return {
    ...rows[0],
    message:
      'Demande enregistrée. Présentez-vous auprès de votre établissement avec une pièce d\'identité ; un agent validera la demande.',
  };
}

export async function listerRecuperations(utilisateur, { statut } = {}) {
  const params = [];
  const filtres = [];

  if (statut) {
    params.push(nettoyerTexte(statut));
    filtres.push(`statut = $${params.length}`);
  }
  // Un établissement n'instruit que les demandes de ses propres diplômés.
  if (utilisateur.role === 'etablissement') {
    params.push(utilisateur.etablissement_id);
    filtres.push(`(etablissement_id = $${params.length} OR etablissement_id IS NULL)`);
  } else if (!['ministere', 'admin_systeme'].includes(utilisateur.role)) {
    throw new ErreurApp(403, 'ACCES_REFUSE', 'Accès non autorisé.');
  }

  const where = filtres.length ? `WHERE ${filtres.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM demandes_recuperation ${where} ORDER BY date_demande DESC LIMIT 100`,
    params
  );
  return rows;
}

/**
 * Validation par un agent : le compte bascule sur le nouveau numéro et
 * toutes les sessions ouvertes sont coupées — l'ancien téléphone est
 * peut-être entre d'autres mains.
 */
export async function validerRecuperation(id, utilisateur, donnees = {}) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable.');
  }

  const { rows: existantes } = await query(
    `SELECT * FROM demandes_recuperation WHERE id = $1`,
    [id]
  );
  const demande = existantes[0];
  if (!demande) throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable.');
  if (demande.statut !== 'soumise') {
    throw new ErreurApp(409, 'DEMANDE_DEJA_TRAITEE', 'Cette demande a déjà été instruite.');
  }

  const utilisateur_id = nettoyerTexte(donnees.utilisateur_id) || demande.utilisateur_id;
  if (!utilisateur_id) {
    throw new ErreurApp(
      400,
      'COMPTE_REQUIS',
      'Précisez le compte à récupérer : le rapprochement automatique n\'a rien trouvé.'
    );
  }

  const compte = await utilisateurModel.trouverParId(utilisateur_id);
  if (!compte) throw new ErreurApp(404, 'UTILISATEUR_INTROUVABLE', 'Compte introuvable.');

  const ancien = compte.telephone;

  await withTransaction(async (client) => {
    await client.query(`UPDATE utilisateurs SET telephone = $2 WHERE id = $1`, [
      utilisateur_id,
      demande.telephone_nouveau,
    ]);
    if (compte.personne_id) {
      await client.query(`UPDATE personnes SET telephone = $2 WHERE id = $1`, [
        compte.personne_id,
        demande.telephone_nouveau,
      ]);
    }
    await client.query(
      `UPDATE demandes_recuperation
          SET statut = 'acceptee', agent_validateur_id = $2, agent_libelle = $3,
              utilisateur_id = $4, date_decision = now()
        WHERE id = $1`,
      [
        id,
        utilisateur.utilisateur_id,
        `${utilisateur.role}`,
        utilisateur_id,
      ]
    );
  });

  // L'ancien appareil est peut-être entre d'autres mains : on ferme tout.
  await sessions.revoquerCompte(utilisateur_id, {
    par: utilisateur.utilisateur_id,
    motif: 'recuperation_compte',
  });

  await journaliser({
    action: ACTIONS.RECUPERATION_VALIDEE,
    entite: 'utilisateurs',
    entite_id: utilisateur_id,
    avant: { telephone: ancien },
    apres: { telephone: demande.telephone_nouveau },
    message: `Récupération ${demande.reference} validée : ${ancien} → ${demande.telephone_nouveau}.`,
  });

  return { reference: demande.reference, ancien_telephone: ancien, nouveau_telephone: demande.telephone_nouveau };
}

export async function refuserRecuperation(id, utilisateur, motif) {
  const motif_refus = nettoyerTexte(motif);
  if (!motif_refus) throw new ErreurApp(400, 'MOTIF_REQUIS', 'Un motif de refus est obligatoire.');
  if (!estUuidValide(id)) throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable.');

  const { rows } = await query(
    `UPDATE demandes_recuperation
        SET statut = 'refusee', motif_refus = $2, agent_validateur_id = $3, date_decision = now()
      WHERE id = $1 AND statut = 'soumise'
      RETURNING reference, statut, motif_refus`,
    [id, motif_refus, utilisateur.utilisateur_id]
  );
  if (!rows[0]) {
    throw new ErreurApp(409, 'DEMANDE_DEJA_TRAITEE', 'Demande introuvable ou déjà instruite.');
  }

  await journaliser({
    action: ACTIONS.RECUPERATION_REFUSEE,
    entite: 'demandes_recuperation',
    entite_id: id,
    message: `Récupération refusée : ${motif_refus}`,
  });

  return rows[0];
}

// ═══ ERR-004 — Départ d'un agent ════════════════════════════════════

/**
 * Désactive un agent et transfère ses dossiers en cours.
 *
 * Désactiver sans transférer laisserait des dossiers orphelins, au nom de
 * quelqu'un qui ne travaille plus là : personne ne saurait qui les reprend.
 */
export async function transfererDossiers(demandeur, { agent_id, repreneur_id, desactiver = true }) {
  if (!demandeur.est_agent_principal) {
    throw new ErreurApp(
      403,
      'AGENT_PRINCIPAL_REQUIS',
      'Seul l\'agent principal peut organiser un départ.'
    );
  }
  if (!estUuidValide(agent_id) || !estUuidValide(repreneur_id)) {
    throw new ErreurApp(404, 'UTILISATEUR_INTROUVABLE', 'Agent ou repreneur introuvable.');
  }
  if (agent_id === repreneur_id) {
    throw new ErreurApp(400, 'REPRENEUR_INVALIDE', 'Le repreneur doit être un autre agent.');
  }

  const [agent, repreneur] = await Promise.all([
    utilisateurModel.trouverParId(agent_id),
    utilisateurModel.trouverParId(repreneur_id),
  ]);

  for (const [compte, libelle] of [[agent, 'agent'], [repreneur, 'repreneur']]) {
    if (!compte || compte.etablissement_id !== demandeur.etablissement_id) {
      throw new ErreurApp(404, 'UTILISATEUR_INTROUVABLE', `${libelle} introuvable dans votre établissement.`);
    }
  }
  if (!repreneur.actif) {
    throw new ErreurApp(409, 'REPRENEUR_INACTIF', 'Le repreneur doit être un compte actif.');
  }

  const transferes = await withTransaction(async (client) => {
    // Seuls les dossiers encore en cours : un dossier certifié garde son
    // auteur d'origine, c'est une trace historique.
    const { rowCount } = await client.query(
      `UPDATE dossiers SET agent_etablissement_id = $2
        WHERE agent_etablissement_id = $1
          AND statut IN ('brouillon', 'soumis', 'en_examen', 'rejete')`,
      [agent_id, repreneur_id]
    );

    if (desactiver) {
      await client.query(`UPDATE utilisateurs SET actif = FALSE WHERE id = $1`, [agent_id]);
    }
    return rowCount;
  });

  if (desactiver) {
    await sessions.revoquerCompte(agent_id, {
      par: demandeur.utilisateur_id,
      motif: 'depart_agent',
    });
    await notifications.notifier(
      notifications.EVENEMENTS.AGENT_DESACTIVE,
      [{ id: agent_id, telephone: agent.telephone, nom: agent.nom, prenom: agent.prenom }],
      { date: new Date().toISOString().slice(0, 10), etablissement_id: demandeur.etablissement_id }
    );
  }

  await journaliser({
    action: ACTIONS.AGENT_DEPART,
    entite: 'utilisateurs',
    entite_id: agent_id,
    etablissement_id: demandeur.etablissement_id,
    apres: { repreneur_id, dossiers_transferes: transferes, desactive: desactiver },
    message: `${agent.nom} ${agent.prenom} : ${transferes} dossier(s) transférés à ${repreneur.nom} ${repreneur.prenom}.`,
  });

  return { dossiers_transferes: transferes, desactive: desactiver };
}

// ═══ ERR-006 — Clé de signature ═════════════════════════════════════

/** Empreinte de la clé courante, sans jamais exposer la clé elle-même. */
function empreinteCleCourante() {
  const secret = process.env.MINISTERE_SIGNING_SECRET || '';
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/** Enregistre la clé courante si elle n'est pas encore connue. */
export async function enregistrerCleCourante(ministere_id = null) {
  const empreinte = empreinteCleCourante();
  const { rows } = await query(
    `INSERT INTO cles_signature (ministere_id, empreinte, emplacement)
     VALUES ($1, $2, $3)
     ON CONFLICT (empreinte) DO UPDATE SET empreinte = EXCLUDED.empreinte
     RETURNING id, empreinte, statut, emplacement, date_activation`,
    [ministere_id, empreinte, process.env.CLE_EMPLACEMENT || 'variable_environnement']
  );
  return rows[0];
}

export async function etatCles() {
  const { rows } = await query(
    `SELECT c.id, c.empreinte, c.algorithme, c.emplacement, c.statut, c.motif_retrait,
            c.date_activation, c.date_retrait,
            (SELECT COUNT(*)::int FROM diplomes d WHERE d.cle_signature_id = c.id) AS diplomes
       FROM cles_signature c
      ORDER BY c.date_activation DESC`
  );
  return {
    cles: rows,
    // On expose l'empreinte courante, jamais la clé : elle permet de
    // vérifier qu'on parle bien de la même sans rien révéler.
    empreinte_courante: empreinteCleCourante(),
    emplacement_configure: process.env.CLE_EMPLACEMENT || 'variable_environnement',
  };
}

/**
 * Déclare une clé compromise (ERR-006).
 *
 * On ne peut PAS re-signer automatiquement : la nouvelle clé doit d'abord
 * être installée hors application. Cette procédure fige donc le constat —
 * combien de diplômes sont concernés — et alerte, plutôt que de prétendre
 * réparer.
 */
export async function declarerCompromission(utilisateur, { empreinte, motif }) {
  if (utilisateur.role !== 'admin_systeme') {
    throw new ErreurApp(403, 'ACCES_REFUSE', 'Réservé à l\'administrateur système.');
  }
  const motifNet = nettoyerTexte(motif);
  if (!motifNet) {
    throw new ErreurApp(400, 'MOTIF_REQUIS', 'Un motif est obligatoire.');
  }

  const cible = nettoyerTexte(empreinte) || empreinteCleCourante();
  const { rows } = await query(
    `UPDATE cles_signature
        SET statut = 'compromise', motif_retrait = $2, date_retrait = now(),
            diplomes_signes = (SELECT COUNT(*) FROM diplomes WHERE cle_signature_id = cles_signature.id)
      WHERE empreinte = $1 AND statut <> 'compromise'
      RETURNING id, empreinte, statut, diplomes_signes`,
    [cible, motifNet]
  );
  if (!rows[0]) {
    throw new ErreurApp(404, 'CLE_INTROUVABLE', 'Clé inconnue ou déjà déclarée compromise.');
  }

  await journaliser({
    action: ACTIONS.CLE_COMPROMISE,
    entite: 'cles_signature',
    entite_id: rows[0].id,
    resultat: 'echec',
    message: `Clé ${cible.slice(0, 12)}… déclarée compromise : ${motifNet}. ${rows[0].diplomes_signes} diplôme(s) concernés.`,
  });

  await notifications.notifierRole(
    notifications.EVENEMENTS.CLE_COMPROMISE,
    'admin_systeme',
    {
      empreinte: cible.slice(0, 12),
      motif: motifNet,
      diplomes: rows[0].diplomes_signes,
      entite: 'cles_signature',
      entite_id: rows[0].id,
    }
  );

  return {
    ...rows[0],
    marche_a_suivre: [
      'Installer une nouvelle clé hors de l\'application (KMS ou HSM).',
      'Redémarrer le service avec MINISTERE_SIGNING_SECRET mis à jour.',
      'Appeler POST /api/admin/cles/enregistrer pour référencer la nouvelle clé.',
      `Re-signer les ${rows[0].diplomes_signes} diplôme(s) concernés via une correction.`,
      'Publier un avis public indiquant la période affectée.',
    ],
  };
}
