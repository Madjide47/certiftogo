// ─────────────────────────────────────────────────────────────
// Changement volontaire de numéro de téléphone (A-14).
//
// Le numéro est l'identifiant de connexion : le déplacer, c'est déplacer
// l'accès au compte. La procédure exige donc DEUX preuves de détention —
// l'ancien numéro, puis le nouveau — et elle est menée par le titulaire
// lui-même, sans agent.
//
// Confirmer seulement le NOUVEAU laisserait quiconque a volé une session
// emporter le compte vers son propre téléphone. Confirmer seulement
// l'ANCIEN laisserait envoyer le compte vers un numéro saisi de travers,
// et le perdre pour de bon. Les deux, dans cet ordre.
// ─────────────────────────────────────────────────────────────
import { query, withTransaction } from '../config/database.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import * as sessions from './session.service.js';
import { genererCodeOtp, OTP_EXPIRATION_MINUTES } from './otp.service.js';
import { envoyerCodeOtp } from './whatsapp.service.js';
import { journaliser, ACTIONS } from './audit.service.js';
import { ErreurApp } from '../utils/errors.js';
import { canoniserTelephone, estTelephoneValide, estUuidValide } from '../utils/validators.js';

/** Au-delà, le code est brûlé : un code à six chiffres se devine en force. */
const TENTATIVES_MAX = 5;

/** La demande entière expire, pas seulement le code en cours. */
const VALIDITE_MINUTES = Math.max(OTP_EXPIRATION_MINUTES * 3, 15);

function expiration() {
  return new Date(Date.now() + VALIDITE_MINUTES * 60 * 1000);
}

async function envoyer(telephone, code, etape) {
  try {
    await envoyerCodeOtp(telephone, code);
  } catch {
    throw new ErreurApp(
      502,
      'ENVOI_OTP_ECHEC',
      `Impossible d'envoyer le code au ${etape} numéro. Réessayez dans un instant.`
    );
  }
}

/** Demande en cours d'un compte, ou null. */
async function enCours(utilisateur_id) {
  const { rows } = await query(
    `SELECT * FROM changements_numero
      WHERE utilisateur_id = $1 AND statut IN ('ancien_a_confirmer', 'nouveau_a_confirmer')
      ORDER BY date_creation DESC LIMIT 1`,
    [utilisateur_id]
  );
  const demande = rows[0];
  if (!demande) return null;

  // Expirée : on la referme plutôt que de la laisser bloquer les suivantes.
  if (new Date(demande.date_expiration) < new Date()) {
    await query(`UPDATE changements_numero SET statut = 'abandonne' WHERE id = $1`, [demande.id]);
    return null;
  }
  return demande;
}

/** Vue exposée au client : jamais les codes. */
function vue(demande) {
  if (!demande) return null;
  return {
    id: demande.id,
    statut: demande.statut,
    nouveau_telephone: demande.nouveau_telephone,
    date_expiration: demande.date_expiration,
    tentatives_restantes: Math.max(0, TENTATIVES_MAX - demande.tentatives),
  };
}

/** État courant, pour que l'écran sache où reprendre. */
export async function etat(utilisateur) {
  return { demande: vue(await enCours(utilisateur.utilisateur_id)) };
}

// ── Étape 1 — prouver qu'on détient l'ancien numéro ────────────────

export async function demander(utilisateur, donnees = {}) {
  const nouveau = canoniserTelephone(donnees.nouveau_telephone || '');
  if (!nouveau || !estTelephoneValide(nouveau)) {
    throw new ErreurApp(400, 'TELEPHONE_INVALIDE', 'Nouveau numéro invalide.');
  }

  const compte = await utilisateurModel.trouverParId(utilisateur.utilisateur_id);
  if (!compte) throw new ErreurApp(404, 'UTILISATEUR_INTROUVABLE', 'Compte introuvable.');

  if (compte.telephone === nouveau) {
    throw new ErreurApp(
      409,
      'NUMERO_IDENTIQUE',
      'Ce numéro est déjà celui de votre compte.'
    );
  }

  // Deux comptes ne peuvent pas partager un numéro : c'est l'identifiant
  // de connexion, et l'OTP ne saurait plus qui il authentifie.
  const occupe = await utilisateurModel.trouverParTelephone(nouveau);
  if (occupe) {
    throw new ErreurApp(
      409,
      'TELEPHONE_EXISTANT',
      'Ce numéro est déjà rattaché à un compte.'
    );
  }

  // Une demande en cours est remplacée : le titulaire a le droit de se
  // raviser sans attendre l'expiration.
  const precedente = await enCours(utilisateur.utilisateur_id);
  if (precedente) {
    await query(`UPDATE changements_numero SET statut = 'abandonne' WHERE id = $1`, [
      precedente.id,
    ]);
  }

  const code = genererCodeOtp();
  const { rows } = await query(
    `INSERT INTO changements_numero
       (utilisateur_id, ancien_telephone, nouveau_telephone, code_ancien, date_expiration)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [utilisateur.utilisateur_id, compte.telephone, nouveau, code, expiration()]
  );

  await envoyer(compte.telephone, code, 'premier');

  await journaliser({
    action: ACTIONS.CHANGEMENT_NUMERO_DEMANDE,
    entite: 'utilisateurs',
    entite_id: compte.id,
    utilisateur_id: compte.id,
    role: utilisateur.role,
    message: `Changement de numéro demandé vers ${nouveau}.`,
  });

  return {
    demande: vue(rows[0]),
    message: `Un code a été envoyé à votre numéro actuel (${compte.telephone}). Il prouve que la demande vient bien de vous.`,
  };
}

// ── Vérification d'un code, commune aux deux étapes ────────────────

async function verifierCode(demande, codeSaisi, colonne) {
  const attendu = demande[colonne];
  const saisi = String(codeSaisi || '').trim();

  if (attendu && saisi && attendu === saisi) return true;

  const { rows } = await query(
    `UPDATE changements_numero
        SET tentatives = tentatives + 1,
            statut = CASE WHEN tentatives + 1 >= $2 THEN 'abandonne' ELSE statut END
      WHERE id = $1
      RETURNING tentatives, statut`,
    [demande.id, TENTATIVES_MAX]
  );

  if (rows[0].statut === 'abandonne') {
    throw new ErreurApp(
      429,
      'TROP_DE_TENTATIVES',
      'Trop de codes erronés : la demande est annulée. Recommencez depuis le début.'
    );
  }
  throw new ErreurApp(
    401,
    'CODE_INVALIDE',
    `Code incorrect. Il vous reste ${TENTATIVES_MAX - rows[0].tentatives} tentative(s).`
  );
}

// ── Étape 2 — prouver qu'on détient le nouveau numéro ──────────────

export async function confirmerAncien(utilisateur, id, code) {
  if (!estUuidValide(id)) throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable.');

  const demande = await enCours(utilisateur.utilisateur_id);
  if (!demande || demande.id !== id || demande.statut !== 'ancien_a_confirmer') {
    throw new ErreurApp(
      409,
      'ETAPE_INVALIDE',
      'Aucune demande en attente de confirmation sur votre numéro actuel.'
    );
  }

  await verifierCode(demande, code, 'code_ancien');

  const codeNouveau = genererCodeOtp();
  const { rows } = await query(
    `UPDATE changements_numero
        SET statut = 'nouveau_a_confirmer', code_nouveau = $2,
            date_confirmation_ancien = now(), tentatives = 0
      WHERE id = $1
      RETURNING *`,
    [demande.id, codeNouveau]
  );

  await envoyer(demande.nouveau_telephone, codeNouveau, 'nouveau');

  return {
    demande: vue(rows[0]),
    message: `Premier code accepté. Un second code vient d'être envoyé au ${demande.nouveau_telephone} : saisissez-le pour finaliser.`,
  };
}

// ── Étape 3 — appliquer ────────────────────────────────────────────

export async function confirmerNouveau(utilisateur, id, code) {
  if (!estUuidValide(id)) throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable.');

  const demande = await enCours(utilisateur.utilisateur_id);
  if (!demande || demande.id !== id || demande.statut !== 'nouveau_a_confirmer') {
    throw new ErreurApp(
      409,
      'ETAPE_INVALIDE',
      'Aucune demande en attente de confirmation sur le nouveau numéro.'
    );
  }

  await verifierCode(demande, code, 'code_nouveau');

  const compte = await utilisateurModel.trouverParId(utilisateur.utilisateur_id);

  // Le numéro pourrait avoir été pris entre-temps : on revérifie au
  // dernier moment, sinon la contrainte d'unicité remonterait en 500.
  const occupe = await utilisateurModel.trouverParTelephone(demande.nouveau_telephone);
  if (occupe && occupe.id !== compte.id) {
    await query(`UPDATE changements_numero SET statut = 'abandonne' WHERE id = $1`, [demande.id]);
    throw new ErreurApp(
      409,
      'TELEPHONE_EXISTANT',
      'Ce numéro vient d\'être rattaché à un autre compte. La demande est annulée.'
    );
  }

  await withTransaction(async (client) => {
    await client.query(`UPDATE utilisateurs SET telephone = $2 WHERE id = $1`, [
      compte.id,
      demande.nouveau_telephone,
    ]);

    // L'identité nationale porte aussi le numéro : la laisser en arrière
    // referait naître une seconde personne au prochain rapprochement.
    if (compte.personne_id) {
      await client.query(`UPDATE personnes SET telephone = $2 WHERE id = $1`, [
        compte.personne_id,
        demande.nouveau_telephone,
      ]);
    }

    await client.query(
      `UPDATE changements_numero
          SET statut = 'applique', date_application = now(), code_ancien = NULL, code_nouveau = NULL
        WHERE id = $1`,
      [demande.id]
    );
  });

  // Les autres appareils gardaient un accès ouvert sous l'ancien numéro.
  // La session courante survit : le titulaire est là, il vient de prouver
  // deux fois qui il est ; le déconnecter serait une punition.
  const fermees = await sessions.fermerLesAutres(utilisateur);

  await journaliser({
    action: ACTIONS.CHANGEMENT_NUMERO_APPLIQUE,
    entite: 'utilisateurs',
    entite_id: compte.id,
    utilisateur_id: compte.id,
    role: utilisateur.role,
    avant: { telephone: demande.ancien_telephone },
    apres: { telephone: demande.nouveau_telephone },
    message: `Numéro changé : ${demande.ancien_telephone} → ${demande.nouveau_telephone}.`,
  });

  return {
    ancien_telephone: demande.ancien_telephone,
    nouveau_telephone: demande.nouveau_telephone,
    sessions_fermees: fermees,
    message: `Votre numéro est désormais le ${demande.nouveau_telephone}. Vos prochaines connexions s'y feront.`,
  };
}

/** Abandon volontaire, pour libérer la demande en cours. */
export async function annuler(utilisateur, id) {
  if (!estUuidValide(id)) throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Demande introuvable.');

  const { rows } = await query(
    `UPDATE changements_numero SET statut = 'abandonne'
      WHERE id = $1 AND utilisateur_id = $2
        AND statut IN ('ancien_a_confirmer', 'nouveau_a_confirmer')
      RETURNING id`,
    [id, utilisateur.utilisateur_id]
  );
  if (!rows[0]) throw new ErreurApp(404, 'DEMANDE_INTROUVABLE', 'Aucune demande en cours.');
  return { annulee: true };
}
