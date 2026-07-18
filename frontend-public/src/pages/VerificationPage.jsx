// ─────────────────────────────────────────────────────────────
// Résultat de vérification d'un diplôme (cible des QR codes).
// Trois cas : authentique · révoqué · introuvable.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { verifierDiplome } from '../services/verification.service.js';
import { LIBELLES_TYPE_DIPLOME, LIBELLES_MENTION, messageErreur } from '../utils/libelles.js';
import Icon from '../components/Icon.jsx';

const CARTES = {
  authentique: {
    icone: 'check_circle',
    titre: 'Diplôme authentique',
    edge: 'bg-primary-fixed',
    banner: 'border-emerald-200 bg-emerald-50',
    iconBg: 'bg-primary-container text-on-primary',
    titreColor: 'text-emerald-800',
  },
  revoque: {
    icone: 'gpp_bad',
    titre: 'Diplôme révoqué',
    edge: 'bg-error',
    banner: 'border-red-200 bg-red-50',
    iconBg: 'bg-error text-on-error',
    titreColor: 'text-error',
  },
  introuvable: {
    icone: 'help',
    titre: 'Diplôme introuvable',
    edge: 'bg-secondary-fixed-dim',
    banner: 'border-amber-200 bg-amber-50',
    iconBg: 'bg-secondary-fixed text-secondary',
    titreColor: 'text-secondary',
  },
};

function Detail({ label, valeur, wide }) {
  if (!valeur) return null;
  return (
    <div className={`flex flex-col ${wide ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-outline">{label}</span>
      <span className="mt-1 font-medium text-on-surface">{valeur}</span>
    </div>
  );
}

function BlocCode({ label, valeur }) {
  const [copie, setCopie] = useState(false);
  function copier() {
    navigator.clipboard?.writeText(valeur).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    });
  }
  return (
    <div>
      <span className="mb-1 block text-sm text-outline">{label}</span>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/40 bg-surface p-3 transition-colors hover:border-primary/50">
        <code className="break-all font-mono text-xs text-on-surface-variant">{valeur}</code>
        <button
          onClick={copier}
          title="Copier"
          className="shrink-0 rounded-full p-1.5 text-outline transition-colors hover:bg-surface-variant hover:text-primary"
        >
          <Icon name={copie ? 'check' : 'content_copy'} size={18} />
        </button>
      </div>
    </div>
  );
}

export default function VerificationPage() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const [resultat, setResultat] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let actif = true;
    setChargement(true);
    setErreur('');
    verifierDiplome(code, params.get('methode') || undefined)
      .then((r) => actif && setResultat(r))
      .catch((err) => actif && setErreur(messageErreur(err, 'Vérification impossible pour le moment.')))
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, [code, params]);

  if (chargement) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center py-20 text-on-surface-variant">
        <Icon name="progress_activity" size={36} className="animate-spin" />
        <p className="mt-3">Vérification en cours…</p>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-error">{erreur}</div>
        <RetourAccueil />
      </div>
    );
  }

  const type = resultat.resultat;
  const carte = CARTES[type] || CARTES.introuvable;
  const dateCertif = resultat.date_certification
    ? new Date(resultat.date_certification).toLocaleDateString('fr-FR')
    : null;
  const onchain = resultat.ancrage_blockchain?.ancre === true;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <Link to="/" className="group inline-flex items-center text-sm font-medium text-primary hover:text-primary-container">
          <Icon name="arrow_back" size={18} className="mr-2 transition-transform group-hover:-translate-x-1" />
          Vérifier un autre diplôme
        </Link>
      </div>

      <div className="glass-panel relative overflow-hidden rounded-2xl shadow-soft-md">
        <div className={`h-2 w-full ${carte.edge}`} />
        <div className="relative z-10 space-y-8 p-8 md:p-10">
          {/* Bannière */}
          <div className={`flex flex-col gap-5 rounded-xl border p-6 md:flex-row md:items-start ${carte.banner}`}>
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${carte.iconBg}`}>
              <Icon name={carte.icone} filled size={36} />
            </div>
            <div className="flex-grow">
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <h1 className={`font-display text-xl font-bold ${carte.titreColor}`}>{carte.titre}</h1>
                {type === 'authentique' && (
                  <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-700" />
                    {onchain ? 'Vérifié sur blockchain' : 'Enregistré · signé'}
                  </span>
                )}
              </div>
              {resultat.reference ? (
                <>
                  <p className="text-sm text-on-surface-variant/80">Référence du document</p>
                  <p className={`mt-1 font-display text-2xl font-bold tracking-tight text-on-surface ${type === 'revoque' ? 'line-through decoration-error/50' : ''}`}>
                    {resultat.reference}
                  </p>
                </>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  Aucun diplôme ne correspond à « {code} ». Vérifiez la saisie ou le QR code.
                </p>
              )}
            </div>
          </div>

          {type === 'revoque' && resultat.motif_revocation && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-error">
              <span className="font-semibold">Motif de révocation :</span> {resultat.motif_revocation}
            </div>
          )}

          {type !== 'introuvable' && (
            <>
              {/* Détails */}
              <div className="space-y-6">
                <h2 className="border-b border-outline-variant/20 pb-2 font-display text-lg font-bold text-on-surface">
                  Détails de la certification
                </h2>
                <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
                  <Detail label="Titulaire" valeur={resultat.titulaire} />
                  <Detail label="Diplôme" valeur={LIBELLES_TYPE_DIPLOME[resultat.type_diplome] || resultat.type_diplome} />
                  <Detail label="Filière" valeur={resultat.filiere} />
                  <Detail label="Mention" valeur={LIBELLES_MENTION[resultat.mention] || resultat.mention} />
                  <Detail label="Établissement" valeur={resultat.etablissement} wide />
                  <Detail label="Certifié le" valeur={dateCertif} />
                </div>
              </div>

              {/* Preuves cryptographiques */}
              <div className="space-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-low p-6">
                <div className="flex items-center gap-2 text-on-surface">
                  <Icon name="link" size={20} />
                  <h3 className="text-xs font-bold uppercase tracking-wide">Preuves cryptographiques</h3>
                </div>
                {resultat.hash && <BlocCode label="Empreinte SHA-256" valeur={resultat.hash} />}
                {resultat.transaction_id && (
                  <BlocCode label="Transaction blockchain" valeur={resultat.transaction_id} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Filigrane */}
        <div className="pointer-events-none absolute -bottom-16 -right-8 select-none text-primary opacity-[0.03]">
          <Icon name="verified" filled size={300} />
        </div>
      </div>

      <RetourAccueil />
    </div>
  );
}

function RetourAccueil() {
  return (
    <div className="mt-6 text-center">
      <Link to="/" className="text-sm font-semibold text-primary hover:underline">
        ← Vérifier un autre diplôme
      </Link>
    </div>
  );
}
