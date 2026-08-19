// ─────────────────────────────────────────────────────────────
// Instance axios pour le front-office public (aucune authentification).
// ─────────────────────────────────────────────────────────────
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Un envoi de fichier n'est pas du JSON. Axios calcule lui-même
// « multipart/form-data; boundary=… », mais seulement si l'en-tête n'est
// pas déjà fixé — le défaut ci-dessus l'en empêcherait, et le serveur
// recevrait un corps multipart annoncé en JSON, donc aucun fichier.
api.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

export default api;
