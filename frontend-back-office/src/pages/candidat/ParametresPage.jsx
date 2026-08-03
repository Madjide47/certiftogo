// ─────────────────────────────────────────────────────────────
// Compte du diplômé : identité, appareils connectés, déconnexion.
//
// L'écran précédent affichait deux interrupteurs de notification qui ne
// commandaient rien : ils étaient décoratifs. Un réglage qui ne se règle
// pas est pire qu'un réglage absent — l'utilisateur croit avoir choisi.
// Les vraies préférences vivent dans l'écran Notifications ; on y renvoie.
//
// À la place, ce que le titulaire peut réellement faire : voir depuis
// quels appareils son compte est ouvert, et les fermer. C'est le seul
// levier de sécurité dont il dispose sur un compte sans mot de passe.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  listerSessions,
  fermerSession,
  fermerAutresSessions,
} from '../../services/auth.service.js';
import { LIBELLES_ROLE, messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Section,
  Encart,
  Bouton,
  Etiquette,
  Chargement,
  EtatVide,
  Icone,
} from '../../components/ui/index.jsx';

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Un user-agent brut est illisible : on en tire l'essentiel. */
function appareil(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'Appareil inconnu';
  const navigateur =
    /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Navigateur';
  const systeme =
    /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  return [navigateur, systeme].filter(Boolean).join(' · ');
}

function Ligne({ label, valeur }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gris-200 py-2.5 last:border-0">
      <dt className="text-sm text-gris-500">{label}</dt>
      <dd className="text-right text-base font-medium text-gris-900">{valeur || '—'}</dd>
    </div>
  );
}

export default function ParametresPage() {
  const { utilisateur, deconnecter } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setChargement(true);
    try {
      setSessions(await listerSessions());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function fermer(session) {
    setErreur('');
    setMessage('');
    try {
      await fermerSession(session.id);
      setMessage('Cet appareil a été déconnecté.');
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function fermerLesAutres() {
    setEnCours(true);
    setErreur('');
    setMessage('');
    try {
      const { fermees } = await fermerAutresSessions();
      setMessage(
        fermees > 0
          ? `${fermees} appareil(s) déconnecté(s). Seul celui-ci reste ouvert.`
          : 'Aucun autre appareil n’était connecté.'
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  const autres = sessions.filter((s) => !s.courante).length;

  return (
    <div>
      <EnTetePage
        titre="Mon compte"
        description="Votre identité, les appareils connectés et votre déconnexion."
        fil={[{ libelle: 'Mon compte' }, { libelle: 'Paramètres' }]}
      />

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Encart ton="succes">{message}</Encart>
        </div>
      )}

      <div className="max-w-3xl">
        <Section titre="Identité">
          <div className="border border-gris-300 bg-white px-5 py-3">
            <dl>
              <Ligne label="Prénom" valeur={utilisateur?.prenom} />
              <Ligne label="Nom" valeur={utilisateur?.nom} />
              <Ligne label="Téléphone" valeur={utilisateur?.telephone} />
              <Ligne label="Qualité" valeur={LIBELLES_ROLE[utilisateur?.role] || 'Diplômé'} />
            </dl>
            <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="lock" taille={16} className="mt-0.5 shrink-0" />
              Ces informations proviennent de l’état civil transmis par votre établissement. Elles
              figurent sur vos diplômes : elles ne se modifient pas ici. Une erreur se corrige par
              l’établissement, qui fait réémettre le diplôme.
            </p>
          </div>
        </Section>

        <Section titre="Notifications">
          <div className="border border-gris-300 bg-white px-5 py-4">
            <p className="text-base text-gris-900">
              Vous êtes averti de la certification et de la révocation de vos diplômes.
            </p>
            <p className="mt-1 text-sm text-gris-500">
              Ces deux messages ne se désactivent pas : ils vous informent de ce qui change vos
              droits. Les autres se règlent canal par canal.
            </p>
            <div className="mt-3">
              <Link
                to="/notifications"
                className="inline-flex items-center gap-1.5 border border-gris-500 bg-white px-4 py-2 text-base font-medium text-gris-900 hover:bg-gris-100"
              >
                <Icone nom="notifications" taille={18} />
                Gérer mes notifications
              </Link>
            </div>
          </div>
        </Section>

        <Section
          titre="Appareils connectés"
          actions={
            autres > 0 ? (
              <Bouton variante="secondaire" icone="logout" onClick={fermerLesAutres} enCours={enCours}>
                Déconnecter les autres appareils
              </Bouton>
            ) : null
          }
        >
          {chargement ? (
            <Chargement />
          ) : sessions.length === 0 ? (
            <EtatVide icone="devices" titre="Aucune session listée" />
          ) : (
            <ul className="border border-gris-300 bg-white">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 border-b border-gris-200 px-4 py-3 last:border-0"
                >
                  <Icone nom="devices" taille={20} className="shrink-0 text-gris-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-gris-900">{appareil(s.user_agent)}</p>
                    <p className="tabulaire text-sm text-gris-500">
                      {s.adresse_ip || 'adresse inconnue'} · dernière activité{' '}
                      {horodatage(s.derniere_activite)}
                    </p>
                  </div>
                  {s.courante ? (
                    <Etiquette ton="vert">Cet appareil</Etiquette>
                  ) : (
                    <Bouton
                      variante="discret"
                      className="text-erreur hover:text-erreur"
                      onClick={() => fermer(s)}
                    >
                      Déconnecter
                    </Bouton>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
            <Icone nom="shield" taille={16} className="mt-0.5 shrink-0" />
            Si vous ne reconnaissez pas un appareil, déconnectez-le. Vous perdez l’accès à votre
            téléphone ? Une procédure de récupération existe : présentez-vous à votre
            établissement avec une pièce d’identité.
          </p>
        </Section>

        <Section titre="Session">
          <div className="border border-gris-300 bg-white px-5 py-4">
            <Bouton variante="danger" icone="logout" onClick={deconnecter}>
              Me déconnecter
            </Bouton>
          </div>
        </Section>
      </div>
    </div>
  );
}
