// ─────────────────────────────────────────────────────────────
// Libellés lisibles des énumérations métier (front public).
// ─────────────────────────────────────────────────────────────

export const LIBELLES_TYPE_DIPLOME = {
  licence: 'Licence',
  master: 'Master',
  doctorat: 'Doctorat',
  certificat: 'Certificat',
  bts: 'BTS',
};

export const LIBELLES_MENTION = {
  passable: 'Passable',
  assez_bien: 'Assez bien',
  bien: 'Bien',
  tres_bien: 'Très bien',
  excellent: 'Excellent',
};

/** Extrait un message d'erreur lisible d'une erreur axios. */
export function messageErreur(err, defaut = 'Une erreur est survenue.') {
  return err?.response?.data?.error?.message || defaut;
}
