// ─────────────────────────────────────────────────────────────
// Service d'envoi WhatsApp — code OTP d'authentification.
//
// Deux modes (WHATSAPP_MODE), sur le même principe que blockchain.service :
//   - "mock"  : le code est affiché dans la console du serveur — défaut,
//               aucun identifiant Meta requis (développement, tests, démo).
//   - "cloud" : envoi réel via la WhatsApp Business Cloud API (Meta).
//
// Config "cloud" (voir .env.example) :
//   WHATSAPP_TOKEN             token d'accès permanent
//   WHATSAPP_PHONE_NUMBER_ID   identifiant du numéro expéditeur
//   WHATSAPP_TEMPLATE_NOM      nom du template d'authentification approuvé
//   WHATSAPP_TEMPLATE_LANGUE   code langue du template (ex : fr)
//   WHATSAPP_AVEC_BOUTON       "true" si le template a un bouton de copie
//
// Un template de catégorie "authentication" est OBLIGATOIRE : Meta interdit
// l'envoi de messages libres tant que l'utilisateur n'a pas écrit en premier.
// ─────────────────────────────────────────────────────────────
import { logger } from '../utils/logger.js';

const MODE = process.env.WHATSAPP_MODE || 'mock';
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const TEMPLATE_NOM = process.env.WHATSAPP_TEMPLATE_NOM || 'certiftogo_code_otp';
const TEMPLATE_LANGUE = process.env.WHATSAPP_TEMPLATE_LANGUE || 'fr';
const AVEC_BOUTON = (process.env.WHATSAPP_AVEC_BOUTON || 'true') === 'true';
const VERSION_API = process.env.WHATSAPP_API_VERSION || 'v21.0';

const TIMEOUT_MS = 10_000;

/** Erreur d'envoi WhatsApp (remontée telle quelle à la couche auth). */
export class ErreurWhatsapp extends Error {
  constructor(message, { code = null, details = null } = {}) {
    super(message);
    this.name = 'ErreurWhatsapp';
    this.code = code;
    this.details = details;
  }
}

/** true si l'envoi réel est actif. */
export function estActif() {
  return MODE === 'cloud';
}

/**
 * Met le numéro au format attendu par Meta : chiffres uniquement, sans "+".
 * Les numéros sont stockés en base au format international (+228…).
 */
function versFormatMeta(telephone) {
  const numero = String(telephone || '').replace(/[^\d]/g, '');
  if (numero.length < 8) {
    throw new ErreurWhatsapp(`Numéro de téléphone invalide : "${telephone}"`);
  }
  return numero;
}

/**
 * Construit le corps de la requête pour un template d'authentification.
 * Le code apparaît deux fois : dans le corps du message, et dans le bouton
 * de copie si le template en possède un.
 */
function corpsRequete(telephone, code) {
  const components = [
    { type: 'body', parameters: [{ type: 'text', text: code }] },
  ];

  if (AVEC_BOUTON) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    });
  }

  return {
    messaging_product: 'whatsapp',
    to: versFormatMeta(telephone),
    type: 'template',
    template: {
      name: TEMPLATE_NOM,
      language: { code: TEMPLATE_LANGUE },
      components,
    },
  };
}

/** Affiche le code dans la console (mode mock). */
function afficherEnConsole(telephone, code) {
  // eslint-disable-next-line no-console
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║          CertifTOGO — OTP (MOCK)             ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Destinataire : ${telephone.padEnd(28)} ║`);
  console.log(`║  Code OTP     : ${code.padEnd(28)} ║`);
  console.log('║  (mock WhatsApp — expiration 5 min)          ║');
  console.log('╚══════════════════════════════════════════════╝\n');
}

/**
 * Envoie un code OTP par WhatsApp.
 * @param {string} telephone - destinataire (format international)
 * @param {string} code - code OTP à 6 chiffres
 * @returns {Promise<{ success: true, mock: boolean, messageId?: string }>}
 * @throws {ErreurWhatsapp} si l'envoi réel échoue
 */
export async function envoyerCodeOtp(telephone, code) {
  if (MODE !== 'cloud') {
    afficherEnConsole(telephone, code);
    logger.info(`OTP mock envoyé à ${telephone}`);
    return { success: true, mock: true };
  }

  if (!TOKEN || !PHONE_NUMBER_ID) {
    throw new ErreurWhatsapp(
      'Configuration WhatsApp incomplète : définir WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID.',
      { code: 'CONFIG_INCOMPLETE' }
    );
  }

  const url = `https://graph.facebook.com/${VERSION_API}/${PHONE_NUMBER_ID}/messages`;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);

  let reponse;
  let charge;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpsRequete(telephone, code)),
      signal: controleur.signal,
    });
    charge = await reponse.json().catch(() => ({}));
  } catch (err) {
    const raison =
      err.name === 'AbortError'
        ? `délai dépassé (${TIMEOUT_MS} ms)`
        : err.message;
    throw new ErreurWhatsapp(`Envoi WhatsApp impossible : ${raison}`, {
      code: 'RESEAU',
    });
  } finally {
    clearTimeout(minuteur);
  }

  if (!reponse.ok) {
    const erreur = charge?.error || {};
    // On ne journalise jamais le code OTP lui-même.
    logger.error(
      `Échec envoi WhatsApp (${reponse.status}) vers ${telephone} : ` +
        `${erreur.message || 'erreur inconnue'} [code ${erreur.code ?? '?'}]`
    );
    throw new ErreurWhatsapp(erreur.message || `Erreur HTTP ${reponse.status}`, {
      code: erreur.code ?? reponse.status,
      details: erreur.error_data?.details || null,
    });
  }

  const messageId = charge?.messages?.[0]?.id || null;
  logger.info(`OTP WhatsApp envoyé à ${telephone} (message ${messageId})`);
  return { success: true, mock: false, messageId };
}
