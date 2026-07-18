// ─────────────────────────────────────────────────────────────
// Front-office public : vérification de diplômes (sans compte).
//  - /                : accueil (saisie hash / référence)
//  - /verifier/:code  : résultat de vérification (cible des QR codes)
// ─────────────────────────────────────────────────────────────
import { Routes, Route, Navigate, Link, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import VerificationPage from './pages/VerificationPage.jsx';
import Icon from './components/Icon.jsx';

function Header() {
  return (
    <nav className="glass-panel fixed top-0 z-50 w-full border-b border-outline-variant/30 shadow-sm">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 md:px-10">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-extrabold text-primary md:text-xl">
          <Icon name="verified_user" filled size={30} className="shrink-0" />
          <span className="truncate">
            CertifTOGO <span className="hidden font-semibold text-on-surface-variant sm:inline">/ Vérification</span>
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `text-xs font-semibold uppercase tracking-wide transition-colors ${
                isActive ? 'border-b-2 border-primary pb-1 text-primary' : 'text-on-surface-variant hover:text-primary'
              }`
            }
          >
            Vérifier
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-outline-variant/20 bg-surface-container-low">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row md:px-10">
        <div className="font-display text-lg font-bold text-primary">CertifTOGO</div>
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          <a className="text-on-surface-variant hover:text-primary" href="#">Mentions légales</a>
          <a className="text-on-surface-variant hover:text-primary" href="#">Confidentialité</a>
          <a className="text-on-surface-variant hover:text-primary" href="#">Contact</a>
        </div>
        <div className="text-center text-sm text-on-surface-variant md:text-right">
          © République Togolaise — CertifTOGO.
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="flex flex-grow flex-col px-4 pb-16 pt-24 md:px-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/verifier/:code" element={<VerificationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
