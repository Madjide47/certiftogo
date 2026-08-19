// ─────────────────────────────────────────────────────────────
// Service "notifications".
//
// Une notification est créée EN BASE d'abord, expédiée ensuite. Le centre
// in-app fonctionne donc même si WhatsApp est indisponible, et un envoi
// échoué reste rejouable — au lieu d'être perdu.
//
// Comme pour l'audit, notifier ne casse jamais l'acte métier : personne
// ne doit voir une certification échouer parce qu'un SMS n'est pas parti.
// ─────────────────────────────────────────────────────────────
import * as notificationModel from '../models/notification.model.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import { envoyerMessage } from './whatsapp.service.js';
import { CATALOGUE, EVENEMENTS, CANAUX, modelePour, rendre } from './catalogue-notifications.js';
import { ErreurApp } from '../utils/errors.js';
import { estUuidValide, nettoyerTexte } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

export { EVENEMENTS };

/**
 * Crée les notifications d'un événement pour un ou plusieurs destinataires.
 *
 * @param {string} evenement       clé du catalogue
 * @param {Array<object>} destinataires  { id?, telephone?, email?, prenom?, nom? }
 * @param {object} donnees         variables du modèle + contexte
 */
export async function notifier(evenement, destinataires, donnees = {}) {
  try {
    const modele = modelePour(evenement);
    const cibles = (Array.isArray(destinataires) ? destinataires : [destinataires]).filter(Boolean);
    const creees = [];

    for (const cible of cibles) {
      // Les variables du modèle héritent des champs du destinataire :
      // {{prenom}} fonctionne sans avoir à le répéter à chaque appel.
      const variables = { ...cible, ...donnees };
      const refus = cible.id ? await notificationModel.refus(cible.id) : [];

      for (const canal of modele.canaux) {
        // Un refus explicite est respecté, sauf pour les événements
        // critiques : on ne se désabonne pas de son propre diplôme.
        const refuse = refus.some((r) => r.evenement === evenement && r.canal === canal);
        if (refuse && !modele.critique) continue;

        // Un canal sans adresse est inutile : on ne crée pas de ligne
        // vouée à l'échec.
        if (canal === 'whatsapp' || canal === 'sms') {
          if (!cible.telephone) continue;
        }
        if (canal === 'email' && !cible.email) continue;
        if (canal === 'in_app' && !cible.id) continue;

        creees.push(
          await notificationModel.creer({
            evenement,
            canal,
            priorite: modele.priorite,
            destinataire_id: cible.id || null,
            destinataire_telephone: cible.telephone || null,
            destinataire_email: cible.email || null,
            sujet: rendre(modele.sujet, variables),
            corps: rendre(modele.corps, variables),
            donnees,
            entite: donnees.entite || null,
            entite_id: estUuidValide(donnees.entite_id) ? donnees.entite_id : null,
            etablissement_id: donnees.etablissement_id || null,
          })
        );
      }
    }

    // Expédition immédiate, sans bloquer l'appelant sur le réseau.
    if (creees.some((n) => n.canal !== 'in_app')) {
      expedierEnAttente().catch((err) =>
        logger.error(`[notifications] Expédition différée en échec : ${err.message}`)
      );
    }

    return creees;
  } catch (err) {
    logger.error(`[notifications] Événement « ${evenement} » non notifié : ${err.message}`);
    return [];
  }
}

/** Notifie tous les agents d'un établissement. */
export async function notifierEtablissement(evenement, etablissement_id, donnees = {}) {
  const agents = await utilisateurModel.listerParEtablissement(etablissement_id);
  return notifier(
    evenement,
    agents.filter((a) => a.actif).map((a) => ({
      id: a.id,
      telephone: a.telephone,
      nom: a.nom,
      prenom: a.prenom,
    })),
    { ...donnees, etablissement_id }
  );
}

/**
 * Notifie le titulaire d'un diplôme à partir de sa fiche étudiant.
 * Passe par la personne, pas par la fiche : c'est elle qui porte le compte.
 */
export async function notifierDiplome(evenement, candidat_id, donnees = {}) {
  const { query } = await import('../config/database.js');
  const { rows } = await query(
    `SELECT u.id, u.telephone, u.nom, u.prenom, p.email
       FROM candidats c
       JOIN personnes p    ON p.id = c.personne_id
       JOIN utilisateurs u ON u.personne_id = c.personne_id AND u.role = 'candidat'
      WHERE c.id = $1`,
    [candidat_id]
  );
  if (rows.length === 0) return [];
  return notifier(evenement, rows, donnees);
}

/** Notifie tous les comptes portant un rôle donné (ministère, admin). */
export async function notifierRole(evenement, role, donnees = {}) {
  const comptes = await utilisateurModel.lister({ role });
  return notifier(
    evenement,
    comptes.filter((c) => c.actif).map((c) => ({
      id: c.id,
      telephone: c.telephone,
      nom: c.nom,
      prenom: c.prenom,
    })),
    donnees
  );
}

// ── Expédition ─────────────────────────────────────────────────────

/** Achemine une notification selon son canal. */
async function acheminer(notification) {
  switch (notification.canal) {
    case 'whatsapp':
      await envoyerMessage(notification.destinataire_telephone, notification.corps);
      return;
    case 'sms':
      // Canal de secours : pas encore d'opérateur raccordé. On trace
      // l'intention plutôt que de faire croire à un envoi.
      logger.info(`[sms] → ${notification.destinataire_telephone} : ${notification.sujet}`);
      return;
    case 'email':
      logger.info(`[email] → ${notification.destinataire_email} : ${notification.sujet}`);
      return;
    default:
      // in_app : la ligne en base EST la livraison.
  }
}

/** Traite la file d'expédition. Renvoie le bilan de la tranche. */
export async function expedierEnAttente(taille = 20) {
  const notifications = await notificationModel.aExpedier(taille);
  let envoyees = 0;
  let echouees = 0;

  for (const notification of notifications) {
    try {
      await acheminer(notification);
      await notificationModel.marquerEnvoyee(notification.id);
      envoyees += 1;
    } catch (err) {
      const etat = await notificationModel.marquerEchouee(notification.id, err.message);
      echouees += 1;
      if (etat?.statut === 'abandonnee') {
        logger.error(
          `[notifications] ${notification.evenement} abandonnée après ${etat.tentatives} tentatives.`
        );
      }
    }
  }

  return { traitees: notifications.length, envoyees, echouees };
}

// ── Centre de notifications ────────────────────────────────────────

export async function boiteDeReception(utilisateur, { non_lues } = {}) {
  const [notifications, non_lues_total] = await Promise.all([
    notificationModel.listerPour(utilisateur.utilisateur_id, {
      non_lues: String(non_lues) === 'true',
    }),
    notificationModel.compterNonLues(utilisateur.utilisateur_id),
  ]);
  return { notifications, non_lues: non_lues_total };
}

export async function marquerLue(utilisateur, id) {
  if (!estUuidValide(id)) {
    throw new ErreurApp(404, 'NOTIFICATION_INTROUVABLE', 'Notification introuvable.');
  }
  const notification = await notificationModel.marquerLue(id, utilisateur.utilisateur_id);
  if (!notification) {
    throw new ErreurApp(404, 'NOTIFICATION_INTROUVABLE', 'Notification introuvable.');
  }
  return notification;
}

export function toutMarquerLu(utilisateur) {
  return notificationModel.toutMarquerLu(utilisateur.utilisateur_id);
}

// ── Préférences ────────────────────────────────────────────────────

export async function preferences(utilisateur) {
  const refus = await notificationModel.listerPreferences(utilisateur.utilisateur_id);
  const catalogue = Object.entries(CATALOGUE).map(([evenement, modele]) => ({
    evenement,
    sujet: modele.sujet,
    canaux: modele.canaux,
    priorite: modele.priorite,
    // Signalé au client pour qu'il grise la case plutôt que de laisser
    // croire à un choix qui ne sera pas respecté.
    desactivable: !modele.critique,
  }));
  return { catalogue, refus };
}

export async function definirPreference(utilisateur, { evenement, canal, actif }) {
  const ev = nettoyerTexte(evenement);
  const cn = nettoyerTexte(canal);

  if (!ev || !CATALOGUE[ev]) {
    throw new ErreurApp(400, 'EVENEMENT_INCONNU', 'Événement de notification inconnu.');
  }
  if (!cn || !CANAUX.includes(cn)) {
    throw new ErreurApp(400, 'CANAL_INCONNU', `Canal inconnu. Valeurs : ${CANAUX.join(', ')}.`);
  }
  if (CATALOGUE[ev].critique && actif === false) {
    throw new ErreurApp(
      409,
      'NOTIFICATION_CRITIQUE',
      'Cette notification ne peut pas être désactivée : elle porte une information essentielle.'
    );
  }

  return notificationModel.definirPreference(
    utilisateur.utilisateur_id,
    ev,
    cn,
    actif !== false
  );
}

export function repartition() {
  return notificationModel.repartition();
}
