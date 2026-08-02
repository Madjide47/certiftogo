// ─────────────────────────────────────────────────────────────
// Catalogue des notifications (CDC §20.2).
//
// Un seul endroit décrit QUI reçoit QUOI, par QUEL canal, avec quelle
// urgence et quel texte. Disperser ces choix dans les services rendrait
// impossible de répondre à « que reçoit un candidat ? ».
//
// `critique: true` = notification non désactivable : l'utilisateur ne
// peut pas se passer de l'information (son diplôme, sa sécurité).
// ─────────────────────────────────────────────────────────────

export const CANAUX = ['in_app', 'whatsapp', 'sms', 'email'];
export const PRIORITES = ['haute', 'normale', 'basse'];

export const EVENEMENTS = {
  COMPTE_CREE: 'compte_cree',
  OTP_ENVOYE: 'otp_envoye',
  CONNEXION_ECHOUEE: 'connexion_echouee',
  SESSION_SUSPECTE: 'session_suspecte',

  LOT_RECU: 'lot_recu',
  LOT_EXAMINE: 'lot_examine',
  LOT_VALIDE: 'lot_valide',
  LOT_REJETE: 'lot_rejete',
  DOSSIER_REJETE: 'dossier_rejete',

  DIPLOME_CERTIFIE: 'diplome_certifie',
  DIPLOME_REVOQUE: 'diplome_revoque',
  QR_CONSULTE: 'qr_consulte',

  DEMANDE_ACCEPTEE: 'demande_acceptee',
  DEMANDE_REFUSEE: 'demande_refusee',
  ETABLISSEMENT_SUSPENDU: 'etablissement_suspendu',
  AGENT_DESACTIVE: 'agent_desactive',

  ANCRAGE_ECHOUE: 'ancrage_echoue',
  ANCRAGE_RETABLI: 'ancrage_retabli',
};

/**
 * Modèles. `{{variable}}` est remplacé par la valeur passée en données.
 * Les textes restent courts : ils partent aussi par SMS.
 */
export const CATALOGUE = {
  [EVENEMENTS.COMPTE_CREE]: {
    destinataire: 'titulaire du compte',
    canaux: ['in_app', 'whatsapp'],
    priorite: 'normale',
    sujet: 'Bienvenue sur CertifTOGO',
    corps:
      'Bonjour {{prenom}}, votre compte CertifTOGO est prêt. Connectez-vous avec votre numéro {{telephone}} : un code de vérification vous sera envoyé.',
  },

  [EVENEMENTS.CONNEXION_ECHOUEE]: {
    destinataire: 'titulaire du compte',
    canaux: ['in_app'],
    priorite: 'haute',
    critique: true,
    sujet: 'Tentative de connexion échouée',
    corps:
      'Une tentative de connexion à votre compte a échoué le {{date}}. Si ce n\'était pas vous, signalez-le à votre administrateur.',
  },

  [EVENEMENTS.SESSION_SUSPECTE]: {
    destinataire: 'titulaire du compte',
    canaux: ['in_app', 'whatsapp'],
    priorite: 'haute',
    critique: true,
    sujet: 'Connexion inhabituelle',
    corps: 'Une connexion à votre compte a eu lieu depuis {{origine}}. Si ce n\'était pas vous, contactez le support.',
  },

  [EVENEMENTS.LOT_RECU]: {
    destinataire: 'agents du ministère',
    canaux: ['in_app'],
    priorite: 'normale',
    sujet: 'Nouveau lot à instruire',
    corps:
      '{{etablissement}} a transmis {{effectif}} dossier(s) — promotion « {{promotion}} » (lot {{reference}}).',
  },

  [EVENEMENTS.LOT_EXAMINE]: {
    destinataire: 'agents de l\'établissement émetteur',
    canaux: ['in_app'],
    priorite: 'basse',
    sujet: 'Votre lot est en cours d\'examen',
    corps: 'Le lot {{reference}} ({{effectif}} dossiers) est en cours d\'instruction par le ministère.',
  },

  [EVENEMENTS.LOT_VALIDE]: {
    destinataire: 'agents de l\'établissement émetteur',
    canaux: ['in_app', 'whatsapp'],
    priorite: 'haute',
    sujet: 'Lot validé par le ministère',
    corps:
      'Le lot {{reference}} est validé : {{valides}} dossier(s) acceptés, {{rejetes}} renvoyés pour correction.',
  },

  [EVENEMENTS.LOT_REJETE]: {
    destinataire: 'agents de l\'établissement émetteur',
    canaux: ['in_app', 'whatsapp'],
    priorite: 'haute',
    sujet: 'Lot rejeté par le ministère',
    corps: 'Le lot {{reference}} a été rejeté. Motif : {{motif}}. La promotion est de nouveau modifiable.',
  },

  [EVENEMENTS.DOSSIER_REJETE]: {
    destinataire: 'agents de l\'établissement émetteur',
    canaux: ['in_app'],
    priorite: 'normale',
    sujet: 'Dossier renvoyé pour correction',
    corps: 'Le dossier {{reference}} ({{etudiant}}) a été rejeté. Motif : {{motif}}.',
  },

  [EVENEMENTS.DIPLOME_CERTIFIE]: {
    destinataire: 'diplômé',
    canaux: ['in_app', 'whatsapp'],
    priorite: 'haute',
    critique: true,
    sujet: 'Votre diplôme est certifié',
    corps:
      'Bonjour {{prenom}}, votre diplôme {{type_diplome}} a été certifié par le ministère. Connectez-vous à CertifTOGO pour le consulter et le partager.',
  },

  [EVENEMENTS.DIPLOME_REVOQUE]: {
    destinataire: 'diplômé',
    canaux: ['in_app', 'whatsapp'],
    priorite: 'haute',
    critique: true,
    sujet: 'Votre diplôme a été révoqué',
    corps:
      'Le diplôme {{reference}} a été révoqué par le ministère. Motif : {{motif}}. Rapprochez-vous de votre établissement.',
  },

  [EVENEMENTS.QR_CONSULTE]: {
    destinataire: 'diplômé',
    canaux: ['in_app'],
    priorite: 'basse',
    sujet: 'Votre diplôme a été vérifié',
    corps: 'Votre diplôme {{reference}} vient d\'être vérifié par un tiers le {{date}}.',
  },

  [EVENEMENTS.DEMANDE_ACCEPTEE]: {
    destinataire: 'responsable de l\'établissement candidat',
    canaux: ['whatsapp', 'email'],
    priorite: 'haute',
    sujet: 'Votre établissement est agréé',
    corps:
      '{{etablissement}} est agréé sur CertifTOGO sous le code {{code}}. Connectez-vous avec le numéro {{telephone}}.',
  },

  [EVENEMENTS.DEMANDE_REFUSEE]: {
    destinataire: 'responsable de l\'établissement candidat',
    canaux: ['whatsapp', 'email'],
    priorite: 'haute',
    sujet: 'Demande d\'intégration refusée',
    corps: 'La demande {{reference}} a été refusée. Motif : {{motif}}.',
  },

  [EVENEMENTS.ETABLISSEMENT_SUSPENDU]: {
    destinataire: 'agents de l\'établissement',
    canaux: ['in_app', 'whatsapp'],
    priorite: 'haute',
    critique: true,
    sujet: 'Établissement suspendu',
    corps:
      '{{etablissement}} est suspendu. Les transmissions au ministère sont gelées jusqu\'à nouvel ordre.',
  },

  [EVENEMENTS.AGENT_DESACTIVE]: {
    destinataire: 'agent concerné',
    canaux: ['in_app'],
    priorite: 'haute',
    critique: true,
    sujet: 'Votre compte a été désactivé',
    corps: 'Votre accès à CertifTOGO a été désactivé le {{date}}.',
  },

  [EVENEMENTS.ANCRAGE_ECHOUE]: {
    destinataire: 'administrateur système',
    canaux: ['in_app'],
    priorite: 'haute',
    critique: true,
    sujet: 'Ancrage blockchain en échec',
    corps:
      'L\'ancrage du diplôme {{reference}} a été abandonné après {{tentatives}} tentatives. Dernière erreur : {{erreur}}.',
  },

  [EVENEMENTS.ANCRAGE_RETABLI]: {
    destinataire: 'administrateur système',
    canaux: ['in_app'],
    priorite: 'normale',
    sujet: 'Ancrage rétabli',
    corps: 'L\'ancrage du diplôme {{reference}} a finalement réussi ({{transaction}}).',
  },
};

/** Remplace les {{variables}} d'un modèle. Une variable absente devient « — ». */
export function rendre(modele, donnees = {}) {
  return String(modele).replace(/\{\{(\w+)\}\}/g, (_, cle) => {
    const valeur = donnees[cle];
    return valeur === null || valeur === undefined || valeur === '' ? '—' : String(valeur);
  });
}

export function modelePour(evenement) {
  const modele = CATALOGUE[evenement];
  if (!modele) throw new Error(`Événement de notification inconnu : ${evenement}`);
  return modele;
}
