// ─────────────────────────────────────────────────────────────
// Connexion en deux étapes : numéro de téléphone, puis code à usage
// unique.
//
// Registre « service public » : bandeau d'État, un seul bloc de contenu
// centré, aucune illustration décorative. Une page de connexion
// administrative n'a pas à vendre le produit — l'agent n'a pas le choix
// de l'utiliser. Elle doit être claire, rapide et accessible.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { demanderOtp, verifierOtp } from '../../services/auth.service.js';
import OTPInput from '../../components/ui/OTPInput.jsx';
import BandeauEtat from '../../components/layout/BandeauEtat.jsx';
import { Bouton, Champ, Saisie, Encart, Icone } from '../../components/ui/index.jsx';

const DELAI_RENVOI = 30;

export default function LoginPage() {
  const [etape, setEtape] = useState(1);
  const [telephone, setTelephone] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [compteur, setCompteur] = useState(0);
  const [codeDev, setCodeDev] = useState('');
  const verificationEnCours = useRef(false);

  const { connecter, estConnecte } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (estConnecte) navigate('/', { replace: true });
  }, [estConnecte, navigate]);

  useEffect(() => {
    if (compteur <= 0) return undefined;
    const timer = setInterval(() => setCompteur((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [compteur]);

  useEffect(() => {
    if (etape === 2 && code.length === 6) verifierCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, etape]);

  const message = (err) =>
    err.response?.data?.error?.message || 'Une erreur est survenue. Réessayez.';

  async function soumettreTelephone(e) {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      const data = await demanderOtp(telephone.trim());
      setEtape(2);
      setCode('');
      setCodeDev(data.code_dev || '');
      setCompteur(DELAI_RENVOI);
    } catch (err) {
      setErreur(message(err));
    } finally {
      setChargement(false);
    }
  }

  async function renvoyerCode() {
    if (compteur > 0) return;
    setErreur('');
    setCode('');
    try {
      const data = await demanderOtp(telephone.trim());
      setCodeDev(data.code_dev || '');
      setCompteur(DELAI_RENVOI);
    } catch (err) {
      setErreur(message(err));
    }
  }

  async function verifierCode() {
    if (verificationEnCours.current || code.length !== 6) return;
    verificationEnCours.current = true;
    setErreur('');
    setChargement(true);
    try {
      const { token, utilisateur } = await verifierOtp(telephone.trim(), code);
      connecter(token, utilisateur);
      navigate('/', { replace: true });
    } catch (err) {
      setErreur(message(err));
      setCode('');
    } finally {
      setChargement(false);
      verificationEnCours.current = false;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gris-50">
      <a href="#connexion" className="lien-evitement">
        Aller au formulaire de connexion
      </a>
      <BandeauEtat />

      <header className="border-b border-gris-300 bg-white">
        <div className="mx-auto flex max-w-contenu items-center gap-3 px-5 py-3 lg:px-8">
          <span className="flex h-9 w-9 items-center justify-center bg-vert text-white">
            <Icone nom="verified" taille={20} className="filled" />
          </span>
          <span>
            <span className="block text-lg font-bold leading-tight">CertifTOGO</span>
            <span className="block text-xs text-gris-500">
              Ministère de l'Enseignement Supérieur
            </span>
          </span>
        </div>
      </header>

      <main id="connexion" className="mx-auto w-full max-w-xl flex-1 px-5 py-10 lg:px-8">
        <h1 className="text-xl">Accès à l'espace privé</h1>
        <p className="mt-1 text-base text-gris-500">
          Réservé aux établissements agréés, aux agents du ministère, aux diplômés et à
          l'administration. La vérification d'un diplôme, elle, ne nécessite aucun compte.
        </p>

        <div className="mt-6 border border-gris-300 bg-white p-6">
          {/* Étape courante annoncée en toutes lettres plutôt que par des
              pastilles : un lecteur d'écran doit pouvoir l'énoncer. */}
          <p className="mb-4 text-sm font-bold uppercase tracking-wide text-gris-500">
            Étape {etape} sur 2 — {etape === 1 ? 'identification' : 'vérification'}
          </p>

          {erreur && (
            <div className="mb-4">
              <Encart ton="erreur">{erreur}</Encart>
            </div>
          )}

          {etape === 1 && (
            <form onSubmit={soumettreTelephone} className="space-y-5">
              <Champ
                label="Numéro de téléphone"
                htmlFor="telephone"
                requis
                aide="Le numéro communiqué à votre établissement ou au ministère. Format : +228 90 00 00 01."
              >
                <Saisie
                  id="telephone"
                  type="tel"
                  autoFocus
                  required
                  autoComplete="tel"
                  placeholder="+228 90 00 00 01"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                />
              </Champ>

              <Encart ton="info">
                Un code à usage unique vous sera envoyé par WhatsApp. Il est valable 5 minutes.
              </Encart>

              <Bouton type="submit" icone="send" enCours={chargement} className="w-full">
                Recevoir le code
              </Bouton>
            </form>
          )}

          {etape === 2 && (
            <div className="space-y-5">
              <p className="text-base text-gris-700">
                Un code à 6 chiffres a été envoyé au{' '}
                <strong className="text-gris-900">{telephone}</strong>.
              </p>

              {codeDev && (
                <Encart ton="alerte" titre="Environnement de développement">
                  Code : <code className="font-mono font-bold tracking-widest">{codeDev}</code>{' '}
                  <button
                    type="button"
                    onClick={() => setCode(codeDev)}
                    className="ml-2 underline underline-offset-2"
                  >
                    Utiliser ce code
                  </button>
                </Encart>
              )}

              <OTPInput
                valeur={code}
                onChange={setCode}
                disabled={chargement}
                erreur={Boolean(erreur)}
              />

              {chargement && (
                <p className="flex items-center gap-2 text-base text-gris-500">
                  <Icone nom="progress_activity" taille={18} /> Vérification en cours…
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gris-200 pt-4">
                {compteur > 0 ? (
                  <p className="text-sm text-gris-500">
                    Nouveau code possible dans{' '}
                    <span className="tabulaire font-bold">{compteur} s</span>
                  </p>
                ) : (
                  <Bouton variante="discret" icone="refresh" onClick={renvoyerCode}>
                    Renvoyer le code
                  </Bouton>
                )}
                <Bouton
                  variante="discret"
                  icone="arrow_back"
                  onClick={() => {
                    setEtape(1);
                    setCode('');
                    setErreur('');
                  }}
                >
                  Changer de numéro
                </Bouton>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5">
          <Encart ton="info" titre="Vous n'avez pas de compte ?">
            Les comptes ne se créent pas en ligne. Un établissement obtient son accès en déposant
            une demande d'intégration auprès du ministère ; un diplômé reçoit le sien
            automatiquement à la certification de son premier diplôme.
          </Encart>
        </div>
      </main>
    </div>
  );
}
