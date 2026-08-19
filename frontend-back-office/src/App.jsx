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
import { entreesPour, LIBELLES_ROLES } from './config/navigation.js';
import { pagePour, PAGES_PAR_ROLE } from './config/pages.jsx';

/**
 * Chemins routables d'un rôle : ses entrées de navigation, PLUS les pages
 * qu'il a le droit d'ouvrir sans figurer dans la barre latérale.
 *
 * Les notifications sont dans ce second cas : on y accède par la cloche de
 * l'en-tête, présente sur tous les écrans. Router à partir de la seule
 * navigation renvoyait la cloche vers le tableau de bord — un compteur qui
 * annonce trois messages et ne mène nulle part.
 */
function cheminsPour(role) {
  const chemins = entreesPour(role).map((e) => e.chemin);
  const enPlus = Object.keys(PAGES_PAR_ROLE[role] || {}).filter((c) => !chemins.includes(c));
  return [...chemins, ...enPlus];
}

// Rend les routes internes correspondant au rôle de l'utilisateur connecté.
// La navigation étant désormais groupée par rubriques, on l'aplatit ici :
// le routage se moque des rubriques, il ne connaît que des chemins.
function RoutesInternes() {
  const { utilisateur } = useAuth();
  const role = utilisateur?.role;
  const entrees = entreesPour(role);

  return (
    <Routes>
      <Route element={<Layout />}>
        {cheminsPour(role).map((chemin) => {
          // Vraie page si elle existe pour ce rôle, sinon placeholder.
          const Page = pagePour(role, chemin);
          const libelle = entrees.find((e) => e.chemin === chemin)?.libelle || chemin;
          return (
            <Route
              key={chemin}
              path={chemin}
              element={
                Page ? (
                  <Page />
                ) : (
                  <PlaceholderPage
                    titre={libelle}
                    description={`Espace ${LIBELLES_ROLES[role]} — ${libelle}.`}
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
