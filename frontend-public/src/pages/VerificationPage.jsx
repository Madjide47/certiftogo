// ─────────────────────────────────────────────────────────────
// Résultat de vérification — cible des QR codes imprimés.
//
// C'est l'écran le plus exposé du système : celui que lit un employeur,
// souvent sur un téléphone, avec le document en main. La réponse doit
// donc être lisible en deux secondes, et ne jamais dire plus que ce
// qu'elle sait.
//
// CINQ résultats, pas trois. L'écran précédent n'en connaissait que
// trois et rangeait les deux autres dans « introuvable » : un diplôme en
// cours d'ancrage, ou remplacé par une version corrigée, était donc
// annoncé comme inexistant. Dire « ce diplôme n'existe pas » d'un diplôme
// valide est la pire erreur que ce service puisse commettre.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { verifierDiplome } from '../services/verification.service.js';
import { LIBELLES_TYPE_DIPLOME, LIBELLES_MENTION, messageErreur } from '../utils/libelles.js';
import { Icone, Encart, Champ } from '../components/ui.jsx';

const VERDICTS = {
  authentique: {
    icone: 'verified',
    titre: 'Diplôme authentique',
    resume: 'Ce diplôme figure au registre national et n’a pas été modifié.',
    bordure: 'border-succes',
    fond: 'bg-succes-clair',
    texte: 'text-succes',
  },
  en_attente_ancrage: {
    icone: 'schedule',
    titre: 'Diplôme délivré — enregistrement en cours',
    resume:
      'Le ministère a certifié ce diplôme. Son inscription sur la blockchain est en file d’attente.',
    bordure: 'border-info',
    fond: 'bg-info-clair',
    texte: 'text-info',
  },
  remplace: {
    icone: 'find_replace',
    titre: 'Document remplacé par une version corrigée',
    resume: 'Le diplôme reste valide, mais ce document n’est plus celui qui fait foi.',
    bordure: 'border-alerte',
    fond: 'bg-alerte-clair',
    texte: 'text-alerte',
  },
  revoque: {
    icone: 'gpp_bad',
    titre: 'Diplôme révoqué',
    resume: 'Ce diplôme a été annulé par le ministère. Il ne vaut plus preuve.',
    bordure: 'border-erreur',
    fond: 'bg-erreur-clair',
    texte: 'text-erreur',
  },
  introuvable: {
    icone: 'help',
    titre: 'Aucun diplôme correspondant',
    resume: 'Aucune inscription du registre ne correspond à ce code.',
    bordure: 'border-gris-500',
    fond: 'bg-gris-100',
    texte: 'text-gris-700',
  },
};

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : null);

function Empreinte({ label, valeur }) {
  const [copie, setCopie] = useState(false);
  if (!valeur) return null;

  async function copier() {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      /* presse-papiers indisponible : la valeur reste sélectionnable */
    }
  }

  return (
    <div>
      <p className="text-sm text-gris-500">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all border border-gris-300 bg-gris-50 px-3 py-2 font-mono text-xs text-gris-700">
          {valeur}
        </code>
        <button
          type="button"
          onClick={copier}
          className="shrink-0 border border-gris-300 bg-white px-2 py-2 text-gris-700 hover:bg-gris-100"
          aria-label={`Copier ${label}`}
        >
          <Icone nom={copie ? 'check' : 'content_copy'} taille={18} />
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
      .catch(
        (err) =>
          actif && setErreur(messageErreur(err, 'Vérification impossible pour le moment.'))
      )
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, [code, params]);

  if (chargement) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center text-gris-500">
        <Icone nom="progress_activity" taille={32} />
        <p className="mt-2 text-base">Interrogation du registre national…</p>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="mx-auto max-w-3xl">
        <Encart ton="erreur" titre="Vérification impossible">
          {erreur} Cela ne dit rien du diplôme lui-même : réessayez dans un instant.
        </Encart>
        <RetourAccueil />
      </div>
    );
  }

  const verdict = VERDICTS[resultat.resultat] || VERDICTS.introuvable;
  const ancrage = resultat.ancrage_blockchain;
  const connu = resultat.resultat !== 'introuvable';

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* ── Verdict ── */}
      <section className={`border-l-4 ${verdict.bordure} ${verdict.fond} px-5 py-4`}>
        <div className="flex items-start gap-3">
          <Icone nom={verdict.icone} taille={32} className={`mt-0.5 shrink-0 ${verdict.texte}`} />
          <div>
            <h1 className={`text-xl ${verdict.texte}`}>{verdict.titre}</h1>
            <p className="mt-1 text-base text-gris-900">{verdict.resume}</p>
            {resultat.reference && (
              <p className="tabulaire mt-2 text-base font-bold text-gris-900">
                {resultat.reference}
                {resultat.version > 1 && (
                  <span className="ml-2 font-normal text-gris-700">version {resultat.version}</span>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {resultat.resultat === 'introuvable' && (
        <div className="mt-4 space-y-3">
          <Encart ton="info" titre="Que peut signifier ce résultat ?">
            <ul className="mt-1 list-disc space-y-1 pl-5 text-base">
              <li>Le code a été mal saisi — vérifiez caractère par caractère.</li>
              <li>
                Le diplôme est antérieur à la mise en service du registre, ou délivré par un
                établissement non agréé.
              </li>
              <li>Le document présenté n’est pas authentique.</li>
            </ul>
            <p className="mt-2 text-base">
              Un résultat négatif n’est pas une accusation : contactez l’établissement émetteur
              avant toute conclusion.
            </p>
          </Encart>
          <p className="tabulaire text-sm text-gris-500">Code recherché : {code}</p>
        </div>
      )}

      {resultat.message && (
        <div className="mt-4">
          <Encart ton={resultat.resultat === 'remplace' ? 'alerte' : 'info'}>
            {resultat.message}
          </Encart>
        </div>
      )}

      {resultat.resultat === 'remplace' && resultat.version_en_vigueur && (
        <div className="mt-3">
          <Encart ton="info" titre="Version en vigueur">
            <span className="tabulaire font-bold">{resultat.version_en_vigueur.reference}</span> —
            version {resultat.version_en_vigueur.version}. Demandez ce document à son titulaire.
          </Encart>
        </div>
      )}

      {resultat.resultat === 'revoque' && resultat.motif_revocation && (
        <div className="mt-4">
          <Encart ton="erreur" titre="Motif de la révocation">
            {resultat.motif_revocation}
          </Encart>
        </div>
      )}

      {connu && (
        <>
          {/* ── Ce que le registre déclare ── */}
          <section className="mt-6 border border-gris-300 bg-white">
            <h2 className="border-b border-gris-200 bg-gris-100 px-5 py-2.5 text-base font-bold text-gris-700">
              Mentions portées au registre
            </h2>
            <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <Champ label="Titulaire" valeur={resultat.titulaire} large />
              <Champ
                label="Diplôme"
                valeur={LIBELLES_TYPE_DIPLOME[resultat.type_diplome] || resultat.type_diplome}
              />
              <Champ label="Filière" valeur={resultat.filiere} />
              <Champ
                label="Mention"
                valeur={LIBELLES_MENTION[resultat.mention] || resultat.mention}
              />
              <Champ label="Certifié le" valeur={date(resultat.date_certification)} />
              <Champ label="Établissement" valeur={resultat.etablissement} large />
            </dl>
            <p className="border-t border-gris-200 px-5 py-3 text-sm text-gris-500">
              Comparez le nom ci-dessus avec la pièce d’identité de la personne : le registre
              atteste l’existence du diplôme, pas l’identité de qui vous le présente.
            </p>
          </section>

          {/* ── Preuves ── */}
          <section className="mt-5 border border-gris-300 bg-white">
            <h2 className="border-b border-gris-200 bg-gris-100 px-5 py-2.5 text-base font-bold text-gris-700">
              Preuves techniques
            </h2>

            <div className="space-y-4 px-5 py-4">
              <EtatAncrage ancrage={ancrage} resultat={resultat.resultat} />
              <Empreinte label="Empreinte SHA-256 du diplôme" valeur={resultat.hash} />
              <Empreinte label="Transaction blockchain" valeur={resultat.transaction_id} />
            </div>
          </section>
        </>
      )}

      <RetourAccueil />
    </div>
  );
}

/**
 * L'état on-chain est dit sans euphémisme : « non vérifié » n'est pas
 * « faux ». Un nœud injoignable ne doit pas ressembler à une fraude.
 */
function EtatAncrage({ ancrage, resultat }) {
  if (!ancrage) return null;

  if (ancrage.mode === 'mock') {
    return (
      <Encart ton="alerte" titre="Vérification blockchain non disponible">
        Ce serveur fonctionne en mode démonstration : l’inscription sur la chaîne publique n’est
        pas contrôlée. Les mentions ci-dessus proviennent du registre du ministère.
      </Encart>
    );
  }

  if (ancrage.indisponible) {
    return (
      <Encart ton="alerte" titre="Chaîne publique momentanément injoignable">
        Le registre du ministère a répondu, pas la blockchain. Réessayez plus tard pour obtenir la
        confirmation indépendante.
      </Encart>
    );
  }

  if (ancrage.verifie && ancrage.ancre) {
    return (
      <Encart ton="succes" titre="Confirmé sur la blockchain publique">
        L’empreinte de ce diplôme est inscrite sur la chaîne et son état y est
        {ancrage.revoque ? ' révoqué' : ' valide'}. Cette inscription ne peut être ni effacée ni
        réécrite, y compris par le ministère.
      </Encart>
    );
  }

  return (
    <Encart ton={resultat === 'en_attente_ancrage' ? 'info' : 'alerte'} titre="Pas encore inscrit sur la chaîne">
      {resultat === 'en_attente_ancrage'
        ? 'L’inscription est en file d’attente : elle interviendra sous peu.'
        : 'Le registre du ministère connaît ce diplôme, mais son empreinte n’a pas été retrouvée sur la chaîne publique. Signalez-le à l’établissement émetteur.'}
    </Encart>
  );
}

function RetourAccueil() {
  return (
    <div className="mt-6">
      <Link to="/" className="text-base text-vert underline underline-offset-2 hover:text-vert-fonce">
        ← Vérifier un autre diplôme
      </Link>
    </div>
  );
}
