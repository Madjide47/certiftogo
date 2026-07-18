// ─────────────────────────────────────────────────────────────
// Accueil public : saisie d'une empreinte SHA-256 ou d'une référence
// DIP-AAAA-XXXXX, puis redirection vers la page de résultat.
// ─────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import QrScanner from '../components/QrScanner.jsx';

/**
 * Extrait le code de vérification d'un contenu de QR : le QR d'un diplôme
 * encode l'URL publique `…/verifier/<hash>` ; tout autre texte est traité
 * comme un hash ou une référence saisis tels quels.
 */
function extraireCode(texte) {
  const brut = texte.trim();
  try {
    const url = new URL(brut);
    const segment = url.pathname.match(/\/verifier\/([^/]+)/);
    if (segment) return decodeURIComponent(segment[1]);
  } catch {
    /* pas une URL : on garde le texte brut */
  }
  return brut;
}

export default function HomePage() {
  const [valeur, setValeur] = useState('');
  const [scannerOuvert, setScannerOuvert] = useState(false);
  const navigate = useNavigate();

  function soumettre(e) {
    e.preventDefault();
    const code = valeur.trim();
    if (!code) return;
    navigate(`/verifier/${encodeURIComponent(code)}`);
  }

  const surQrDetecte = useCallback(
    (texte) => {
      const code = extraireCode(texte);
      if (!code) return;
      setScannerOuvert(false);
      navigate(`/verifier/${encodeURIComponent(code)}?methode=qr`);
    },
    [navigate]
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
      <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-soft-md">
        <Icon name="verified_user" filled size={34} />
      </div>

      <div className="text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-on-surface md:text-5xl">
          Vérifier un diplôme
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-on-surface-variant">
          Saisissez l'empreinte (hash) ou la référence du diplôme, ou scannez son QR code. La
          vérification est instantanée, gratuite et anonyme.
        </p>
      </div>

      <form onSubmit={soumettre} className="mt-10 w-full rounded-2xl bg-white p-6 shadow-soft-md ring-1 ring-outline-variant/20">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Empreinte SHA-256 ou référence (DIP-AAAA-XXXXX)
          </span>
          <div className="relative mt-2">
            <Icon
              name="search"
              size={22}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50"
            />
            <input
              autoFocus
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
              placeholder="ex. DIP-2024-00042 ou 7b1309…"
              className="w-full rounded-xl border border-outline-variant/40 bg-white py-3.5 pl-11 pr-4 text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/20"
            />
          </div>
        </label>
        <button
          type="submit"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-[0.99]"
        >
          <Icon name="search" size={20} /> Vérifier
        </button>

        <div className="my-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant/60">
          <span className="h-px flex-grow bg-outline-variant/30" /> ou <span className="h-px flex-grow bg-outline-variant/30" />
        </div>

        <button
          type="button"
          onClick={() => setScannerOuvert(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 py-3.5 font-semibold text-primary transition-all hover:bg-primary/5 active:scale-[0.99]"
        >
          <Icon name="qr_code_scanner" size={20} /> Scanner le QR code
        </button>
      </form>

      {scannerOuvert && <QrScanner onResultat={surQrDetecte} onFermer={() => setScannerOuvert(false)} />}

      <div className="mt-6 flex items-center gap-2 text-sm text-on-surface-variant/80">
        <Icon name="lock" size={18} /> Aucun compte requis — données personnelles jamais stockées sur la blockchain.
      </div>
    </div>
  );
}
