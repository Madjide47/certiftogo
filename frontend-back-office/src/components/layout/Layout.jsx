// ─────────────────────────────────────────────────────────────
// Coquille du back-office, calquée sur les conventions des portails de
// l'administration togolaise :
//
//   bandeau d'État ── en-tête de service ── navigation ── contenu ── pied
//
// Le bandeau d'État en tête n'est pas décoratif : il indique à l'agent
// qu'il se trouve sur un service officiel, avant même qu'il ne lise le
// nom de l'application.
// ─────────────────────────────────────────────────────────────
import { Outlet } from 'react-router-dom';
import BandeauEtat from './BandeauEtat.jsx';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import PiedDePage from './PiedDePage.jsx';

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-gris-50">
      {/* Premier élément focusable : indispensable à la navigation clavier. */}
      <a href="#contenu" className="lien-evitement">
        Aller au contenu principal
      </a>

      <BandeauEtat />
      <Header />

      <div className="flex flex-1">
        <Sidebar />
        <main id="contenu" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-contenu px-5 py-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      <PiedDePage />
    </div>
  );
}
