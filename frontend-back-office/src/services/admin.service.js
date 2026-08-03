// ─────────────────────────────────────────────────────────────
// Service "admin système" côté front — stats globales, comptes, établissements.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

/** Statistiques globales de la plateforme. */
export async function statistiquesAdmin() {
  const { data } = await api.get('/admin/statistiques');
  return data.data.statistiques;
}

/** Configuration non sensible de la plateforme. */
export async function configurationAdmin() {
  const { data } = await api.get('/admin/configuration');
  return data.data.configuration;
}

// ── Utilisateurs ───────────────────────────────────────────────

export async function listerUtilisateurs({ role = '' } = {}) {
  const params = role ? { role } : {};
  const { data } = await api.get('/admin/utilisateurs', { params });
  return data.data.utilisateurs;
}

export async function creerUtilisateur(donnees) {
  const { data } = await api.post('/admin/utilisateurs', donnees);
  return data.data.utilisateur;
}

export async function definirActifUtilisateur(id, actif) {
  const { data } = await api.patch(`/admin/utilisateurs/${id}/actif`, { actif });
  return data.data.utilisateur;
}

// ── Établissements ─────────────────────────────────────────────

export async function listerEtablissements() {
  const { data } = await api.get('/admin/etablissements');
  return data.data.etablissements;
}

// La création d'un établissement N'EST PAS ici : l'agrément relève du
// ministère (`gouvernance.service`), qui attribue en même temps le code
// officiel, les habilitations et le premier agent. La route
// `POST /admin/etablissements` n'existe plus ; l'appeler donnait un 404
// silencieux derrière un bouton qui semblait fonctionner.

export async function definirStatutEtablissement(id, statut) {
  const { data } = await api.patch(`/admin/etablissements/${id}/statut`, { statut });
  return data.data.etablissement;
}
