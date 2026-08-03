// ─────────────────────────────────────────────────────────────
// Front-office public : vérification de diplômes, sans compte.
//
//   /                : saisie (empreinte, référence, QR)
//   /verifier/:code  : résultat — cible des QR codes imprimés
//
// L'ossature est celle d'un site d'État : bandeau République Togolaise,
// identité du service, pied de page institutionnel. Ce n'est pas de la
// décoration — c'est ce qui autorise un employeur à croire la réponse
// qu'il lit ici.
// ─────────────────────────────────────────────────────────────
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import VerificationPage from './pages/VerificationPage.jsx';
import { Icone } from './components/ui.jsx';

/** Bandeau d'État : filet tricolore et rattachement institutionnel. */
function BandeauEtat() {
  return (
    <div className="border-b border-gris-300 bg-white">
      <div className="h-1 w-full bg-vert" />
      <div className="mx-auto flex max-w-contenu items-center justify-between gap-4 px-5 py-2 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-wide text-gris-700">
          République Togolaise
        </p>
        <p className="hidden text-xs text-gris-500 sm:block">
          Ministère de l’Enseignement Supérieur et de la Recherche
        </p>
      </div>
    </div>
  );
}

function Entete() {
  return (
    <header className="border-b border-gris-300 bg-white">
      <div className="mx-auto flex max-w-contenu flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center bg-vert text-white">
            <Icone nom="verified" taille={22} className="filled" />
          </span>
          <span>
            <span className="block text-xl font-bold leading-tight text-gris-900">CertifTOGO</span>
            <span className="block text-sm text-gris-500">
              Registre national des diplômes — service de vérification
            </span>
          </span>
        </Link>

        <a
          href="#aide"
          className="text-base text-vert underline underline-offset-2 hover:text-vert-fonce"
        >
          Comment ça marche ?
        </a>
      </div>
    </header>
  );
}

function PiedDePage() {
  return (
    <footer className="mt-auto border-t border-gris-300 bg-white">
      <div className="mx-auto max-w-contenu px-5 py-6 lg:px-8">
        <p className="text-base font-bold text-gris-900">CertifTOGO</p>
        <p className="mt-1 max-w-3xl text-sm text-gris-500">
          Service public de vérification des diplômes délivrés par les établissements agréés de la
          République Togolaise. La vérification est gratuite, anonyme et ne nécessite aucun
          compte. Chaque consultation est comptabilisée sans identifier son auteur.
        </p>
        <p className="mt-3 text-sm text-gris-500">© République Togolaise</p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-full flex-col bg-gris-50">
      <a href="#contenu" className="lien-evitement">
        Aller au contenu
      </a>

      <BandeauEtat />
      <Entete />

      <main id="contenu" className="mx-auto w-full max-w-contenu flex-grow px-5 py-8 lg:px-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/verifier/:code" element={<VerificationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <PiedDePage />
    </div>
  );
}
