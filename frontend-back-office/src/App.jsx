// ─────────────────────────────────────────────────────────────
// Définition des routes de l'application back-office.
//
// - /login          : page publique de connexion (OTP)
// - /*              : espace protégé (Layout + pages selon le rôle)
//
// Les pages internes sont, en Phase 1, des placeholders générés à partir
// de la configuration de navigation (sidebar et routes restent synchronisées).
// Elles seront remplacées par les vraies pages dans les phases suivantes.
// ─────────────────────────────────────────────────────────────
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/layout/Layout.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import PlaceholderPage from './components/PlaceholderPage.jsx';
import { NAVIGATION_PAR_ROLE, LIBELLES_ROLES } from './config/navigation.js';
import { pagePour } from './config/pages.jsx';

// Rend les routes internes correspondant au rôle de l'utilisateur connecté.
function RoutesInternes() {
  const { utilisateur } = useAuth();
  const role = utilisateur?.role;
  const entrees = NAVIGATION_PAR_ROLE[role] || [];

  return (
    <Routes>
      <Route element={<Layout />}>
        {entrees.map((entree) => {
          // Vraie page si elle existe pour ce rôle, sinon placeholder.
          const Page = pagePour(role, entree.chemin);
          return (
            <Route
              key={entree.chemin}
              path={entree.chemin}
              element={
                Page ? (
                  <Page />
                ) : (
                  <PlaceholderPage
                    titre={entree.libelle}
                    description={`Espace ${LIBELLES_ROLES[role]} — ${entree.libelle}.`}
                  />
                )
              }
            />
          );
        })}
        {/* Toute route inconnue renvoie vers le tableau de bord. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Page publique */}
      <Route path="/login" element={<LoginPage />} />

      {/* Tout le reste est protégé */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <RoutesInternes />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
