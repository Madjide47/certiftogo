// ─────────────────────────────────────────────────────────────
// Service "validation critique" — contrôle à quatre yeux (ADR-015).
//
// Toute l'authentification reposant sur le téléphone, un second facteur
// sur le MÊME appareil ne protège de rien : un appareil volé emporte les
// deux. Le second facteur utile est donc une seconde PERSONNE.
//
// Une action critique n'est pas exécutée immédiatement : elle est mise en
// attente, et un second agent doit l'approuver. La contrainte est portée
// par la base — `chk_quatre_yeux` interdit qu'un demandeur soit son
// propre approbateur.
//
// Activation par `DOUBLE_VALIDATION=true`. Lu à CHAQUE appel, pas au
// chargement du module : le réglage doit pouvoir changer sans
// redémarrage, et les tests doivent pouvoir l'activer ponctuellement.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';
import { journaliser, ACTIONS } from './audit.service.js';
import { contexteCourant } from '../config/contexte.js';
import { ErreurApp } from '../utils/errors.js';
import { nettoyerTexte, estUuidValide } from '../utils/validators.js';

/** Actions soumises au contrôle à quatre yeux. */
export const ACTIONS_CRITIQUES = {
  DIPLOME_REVOQUER: 'diplome.revoquer',
  LOT_CERTIFIER: 'lot.certifier',
  CLE_ROTATION: 'cle.rotation',
};

export function estActive() {
  return process.env.DOUBLE_VALIDATION === 'true';
}

/**
 * Enregistre une demande d'approbation.
 * @returns {object} la demande créée, à renvoyer au client en 202
 */
export async function demander({ action, entite, entite_id, charge_utile, motif }) {
  const contexte = contexteCourant();
  if (!contexte?.utilisateur_id) {
    throw new ErreurApp(403, 'AUTHENTIFICATION_REQUISE', 'Action non identifiable.');
  }

  const auteur = contexte.utilisateur;
  const libelle = [auteur?.nom, auteur?.prenom].filter(Boolean).join(' ') || contexte.utilisateur_id;

  const { rows } = await query(
    `INSERT INTO validations_critiques
       (action, entite, entite_id, charge_utile, motif, demandeur_id, demandeur_libelle)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     RETURNING id, action, entite, entite_id, motif, statut,
               demandeur_libelle, date_demande, date_expiration`,
    [
      action,
      entite || null,
      estUuidValide(entite_id) ? entite_id : null,
      JSON.stringify(charge_utile || {}),
      motif || null,
      contexte.utilisateur_id,
      libelle,
    ]
  );

  await journaliser({
    action: ACTIONS.VALIDATION_DEMANDEE,
    entite: 'validations_critiques',
    entite_id: rows[0].id,
    apres: { action, entite_id },
    message: `${action} en attente d'un second agent.`,
  });

  return rows[0];
}

export async function lister(utilisateur, { statut = 'en_attente' } = {}) {
  if (!['ministere', 'admin_systeme'].includes(utilisateur.role)) {
    throw new ErreurApp(403, 'ACCES_REFUSE', 'Consultation réservée au ministère.');
  }

  // Les demandes périmées ne doivent pas rester approuvables.
  await query(
    `UPDATE validations_critiques SET statut = 'expiree'
      WHERE statut = 'en_attente' AND date_expiration < now()`
  );

  const { rows } = await query(
    `SELECT id, action, entite, entite_id, charge_utile, motif, statut,
            demandeur_id, demandeur_libelle, approbateur_libelle, motif_refus,
            date_demande, date_expiration, date_decision
       FROM validations_critiques
      WHERE ($1::text IS NULL OR statut = $1)
      ORDER BY date_demande DESC
      LIMIT 100`,
    [nettoyerTexte(statut)]
  );
  return rows;
}

async function recuperer(id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'VALIDATION_INTROUVABLE', 'Demande introuvable.');
  }
  const { rows } = await query(`SELECT * FROM validations_critiques WHERE id = $1`, [id]);
  if (!rows[0]) throw new ErreurApp(404, 'VALIDATION_INTROUVABLE', 'Demande introuvable.');
  return rows[0];
}

/**
 * Approuve puis exécute l'action.
 *
 * `executeurs` associe chaque action critique à la fonction qui la réalise.
 * L'injection évite que ce service dépende de `diplome` et `ancrage`, qui
 * eux-mêmes en dépendent — sinon les imports seraient circulaires.
 */
export async function approuver(id, utilisateur, executeurs) {
  const demande = await recuperer(id);

  if (demande.statut !== 'en_attente') {
    throw new ErreurApp(409, 'DEJA_INSTRUITE', `Cette demande est « ${demande.statut} ».`);
  }
  if (new Date(demande.date_expiration) < new Date()) {
    await query(`UPDATE validations_critiques SET statut = 'expiree' WHERE id = $1`, [id]);
    throw new ErreurApp(409, 'DEMANDE_EXPIREE', 'Cette demande a expiré. Relancez-la.');
  }
  // Le cœur du dispositif : on ne s'approuve pas soi-même.
  if (demande.demandeur_id === utilisateur.utilisateur_id) {
    throw new ErreurApp(
      403,
      'AUTO_APPROBATION_INTERDITE',
      'Un second agent doit approuver cette action ; vous en êtes le demandeur.'
    );
  }

  const executeur = executeurs[demande.action];
  if (!executeur) {
    throw new ErreurApp(500, 'ACTION_INCONNUE', `Aucun exécuteur pour « ${demande.action} ».`);
  }

  const libelle =
    [utilisateur.nom, utilisateur.prenom].filter(Boolean).join(' ') || utilisateur.utilisateur_id;

  // L'action est exécutée AVANT d'être marquée exécutée : si elle échoue,
  // la demande reste en attente et peut être réessayée.
  const resultat = await executeur(demande.charge_utile, utilisateur);

  await query(
    `UPDATE validations_critiques
        SET statut = 'executee', approbateur_id = $2, approbateur_libelle = $3,
            resultat = $4::jsonb, date_decision = now()
      WHERE id = $1`,
    [id, utilisateur.utilisateur_id, libelle, JSON.stringify(resultat ?? {})]
  );

  await journaliser({
    action: ACTIONS.VALIDATION_APPROUVEE,
    entite: 'validations_critiques',
    entite_id: id,
    apres: { action: demande.action },
    message: `${demande.action} approuvée par ${libelle} (demandée par ${demande.demandeur_libelle}).`,
  });

  return { demande_id: id, action: demande.action, resultat };
}

export async function refuser(id, utilisateur, motif) {
  const demande = await recuperer(id);
  if (demande.statut !== 'en_attente') {
    throw new ErreurApp(409, 'DEJA_INSTRUITE', `Cette demande est « ${demande.statut} ».`);
  }

  const motif_refus = nettoyerTexte(motif);
  if (!motif_refus) throw new ErreurApp(400, 'MOTIF_REQUIS', 'Un motif de refus est obligatoire.');

  const libelle =
    [utilisateur.nom, utilisateur.prenom].filter(Boolean).join(' ') || utilisateur.utilisateur_id;

  const { rows } = await query(
    `UPDATE validations_critiques
        SET statut = 'refusee', approbateur_id = $2, approbateur_libelle = $3,
            motif_refus = $4, date_decision = now()
      WHERE id = $1
      RETURNING id, action, statut, motif_refus`,
    [id, utilisateur.utilisateur_id, libelle, motif_refus]
  );

  await journaliser({
    action: ACTIONS.VALIDATION_REFUSEE,
    entite: 'validations_critiques',
    entite_id: id,
    message: `${demande.action} refusée : ${motif_refus}`,
  });

  return rows[0];
}
