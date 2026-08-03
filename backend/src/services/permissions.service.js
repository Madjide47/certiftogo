// ─────────────────────────────────────────────────────────────
// Matrice des permissions internes à un établissement (CDC §9.2.5).
//
// C'est ce fichier qui fait autorité — les tables `permissions` et
// `roles_permissions` en sont le reflet consultable, pour l'audit et un
// futur écran d'administration.
//
// Principe : celui qui SAISIT n'est pas celui qui ENGAGE l'établissement.
// Un agent de saisie produit la donnée, un chef de scolarité la contrôle,
// seul le directeur transmet au ministère.
// ─────────────────────────────────────────────────────────────
import { query } from '../config/database.js';
import { ErreurApp } from '../utils/errors.js';

export const SOUS_ROLES = ['agent_saisie', 'chef_scolarite', 'directeur'];
export const MODES_WORKFLOW = ['simple', 'hierarchique'];

export const PERMISSIONS = {
  agent_saisie: [
    'candidat.creer',
    'candidat.modifier',
    'promotion.creer',
    'promotion.modifier',
    'promotion.inscrire',
    'promotion.importer',
  ],
  chef_scolarite: [
    'candidat.creer',
    'candidat.modifier',
    'candidat.supprimer',
    'structure.gerer',
    'promotion.creer',
    'promotion.modifier',
    'promotion.supprimer',
    'promotion.inscrire',
    'promotion.importer',
    'promotion.resultat',
    'promotion.controler',
    'promotion.valider_interne',
  ],
  directeur: [
    'candidat.creer',
    'candidat.modifier',
    'candidat.supprimer',
    'structure.gerer',
    'promotion.creer',
    'promotion.modifier',
    'promotion.supprimer',
    'promotion.inscrire',
    'promotion.importer',
    'promotion.resultat',
    'promotion.controler',
    'promotion.valider_interne',
    'promotion.transmettre',
    'agent.creer',
  ],
};

/**
 * Transitions internes, en mode hiérarchique.
 * En mode simple, `ouverte → transmise` reste direct.
 */
export const TRANSITIONS_INTERNES = {
  brouillon: ['ouverte'],
  ouverte: ['brouillon', 'controle_interne'],
  controle_interne: ['ouverte', 'validee_interne'],
  validee_interne: ['controle_interne'], // la transmission passe par son endpoint
  transmise: ['ouverte'],
  certifiee: ['cloturee'],
  cloturee: [],
};

const cacheModes = new Map();

/** Mode de fonctionnement d'un établissement, mis en cache par requête. */
export async function modeWorkflow(etablissement_id) {
  if (!etablissement_id) return 'simple';
  if (cacheModes.has(etablissement_id)) return cacheModes.get(etablissement_id);

  const { rows } = await query(`SELECT mode_workflow FROM etablissements WHERE id = $1`, [
    etablissement_id,
  ]);
  const mode = rows[0]?.mode_workflow || 'simple';
  cacheModes.set(etablissement_id, mode);
  // Cache volontairement court : le mode change rarement, mais un
  // changement ne doit pas attendre un redémarrage.
  setTimeout(() => cacheModes.delete(etablissement_id), 30_000).unref?.();
  return mode;
}

export function viderCache() {
  cacheModes.clear();
}

/**
 * L'utilisateur détient-il la permission demandée ?
 *
 * En mode simple, tout agent de l'établissement peut tout faire : imposer
 * une hiérarchie à une scolarité d'une seule personne la bloquerait.
 */
export async function detient(utilisateur, permission) {
  if (utilisateur.role !== 'etablissement') return false;

  const mode = await modeWorkflow(utilisateur.etablissement_id);
  if (mode === 'simple') return true;

  const sousRole = utilisateur.sous_role || 'agent_saisie';
  return (PERMISSIONS[sousRole] || []).includes(permission);
}

/** Lève une erreur explicite si la permission manque. */
export async function exiger(utilisateur, permission) {
  if (await detient(utilisateur, permission)) return;

  const sousRole = utilisateur.sous_role || 'agent_saisie';
  throw new ErreurApp(
    403,
    'PERMISSION_REFUSEE',
    `Votre profil « ${sousRole} » ne permet pas cette action (${permission}).`
  );
}

/** Middleware : `requirePermission('promotion.transmettre')`. */
export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      await exiger(req.utilisateur, permission);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Vue lisible du profil courant — sert à l'interface pour masquer ce qui est interdit. */
export async function profil(utilisateur) {
  const mode = await modeWorkflow(utilisateur.etablissement_id);
  const sousRole = utilisateur.sous_role || 'agent_saisie';

  return {
    role: utilisateur.role,
    sous_role: sousRole,
    mode_workflow: mode,
    permissions:
      mode === 'simple'
        ? [...new Set(Object.values(PERMISSIONS).flat())]
        : PERMISSIONS[sousRole] || [],
  };
}
