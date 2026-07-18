// ─────────────────────────────────────────────────────────────
// Instance axios centralisée + intercepteurs.
// - Injecte automatiquement le JWT dans l'en-tête Authorization.
// - Redirige vers /login si le serveur renvoie 401.
// ─────────────────────────────────────────────────────────────
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const TOKEN_STORAGE_KEY = 'certiftogo_token';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Requête sortante : ajoute le token s'il existe.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Réponse entrante : gère l'expiration de session.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      // Évite une boucle si on est déjà sur /login.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
