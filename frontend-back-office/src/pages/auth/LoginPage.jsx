// ─────────────────────────────────────────────────────────────
// Page de connexion en deux étapes :
//   1. Saisie du numéro de téléphone
//   2. Saisie du code OTP à 6 chiffres (auto-vérifié, renvoi avec compteur)
// Mise en page : panneau de marque (desktop) + carte de connexion.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { demanderOtp, verifierOtp } from '../../services/auth.service.js';
import OTPInput from '../../components/ui/OTPInput.jsx';
import Icon from '../../components/ui/Icon.jsx';

const DELAI_RENVOI = 30; // secondes avant de pouvoir renvoyer un code

const ATOUTS = [
  { icone: 'shield_lock', titre: 'Connexion sans mot de passe', detail: 'Un code à usage unique envoyé sur votre téléphone.' },
  { icone: 'lan', titre: 'Diplômes ancrés sur la blockchain', detail: 'Chaque certification est infalsifiable et vérifiable.' },
  { icone: 'history', titre: 'Traçabilité complète', detail: 'Toutes les actions sensibles sont journalisées.' },
];

export default function LoginPage() {
  const [etape, setEtape] = useState(1); // 1 = téléphone, 2 = code
  const [telephone, setTelephone] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [compteur, setCompteur] = useState(0);
  const [codeDev, setCodeDev] = useState(''); // code renvoyé par l'API hors production
  const verificationEnCours = useRef(false);

  const { connecter, estConnecte } = useAuth();
  const navigate = useNavigate();

  // Si déjà connecté, on quitte la page de login.
  useEffect(() => {
    if (estConnecte) navigate('/', { replace: true });
  }, [estConnecte, navigate]);

  // Décompte pour le renvoi de code.
  useEffect(() => {
    if (compteur <= 0) return undefined;
    const timer = setInterval(() => setCompteur((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [compteur]);

  // Vérification automatique dès que les 6 chiffres sont saisis.
  useEffect(() => {
    if (etape === 2 && code.length === 6) verifierCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, etape]);

  function messageErreur(err) {
    return err.response?.data?.error?.message || 'Une erreur est survenue. Réessayez.';
  }

  // Étape 1 → demande d'OTP.
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
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  // Renvoi d'un nouveau code.
  async function renvoyerCode() {
    if (compteur > 0) return;
    setErreur('');
    setCode('');
    try {
      const data = await demanderOtp(telephone.trim());
      setCodeDev(data.code_dev || '');
      setCompteur(DELAI_RENVOI);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  // Étape 2 → vérification du code.
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
      setErreur(messageErreur(err));
      setCode(''); // repartir sur une saisie vide
    } finally {
      setChargement(false);
      verificationEnCours.current = false;
    }
  }

  function retourEtape1() {
    setEtape(1);
    setCode('');
    setErreur('');
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Panneau de marque (desktop) ── */}
      <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-container p-12 text-on-primary lg:flex">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <Icon name="verified_user" filled size={26} />
          </div>
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight">CertifTOGO</div>
            <div className="text-xs font-medium uppercase tracking-widest text-primary-fixed/80">
              République Togolaise
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight xl:text-4xl">
            La certification des diplômes, <span className="text-secondary-container">sécurisée</span> par la blockchain.
          </h1>
          <ul className="mt-10 space-y-6">
            {ATOUTS.map((a) => (
              <li key={a.icone} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon name={a.icone} size={22} />
                </div>
                <div>
                  <div className="font-semibold">{a.titre}</div>
                  <div className="mt-0.5 text-sm text-primary-fixed/80">{a.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-xs text-primary-fixed/70">
          © République Togolaise — Ministère des Enseignements.
        </div>

        {/* Filigrane décoratif */}
        <div className="pointer-events-none absolute -bottom-24 -right-20 select-none opacity-[0.07]">
          <Icon name="verified" filled size={420} />
        </div>
      </aside>

      {/* ── Carte de connexion ── */}
      <main className="flex flex-grow items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* En-tête mobile */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-soft-md">
              <Icon name="verified_user" filled size={30} />
            </div>
            <div className="font-display text-2xl font-extrabold tracking-tight text-primary">CertifTOGO</div>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-soft-md ring-1 ring-outline-variant/20 sm:p-10">
            {/* Indicateur d'étape */}
            <div className="mb-8 flex items-center justify-center gap-2">
              <span className={`h-1.5 w-8 rounded-full transition-colors ${etape === 1 ? 'bg-primary' : 'bg-primary/30'}`} />
              <span className={`h-1.5 w-8 rounded-full transition-colors ${etape === 2 ? 'bg-primary' : 'bg-outline-variant/40'}`} />
            </div>

            {/* ── Étape 1 : téléphone ── */}
            {etape === 1 && (
              <form onSubmit={soumettreTelephone} className="space-y-6">
                <div className="text-center">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-on-surface">Connexion</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Espace privé — établissements, ministère, candidats et administrateurs.
                  </p>
                </div>

                {erreur && <BandeauErreur message={erreur} />}

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    Numéro de téléphone
                  </span>
                  <div className="relative mt-2">
                    <Icon
                      name="smartphone"
                      size={22}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50"
                    />
                    <input
                      id="tel"
                      type="tel"
                      autoFocus
                      required
                      autoComplete="tel"
                      placeholder="+228 90 00 00 01"
                      value={telephone}
                      onChange={(e) => setTelephone(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant/40 bg-white py-3.5 pl-11 pr-4
                                 text-on-surface placeholder:text-on-surface-variant/50
                                 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
                    />
                  </div>
                  <span className="mt-2 block text-xs text-on-surface-variant/80">
                    Un code de connexion à usage unique vous sera envoyé par WhatsApp.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={chargement}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-semibold
                             text-on-primary shadow-sm transition-all hover:bg-primary-container
                             active:scale-[0.99] disabled:opacity-60"
                >
                  {chargement ? (
                    <>
                      <Icon name="progress_activity" size={20} className="animate-spin" /> Envoi du code…
                    </>
                  ) : (
                    <>
                      <Icon name="send" size={20} /> Recevoir le code
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ── Étape 2 : code OTP ── */}
            {etape === 2 && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-fixed/40 text-primary">
                    <Icon name="sms" filled size={28} />
                  </div>
                  <h2 className="font-display text-2xl font-bold tracking-tight text-on-surface">Saisissez le code</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Un code à 6 chiffres a été envoyé par WhatsApp au{' '}
                    <span className="font-semibold text-on-surface">{telephone}</span>.
                  </p>
                </div>

                {erreur && <BandeauErreur message={erreur} />}

                {codeDev && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-secondary/50 bg-secondary-fixed/20 px-4 py-3">
                    <div className="text-sm">
                      <span className="mr-2 rounded bg-secondary-container px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-secondary-container">
                        dev
                      </span>
                      Code : <code className="font-mono text-base font-bold tracking-widest text-on-surface">{codeDev}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCode(codeDev)}
                      disabled={chargement}
                      className="shrink-0 rounded-lg bg-secondary-container px-3 py-1.5 text-xs font-bold text-on-secondary-container transition-colors hover:brightness-95 disabled:opacity-60"
                    >
                      Utiliser
                    </button>
                  </div>
                )}

                <OTPInput valeur={code} onChange={setCode} disabled={chargement} erreur={Boolean(erreur)} />

                <div className="flex h-5 items-center justify-center text-sm text-on-surface-variant">
                  {chargement && (
                    <span className="inline-flex items-center gap-2">
                      <Icon name="progress_activity" size={18} className="animate-spin" /> Vérification…
                    </span>
                  )}
                </div>

                <div className="space-y-3 text-center text-sm">
                  {compteur > 0 ? (
                    <p className="text-on-surface-variant/70">
                      Renvoyer le code dans <span className="font-semibold tabular-nums">{compteur}s</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={renvoyerCode}
                      className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                    >
                      <Icon name="refresh" size={18} /> Renvoyer le code
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={retourEtape1}
                    className="group mx-auto flex items-center justify-center gap-1.5 text-on-surface-variant hover:text-on-surface"
                  >
                    <Icon name="arrow_back" size={18} className="transition-transform group-hover:-translate-x-0.5" />
                    Changer de numéro
                  </button>
                </div>
              </div>
            )}
          </div>

          {import.meta.env.DEV && etape === 1 && (
            <p className="mt-4 text-center text-xs text-on-surface-variant/60">
              Mode développement : le code OTP s'affichera directement à l'étape suivante.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function BandeauErreur({ message }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-error">
      <Icon name="error" filled size={20} className="mt-px shrink-0" />
      {message}
    </div>
  );
}
