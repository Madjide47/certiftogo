// ─────────────────────────────────────────────────────────────
// Page de démonstration — /demonstration
//
// POURQUOI ELLE EXISTE
// Devant un jury, la vérification se démontre en tapant une référence au
// clavier. Deux ennuis : on se trompe, et surtout on tombe au hasard sur
// un diplôme ancré en mode `mock`, dont la réponse annonce
// `ancrage_blockchain.ancre = false` — ce qui donne l'impression que la
// blockchain ne marche pas, alors qu'elle n'a simplement pas été
// sollicitée pour ce jeu de données.
//
// Cette page présente les diplômes RÉELLEMENT ancrés sur Polygon Amoy,
// avec leur QR code et le lien vers l'explorateur public. Le jury scanne,
// ou clique, et vérifie lui-même sur une source que nous ne contrôlons pas.
//
// Elle n'expose aucune donnée nouvelle : chaque état affiché provient de
// l'endpoint public de vérification, celui qu'un employeur interroge. Les
// références sont fixées à la construction (VITE_DEMO_REFERENCES) — il n'y
// a pas d'endpoint qui « liste les diplômes », et il ne doit pas y en
// avoir : un registre national ne se parcourt pas, il se consulte pièce
// par pièce.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { verifierLot } from '../services/verification.service.js';
import { Encart, Icone } from '../components/ui.jsx';

const EXPLORATEUR = 'https://amoy.polygonscan.com';
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
/** Racine des fichiers servis en statique (QR, PDF) : l'API sans /api. */
const FICHIERS = API.replace(/\/api\/?$/, '');

/**
 * Adresse d'un fichier servi par l'API.
 *
 * `qr_url` arrive ABSOLUE et FIGÉE : elle a été écrite en base au moment de
 * la certification, avec l'origine qu'avait le serveur ce jour-là — le plus
 * souvent `http://localhost:4000`. Cette origine ne veut rien dire ailleurs :
 * sur un téléphone, `localhost` désigne le téléphone. L'image ne charge pas,
 * et l'écran affiche un cadre vide sur la page faite pour être scannée.
 *
 * On ne garde donc que le CHEMIN, et on le raccroche à l'origine que ce front
 * utilise réellement pour parler à l'API. La donnée stockée dit *quel*
 * fichier ; c'est au client de savoir *où* il le sert.
 */
function urlFichier(chemin) {
  if (!chemin) return null;
  try {
    return `${FICHIERS}${new URL(chemin, FICHIERS).pathname}`;
  } catch {
    return `${FICHIERS}${chemin.startsWith('/') ? chemin : `/${chemin}`}`;
  }
}

const REFERENCES = (
  import.meta.env.VITE_DEMO_REFERENCES || 'DIP-2026-83470,DIP-2026-91564'
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

const ETATS = {
  authentique: { ton: 'succes', icone: 'verified', libelle: 'Authentique' },
  revoque: { ton: 'erreur', icone: 'gpp_bad', libelle: 'Révoqué' },
  remplace: { ton: 'alerte', icone: 'sync_alt', libelle: 'Remplacé' },
  en_attente_ancrage: { ton: 'info', icone: 'hourglass_top', libelle: 'Ancrage en cours' },
  introuvable: { ton: 'alerte', icone: 'help', libelle: 'Introuvable' },
};

function Ancrage({ ancrage }) {
  if (!ancrage) return null;

  if (ancrage.mode === 'mock') {
    return (
      <p className="mt-2 text-sm text-gris-500">
        <Icone nom="science" taille={16} className="align-text-bottom" /> Ancrage simulé — ce
        serveur tourne en mode <code>mock</code>, la chaîne n’est pas interrogée.
      </p>
    );
  }
  if (ancrage.indisponible) {
    return (
      <p className="mt-2 text-sm text-gris-500">
        <Icone nom="cloud_off" taille={16} className="align-text-bottom" /> Réseau blockchain
        momentanément injoignable. La réponse ci-dessus reste celle du registre.
      </p>
    );
  }
  if (!ancrage.ancre) {
    return (
      <p className="mt-2 text-sm text-gris-500">
        <Icone nom="link_off" taille={16} className="align-text-bottom" /> Hash absent du contrat :
        ce diplôme n’a pas été ancré sur la chaîne.
      </p>
    );
  }
  return (
    <p className="mt-2 text-sm font-medium text-succes">
      <Icone nom="link" taille={16} className="align-text-bottom" /> Confirmé sur Polygon Amoy —
      valide&nbsp;: {String(ancrage.valide)}, révoqué&nbsp;: {String(ancrage.revoque)}
    </p>
  );
}

function Carte({ diplome }) {
  const etat = ETATS[diplome.resultat] || ETATS.introuvable;

  if (diplome.resultat === 'introuvable') {
    return (
      <article className="border border-gris-300 bg-white p-5">
        <p className="font-mono text-base text-gris-900">{diplome.code}</p>
        <p className="mt-2 text-sm text-gris-500">
          Cette référence n’existe pas dans le registre. Si elle figurait ici, c’est que la base a
          été reconstruite depuis&nbsp;: voir <code>scripts/ancrer-vitrine.mjs</code>.
        </p>
      </article>
    );
  }

  return (
    <article className="border border-gris-300 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gris-300 px-5 py-3">
        <div>
          <p className="font-mono text-base font-bold text-gris-900">{diplome.reference}</p>
          <p className="text-sm text-gris-500">{diplome.titulaire}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium ${
            etat.ton === 'succes'
              ? 'bg-succes-clair text-succes'
              : etat.ton === 'erreur'
                ? 'bg-erreur-clair text-erreur'
                : 'bg-info-clair text-info'
          }`}
        >
          <Icone nom={etat.icone} taille={16} />
          {etat.libelle}
        </span>
      </div>

      <div className="flex flex-wrap gap-5 px-5 py-4">
        {/* Assez grand pour être lu depuis une salle : un QR de 128 px
            projeté au mur ne se scanne pas. Cliquable, aussi, pour qui
            regarde l'écran de près plutôt qu'avec son téléphone. */}
        {diplome.qr_url && (
          <a
            href={`/verifier/${diplome.reference}`}
            className="shrink-0"
            aria-label={`Vérifier le diplôme ${diplome.reference}`}
          >
            <img
              src={urlFichier(diplome.qr_url)}
              alt={`QR code de vérification du diplôme ${diplome.reference}`}
              className="h-48 w-48 border border-gris-300 bg-white p-2"
            />
          </a>
        )}

        <div className="min-w-56 flex-1">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-gris-500">Diplôme</dt>
              <dd className="text-base text-gris-900">{diplome.type_diplome}</dd>
            </div>
            <div>
              <dt className="text-sm text-gris-500">Filière</dt>
              <dd className="text-base text-gris-900">{diplome.filiere}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-gris-500">Établissement</dt>
              <dd className="text-base text-gris-900">{diplome.etablissement}</dd>
            </div>
          </dl>

          <Ancrage ancrage={diplome.ancrage_blockchain} />

          {diplome.motif_revocation && (
            <p className="mt-2 text-sm text-erreur">Motif : {diplome.motif_revocation}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-4">
            <Link
              to={`/verifier/${diplome.reference}`}
              className="text-base text-vert underline underline-offset-2 hover:text-vert-fonce"
            >
              Ouvrir la vérification
            </Link>
            {diplome.transaction_id && diplome.ancrage_blockchain?.ancre && (
              <a
                href={`${EXPLORATEUR}/address/${import.meta.env.VITE_CONTRAT_ADRESSE || '0x42d2e5EE482c365E5b4737C2d476D127732495F6'}`}
                target="_blank"
                rel="noreferrer"
                className="text-base text-vert underline underline-offset-2 hover:text-vert-fonce"
              >
                Voir le contrat sur PolygonScan
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function DemonstrationPage() {
  const [diplomes, setDiplomes] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let vivant = true;
    verifierLot(REFERENCES)
      .then((data) => vivant && setDiplomes(data.resultats))
      .catch((e) =>
        vivant &&
        setErreur(
          e?.response?.data?.error?.message ||
            'Le service de vérification est injoignable.'
        )
      );
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-gris-900">Démonstration</h1>
      <p className="mt-2 text-lg text-gris-700">
        Ces diplômes sont réellement enregistrés sur la blockchain publique Polygon Amoy. Scannez un
        QR code, ou suivez le lien vers l’explorateur&nbsp;: la preuve se lit sur une source que
        CertifTOGO ne contrôle pas.
      </p>

      <div className="mt-4">
        <Encart ton="info" titre="Pourquoi cette page">
          Elle sert aux présentations. Le registre ne se parcourt pas&nbsp;: il n’existe aucun
          endpoint qui liste les diplômes, et un vérificateur doit toujours partir d’une référence
          ou d’un QR code qu’on lui a remis. Les références ci-dessous sont inscrites dans la page,
          et interrogées par l’API publique de vérification, la même que pour tout le monde.
        </Encart>
      </div>

      {erreur && (
        <div className="mt-6">
          <Encart ton="erreur" titre="Vérification indisponible">
            {erreur}
          </Encart>
        </div>
      )}

      {!diplomes && !erreur && (
        <p className="mt-6 text-base text-gris-500" role="status">
          Interrogation du registre…
        </p>
      )}

      <div className="mt-6 space-y-5">
        {diplomes?.map((d) => (
          <Carte key={d.code} diplome={d} />
        ))}
      </div>

      <p className="mt-8 text-sm text-gris-500">
        Le diplôme révoqué est là volontairement&nbsp;: il montre l’état{' '}
        <code>valide = false / revoqué = true</code> lu sur le contrat. C’est ce qu’une base de
        données seule ne pourrait pas prouver à un tiers — elle peut être modifiée par celui qui la
        détient.
      </p>
    </div>
  );
}
