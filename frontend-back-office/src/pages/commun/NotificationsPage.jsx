// ─────────────────────────────────────────────────────────────
// Centre de notifications — écran partagé par les quatre rôles.
//
// La cloche de l'en-tête affichait un compteur mais ne menait nulle
// part : l'agent savait qu'il avait trois messages sans pouvoir les
// lire. C'est cet écran qui manquait, pas le compteur.
//
// Deux onglets, deux questions distinctes : « qu'est-ce qui m'attend ? »
// et « qu'est-ce que j'accepte de recevoir ? ». Les mélanger ferait
// hésiter au moment où l'on veut seulement lire.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  listerNotifications,
  marquerLue,
  toutMarquerLu,
  preferences as chargerPreferences,
  definirPreference,
} from '../../services/notification.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Onglets,
  Etiquette,
  Encart,
  EtatVide,
  Bouton,
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';

const TONS_PRIORITE = { haute: 'erreur', normale: 'info', basse: 'neutre' };
const LIBELLES_PRIORITE = { haute: 'Haute', normale: 'Normale', basse: 'Basse' };

const LIBELLES_CANAL = {
  in_app: 'Dans la plateforme',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Courriel',
};

// Canaux tracés mais non raccordés : le dire, plutôt que laisser croire
// qu'un message partira.
const CANAUX_INACTIFS = { sms: 'opérateur non raccordé', email: 'SMTP non raccordé' };

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function NotificationsPage() {
  const [onglet, setOnglet] = useState('reception');

  return (
    <div>
      <EnTetePage
        titre="Notifications"
        description="Les messages qui vous sont adressés, et les canaux par lesquels vous acceptez de les recevoir."
        fil={[{ libelle: 'Mon compte' }, { libelle: 'Notifications' }]}
      />

      <Onglets
        actif={onglet}
        onChanger={setOnglet}
        onglets={[
          { cle: 'reception', libelle: 'Boîte de réception' },
          { cle: 'preferences', libelle: 'Préférences' },
        ]}
      />

      {onglet === 'reception' ? <Reception /> : <Preferences />}
    </div>
  );
}

/* ── Boîte de réception ──────────────────────────────────────────── */

function Reception() {
  const [notifications, setNotifications] = useState([]);
  const [nonLues, setNonLues] = useState(0);
  const [filtreNonLues, setFiltreNonLues] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      const data = await listerNotifications({ non_lues: filtreNonLues });
      setNotifications(data.notifications);
      setNonLues(data.non_lues);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreNonLues]);

  async function lire(notification) {
    if (notification.lue) return;
    // Optimiste : marquer lu n'a aucun effet de bord métier, et l'attente
    // d'un aller-retour rendrait la liste poisseuse.
    setNotifications((liste) =>
      liste.map((n) => (n.id === notification.id ? { ...n, lue: true } : n))
    );
    setNonLues((n) => Math.max(0, n - 1));
    try {
      await marquerLue(notification.id);
    } catch (err) {
      setErreur(messageErreur(err));
      charger();
    }
  }

  async function toutLire() {
    setEnCours(true);
    try {
      await toutMarquerLu();
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gris-500">
          {nonLues > 0 ? (
            <>
              <span className="tabulaire font-bold text-gris-900">{nonLues}</span> message(s) non
              lu(s) sur {notifications.length} affiché(s).
            </>
          ) : (
            'Tout est lu.'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Bouton
            variante={filtreNonLues ? 'primaire' : 'secondaire'}
            icone="filter_alt"
            onClick={() => setFiltreNonLues((v) => !v)}
          >
            {filtreNonLues ? 'Voir tout' : 'Non lus seulement'}
          </Bouton>
          <Bouton
            variante="secondaire"
            icone="mark_email_read"
            onClick={toutLire}
            enCours={enCours}
            disabled={nonLues === 0}
          >
            Tout marquer comme lu
          </Bouton>
        </div>
      </div>

      {chargement ? (
        <Chargement />
      ) : notifications.length === 0 ? (
        <EtatVide icone="notifications_off" titre="Aucune notification">
          {filtreNonLues
            ? 'Aucun message non lu.'
            : "Vous serez averti ici des lots reçus, des décisions du ministère et des incidents d'ancrage."}
        </EtatVide>
      ) : (
        <ul className="border border-gris-300 bg-white">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`flex gap-3 border-b border-gris-200 px-4 py-3 last:border-0 ${
                n.lue ? '' : 'bg-vert-clair/30'
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {n.lue ? (
                  <Icone nom="drafts" taille={20} className="text-gris-500" />
                ) : (
                  <Icone nom="mark_email_unread" taille={20} className="text-vert" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-base ${n.lue ? 'text-gris-900' : 'font-bold text-gris-900'}`}>
                    {n.sujet}
                  </p>
                  {n.priorite !== 'normale' && (
                    <Etiquette ton={TONS_PRIORITE[n.priorite]}>
                      {LIBELLES_PRIORITE[n.priorite] || n.priorite}
                    </Etiquette>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-gris-700">{n.corps}</p>
                <p className="tabulaire mt-1 text-xs text-gris-500">
                  {horodatage(n.date_creation)}
                  {n.lue && n.date_lecture && ` · lu le ${horodatage(n.date_lecture)}`}
                </p>
              </div>

              {!n.lue && (
                <div className="shrink-0 self-center">
                  <Bouton variante="discret" onClick={() => lire(n)}>
                    Marquer lu
                  </Bouton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Préférences ─────────────────────────────────────────────────── */

function Preferences() {
  const [catalogue, setCatalogue] = useState([]);
  const [refus, setRefus] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      const data = await chargerPreferences();
      setCatalogue(data.catalogue);
      setRefus(data.refus);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  // Absence d'enregistrement = accepté. Seul le refus est stocké.
  const estActif = (evenement, canal) =>
    !refus.some((r) => r.evenement === evenement && r.canal === canal && r.actif === false);

  async function basculer(evenement, canal) {
    const actif = !estActif(evenement, canal);
    setErreur('');
    setMessage('');
    try {
      await definirPreference({ evenement, canal, actif });
      setRefus((liste) => [
        ...liste.filter((r) => !(r.evenement === evenement && r.canal === canal)),
        { evenement, canal, actif },
      ]);
      setMessage(
        actif
          ? `Vous recevrez de nouveau « ${evenement.replace(/_/g, ' ')} » par ${LIBELLES_CANAL[canal]}.`
          : `Vous ne recevrez plus « ${evenement.replace(/_/g, ' ')} » par ${LIBELLES_CANAL[canal]}.`
      );
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  if (chargement) return <Chargement />;

  return (
    <div>
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

      <div className="mb-4">
        <Encart ton="info" titre="Certaines notifications ne se désactivent pas">
          Un diplôme certifié ou révoqué, une connexion suspecte : ces informations engagent vos
          droits ou votre sécurité. Elles restent cochées et grisées.
        </Encart>
      </div>

      <div className="overflow-x-auto border border-gris-300 bg-white">
        <table>
          <caption className="sr-only">Préférences de notification par événement et par canal</caption>
          <thead>
            <tr className="border-b border-gris-300 bg-gris-100">
              <th scope="col" className="px-3 py-2 text-left text-sm font-bold text-gris-700">
                Événement
              </th>
              <th scope="col" className="px-3 py-2 text-left text-sm font-bold text-gris-700">
                Priorité
              </th>
              <th scope="col" className="px-3 py-2 text-left text-sm font-bold text-gris-700">
                Canaux
              </th>
            </tr>
          </thead>
          <tbody>
            {catalogue.map((evenement, i) => (
              <tr
                key={evenement.evenement}
                className={`border-b border-gris-200 last:border-0 ${i % 2 === 1 ? 'bg-gris-50' : ''}`}
              >
                <td className="px-3 py-2 text-sm text-gris-900">
                  <span className="font-medium">{evenement.sujet}</span>
                  <span className="block text-xs text-gris-500">
                    {evenement.evenement.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm">
                  <Etiquette ton={TONS_PRIORITE[evenement.priorite]}>
                    {LIBELLES_PRIORITE[evenement.priorite] || evenement.priorite}
                  </Etiquette>
                </td>
                <td className="px-3 py-2 text-sm">
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {evenement.canaux.map((canal) => (
                      <label
                        key={canal}
                        className={`flex items-center gap-1.5 ${
                          evenement.desactivable ? 'cursor-pointer' : 'text-gris-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-vert"
                          checked={evenement.desactivable ? estActif(evenement.evenement, canal) : true}
                          disabled={!evenement.desactivable}
                          onChange={() => basculer(evenement.evenement, canal)}
                        />
                        <span>
                          {LIBELLES_CANAL[canal] || canal}
                          {CANAUX_INACTIFS[canal] && (
                            <span className="block text-xs text-gris-500">
                              {CANAUX_INACTIFS[canal]}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
