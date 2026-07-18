// ─────────────────────────────────────────────────────────────
// Route protégée : redirige vers /login si l'utilisateur n'est pas connecté.
// Peut aussi restreindre l'accès par rôle (prop `roles`).
// ─────────────────────────────────────────────────────────────
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ProtectedRoute({ children, roles }) {
  const { estConnecte, utilisateur, chargement } = useAuth();
  const location = useLocation();

  // Tant qu'on vérifie le token, on n'affiche rien (évite un flash de /login).
  if (chargement) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    );
  }

  if (!estConnecte) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Restriction par rôle éventuelle.
  if (roles && !roles.includes(utilisateur.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
