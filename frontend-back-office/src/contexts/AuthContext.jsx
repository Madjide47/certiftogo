// ─────────────────────────────────────────────────────────────
// Contexte d'authentification global.
// Gère : le token JWT (localStorage), l'utilisateur courant,
// et les actions connexion/déconnexion.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { TOKEN_STORAGE_KEY } from '../services/api.js';
import { recupererMoi } from '../services/auth.service.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);

  // Au démarrage : si un token existe, on récupère l'utilisateur.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setChargement(false);
      return;
    }
    recupererMoi()
      .then((u) => setUtilisateur(u))
      .catch(() => localStorage.removeItem(TOKEN_STORAGE_KEY))
      .finally(() => setChargement(false));
  }, []);

  /** Enregistre la session après une vérification OTP réussie. */
  const connecter = useCallback((token, u) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setUtilisateur(u);
  }, []);

  /** Déconnecte l'utilisateur. */
  const deconnecter = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUtilisateur(null);
  }, []);

  const value = {
    utilisateur,
    chargement,
    estConnecte: Boolean(utilisateur),
    connecter,
    deconnecter,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook d'accès au contexte d'authentification. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé dans un <AuthProvider>.');
  }
  return ctx;
}
