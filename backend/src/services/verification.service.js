// ─────────────────────────────────────────────────────────────
// Service "vérification" — vérification publique d'un diplôme (sans compte).
// Recherche par empreinte SHA-256 (64 hex) OU par référence DIP-AAAA-XXXXX,
// journalise la tentative, et renvoie un résultat public (sans données
// sensibles comme la signature ou le snapshot complet).
// ─────────────────────────────────────────────────────────────
import * as diplomeModel from '../models/diplome.model.js';
import * as verificationModel from '../models/verification.model.js';
import * as blockchain from './blockchain.service.js';
import * as notifications from './notification.service.js';
import { ErreurApp } from '../utils/errors.js';

const METHODES = ['hash', 'qr', 'pdf'];
const RE_HASH = /^[0-9a-f]{64}$/i;

/** Vue publique d'un diplôme (champs non sensibles uniquement). */
function vuePublique(d, resultat) {
  return {
    resultat, // 'authentique' | 'revoque'
    reference: d.reference,
    statut: d.statut,
    titulaire: `${d.candidat_prenom || ''} ${d.candidat_nom || ''}`.trim(),
    type_diplome: d.type_diplome,
    mention: d.mention,
    filiere: d.filiere,
    etablissement: d.etablissement_nom,
    date_certification: d.date_certification,
    hash: d.hash_sha256,
    transaction_id: d.transaction_id,
    // Le QR encode l'adresse publique de vérification : il est fait pour
    // circuler, et le rendre disponible ici évite au vérificateur de
    // retaper une référence pour la transmettre à un tiers.
    qr_url: d.qr_code_url,
    motif_revocation: d.statut === 'revoque' ? d.motif_revocation : null,
    version: d.version,
    message:
      resultat === 'en_attente_ancrage'
        ? 'Diplôme délivré par le ministère. Son enregistrement sur la blockchain est en cours ; la preuve publique sera disponible sous peu.'
        : resultat === 'remplace'
          ? 'Ce document a été remplacé par une version corrigée. Le diplôme reste valide : demandez la version en vigueur à son titulaire.'
          : null,
  };
}

/**
 * Vérifie un diplôme par sa valeur (hash ou référence).
 * @param {string} valeur - empreinte SHA-256 ou référence DIP-AAAA-XXXXX
 * @param {{ methode?: string, ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<object>} résultat public
 */
export async function verifier(valeur, { methode = 'hash', ip = null, userAgent = null } = {}) {
  const cle = typeof valeur === 'string' ? valeur.trim() : '';
  const methodeValide = METHODES.includes(methode) ? methode : 'hash';

  let diplome = null;
  if (cle) {
    diplome = RE_HASH.test(cle)
      ? await diplomeModel.trouverParHash(cle.toLowerCase())
      : await diplomeModel.trouverParReference(cle.toUpperCase());
  }

  // Un diplôme en attente d'ancrage est bien délivré, mais sa preuve
  // publique n'est pas encore publiée. Le dire franchement vaut mieux que
  // de l'annoncer « authentique » sans pouvoir l'étayer on-chain.
  const resultat = !diplome
    ? 'introuvable'
    : diplome.statut === 'revoque'
      ? 'revoque'
      : diplome.statut === 'en_attente_ancrage'
        ? 'en_attente_ancrage'
        : diplome.statut === 'remplace'
          ? 'remplace'
          : 'authentique';

  // Journalisation (best-effort : ne bloque pas la réponse en cas d'échec).
  try {
    await verificationModel.enregistrer({
      diplome_id: diplome?.id || null,
      hash_recherche: cle.slice(0, 120),
      methode: methodeValide,
      adresse_ip: ip,
      user_agent: userAgent,
      resultat,
    });
  } catch {
    /* on n'échoue pas la vérification si le log échoue */
  }

  if (!diplome) return { resultat: 'introuvable' };

  // Le titulaire est averti que son diplôme a été consulté (I-10). Hors
  // du chemin de réponse : un employeur n'a pas à attendre l'envoi d'une
  // notification qui ne le concerne pas.
  avertirTitulaire(diplome).catch(() => {
    /* déjà journalisé par le service de notifications */
  });

  const vue = vuePublique(diplome, resultat);
  vue.ancrage_blockchain = await lireAncrage(diplome.hash_sha256);

  // Un employeur qui scanne un ancien PDF doit être renvoyé vers la
  // version en vigueur, pas laissé avec un document périmé.
  if (resultat === 'remplace') {
    const courante = await diplomeModel.versionCourante(diplome.id);
    vue.version_en_vigueur = courante
      ? { reference: courante.reference, version: courante.version, statut: courante.statut }
      : null;
  }

  return vue;
}

// ─────────────────────────────────────────────────────────────
// Vérification par lot.
//
// Un employeur qui recrute une promotion entière, un service des
// équivalences qui instruit un dossier de plusieurs diplômes : vérifier
// vaut la peine seulement si vérifier est plus rapide que téléphoner.
// Un par un, c'est un formulaire à remplir vingt fois — en pratique,
// personne ne le fait, et la fraude passe.
//
// C'est aussi la plus petite forme utile de l'API d'intégration (N-04) :
// elle ouvre l'usage machine sans construire encore le dispositif de
// clés, de quotas et de webhooks que celui-ci suppose.
// ─────────────────────────────────────────────────────────────

/**
 * Plafond de codes par appel. Il n'est pas là pour économiser la base —
 * la requête est indexée — mais pour empêcher qu'un appel unique
 * contourne la limitation de débit et serve à énumérer les références.
 */
const MAX_CODES_PAR_LOT = 50;

/**
 * Vérifications menées de front. En mode `onchain`, chaque vérification
 * comporte une lecture RPC ; enchaînées, cinquante lectures tiendraient
 * une minute. Toutes lancées ensemble, le fournisseur RPC nous limite.
 */
const CONCURRENCE = 5;

/**
 * Vérifie plusieurs diplômes en un appel.
 *
 * Chaque code est traité indépendamment : un code introuvable n'invalide
 * pas les autres, il ressort simplement `introuvable`. L'ordre de la
 * réponse suit celui de la demande, pour que l'appelant puisse rapprocher
 * les résultats de sa propre liste sans se fier aux références.
 *
 * @param {string[]} codes
 * @param {{ methode?: string, ip?: string, userAgent?: string }} [ctx]
 * @returns {Promise<{ demandes: number, resultats: object[], synthese: object }>}
 */
export async function verifierLot(codes, ctx = {}) {
  if (!Array.isArray(codes) || codes.length === 0) {
    throw new ErreurApp(
      400,
      'CODES_REQUIS',
      'Fournissez un tableau « codes » contenant au moins une référence ou empreinte.'
    );
  }

  if (codes.length > MAX_CODES_PAR_LOT) {
    throw new ErreurApp(
      400,
      'LOT_TROP_GRAND',
      `Un appel porte au plus ${MAX_CODES_PAR_LOT} codes ; ${codes.length} ont été fournis.`,
      { maximum: MAX_CODES_PAR_LOT, fournis: codes.length }
    );
  }

  const demandes = codes.map((c) => (typeof c === 'string' ? c.trim() : ''));

  // Les doublons sont fréquents dans une liste collée depuis un tableur.
  // On ne vérifie qu'une fois et on redistribue : sinon le titulaire
  // reçoit plusieurs avis de consultation pour un seul examen, et le
  // journal compte des vérifications qui n'ont pas eu lieu.
  const uniques = [...new Set(demandes)];
  const parCode = new Map();

  for (let i = 0; i < uniques.length; i += CONCURRENCE) {
    const tranche = uniques.slice(i, i + CONCURRENCE);
    const vues = await Promise.all(tranche.map((code) => verifier(code, ctx)));
    tranche.forEach((code, j) => parCode.set(code, vues[j]));
  }

  const resultats = demandes.map((code, index) => ({
    index,
    code,
    ...parCode.get(code),
  }));

  const synthese = resultats.reduce(
    (acc, r) => ({ ...acc, [r.resultat]: (acc[r.resultat] || 0) + 1 }),
    {}
  );

  return { demandes: demandes.length, verifies: uniques.length, resultats, synthese };
}

/**
 * Fenêtre de regroupement des avis de consultation.
 *
 * Un recruteur qui recharge la page, un QR scanné trois fois pendant un
 * entretien : sans regroupement, le titulaire reçoit une rafale d'avis
 * pour une seule vérification, et finit par tous les désactiver. Une
 * alerte qu'on éteint ne protège plus personne.
 */
const FENETRE_AVIS_CONSULTATION_H = 6;

/** Avertit le titulaire qu'un tiers a consulté son diplôme (I-10). */
async function avertirTitulaire(diplome) {
  const dejaAverti = await verificationModel.derniereNotificationConsultation(
    diplome.id,
    FENETRE_AVIS_CONSULTATION_H
  );
  if (dejaAverti) return;

  await notifications.notifierDiplome(
    notifications.EVENEMENTS.QR_CONSULTE,
    diplome.candidat_id,
    {
      reference: diplome.reference,
      date: new Date().toLocaleDateString('fr-FR'),
      entite: 'diplomes',
      entite_id: diplome.id,
    }
  );
}

/**
 * Lit l'état ancré on-chain (mode onchain). Best-effort : si le nœud est
 * injoignable ou le mode est "mock", renvoie un objet indicatif sans échouer.
 * @returns {Promise<{ verifie: boolean, valide?: boolean, revoque?: boolean,
 *   date_certification?: number|null } | null>}
 */
async function lireAncrage(hash) {
  if (!blockchain.estOnChain()) {
    return { verifie: false, mode: 'mock' };
  }
  try {
    const onchain = await blockchain.verifierOnChain(hash);
    if (!onchain || !onchain.existe) return { verifie: true, ancre: false };
    return {
      verifie: true,
      ancre: true,
      valide: onchain.valide,
      revoque: onchain.revoque,
      date_certification: onchain.dateCertification,
    };
  } catch {
    // Nœud injoignable : on ne bloque pas la vérification DB.
    return { verifie: false, indisponible: true };
  }
}
