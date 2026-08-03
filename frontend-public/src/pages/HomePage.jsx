// ─────────────────────────────────────────────────────────────
// Accueil du service de vérification.
//
// Qui arrive ici ? Un employeur, un service RH, une administration
// étrangère, une université — quelqu'un qui a un document sous les yeux
// et un doute. Il n'a pas de compte, il n'en veut pas, et il ne
// reviendra peut-être jamais. L'écran doit donc, en un seul regard :
// dire ce qu'on peut saisir, et dire ce que la réponse prouvera.
//
// La saisie accepte trois choses parce que le document en porte trois :
// un QR code, une empreinte, une référence. Refuser l'une d'elles
// obligerait à retaper 64 caractères hexadécimaux à la main.
// ─────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QrScanner from '../components/QrScanner.jsx';
import { Icone, Bouton, Encart } from '../components/ui.jsx';

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
  const naviguer = useNavigate();

  function soumettre(evenement) {
    evenement.preventDefault();
    const code = valeur.trim();
    if (!code) return;
    naviguer(`/verifier/${encodeURIComponent(code)}`);
  }

  const surQrDetecte = useCallback(
    (texte) => {
      const code = extraireCode(texte);
      if (!code) return;
      setScannerOuvert(false);
      naviguer(`/verifier/${encodeURIComponent(code)}?methode=qr`);
    },
    [naviguer]
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl">Vérifier l’authenticité d’un diplôme</h1>
      <p className="mt-2 max-w-2xl text-base text-gris-700">
        Ce service interroge le registre national tenu par le ministère. Il répond sur les
        diplômes certifiés par CertifTOGO : un diplôme délivré avant la mise en service, ou par un
        établissement non agréé, n’y figure pas.
      </p>

      <form onSubmit={soumettre} className="mt-6 border border-gris-300 bg-white p-5">
        <label htmlFor="code" className="block text-base font-medium text-gris-900">
          Empreinte, référence ou QR code du document
        </label>
        <p className="mt-0.5 text-sm text-gris-500">
          L’empreinte est la suite de 64 caractères imprimée sur le diplôme ; la référence a la
          forme DIP-2026-00042.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            id="code"
            autoFocus
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            placeholder="DIP-2026-00042 ou 7b1309a4…"
            className="tabulaire min-w-[16rem] flex-1 rounded border border-gris-500 bg-white px-3 py-2.5 text-base text-gris-900 placeholder:text-gris-500 focus:border-vert"
          />
          <Bouton type="submit" icone="search" disabled={!valeur.trim()}>
            Vérifier
          </Bouton>
          <Bouton variante="secondaire" icone="qr_code_scanner" onClick={() => setScannerOuvert(true)}>
            Scanner le QR
          </Bouton>
        </div>
      </form>

      {scannerOuvert && (
        <QrScanner onResultat={surQrDetecte} onFermer={() => setScannerOuvert(false)} />
      )}

      <section id="aide" className="mt-8">
        <h2 className="text-lg">Ce que la vérification établit</h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <article className="border border-gris-300 bg-white p-4">
            <Icone nom="fingerprint" taille={24} className="text-vert" />
            <h3 className="mt-2 text-base font-bold text-gris-900">L’empreinte du document</h3>
            <p className="mt-1 text-sm text-gris-700">
              Les données du diplôme produisent une empreinte unique. Modifier une note, un nom ou
              une date change l’empreinte : le document ne correspond plus.
            </p>
          </article>

          <article className="border border-gris-300 bg-white p-4">
            <Icone nom="link" taille={24} className="text-vert" />
            <h3 className="mt-2 text-base font-bold text-gris-900">L’inscription en blockchain</h3>
            <p className="mt-1 text-sm text-gris-700">
              Cette empreinte est inscrite sur une chaîne publique. Personne — pas même le
              ministère — ne peut réécrire une inscription passée.
            </p>
          </article>

          <article className="border border-gris-300 bg-white p-4">
            <Icone nom="gpp_bad" taille={24} className="text-vert" />
            <h3 className="mt-2 text-base font-bold text-gris-900">L’état actuel</h3>
            <p className="mt-1 text-sm text-gris-700">
              Un diplôme peut être révoqué après coup. La vérification donne l’état du jour, pas
              celui du jour de l’impression.
            </p>
          </article>
        </div>

        <div className="mt-4">
          <Encart ton="info" titre="Ce que la vérification n’établit pas">
            Elle atteste qu’un diplôme correspondant existe au registre et qu’il n’a pas été
            modifié. Elle ne dit pas que la personne qui vous présente le document en est la
            titulaire : comparez le nom affiché avec une pièce d’identité.
          </Encart>
        </div>
      </section>

      <p className="mt-6 flex items-start gap-1.5 text-sm text-gris-500">
        <Icone nom="lock" taille={16} className="mt-0.5 shrink-0" />
        Aucun compte n’est requis et aucune donnée personnelle n’est inscrite sur la blockchain :
        seule l’empreinte l’est. Votre consultation est comptabilisée de façon anonyme.
      </p>
    </div>
  );
}
