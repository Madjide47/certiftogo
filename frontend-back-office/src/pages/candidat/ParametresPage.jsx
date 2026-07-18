// ─────────────────────────────────────────────────────────────
// Candidat — paramètres : profil (lecture seule), notifications, session.
// ─────────────────────────────────────────────────────────────
import { useAuth } from '../../contexts/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { LIBELLES_ROLE } from '../../utils/libelles.js';
import { BTN_GHOST } from '../../components/ui/classes.js';

function Ligne({ label, valeur }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/15 py-3 last:border-0">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className="text-sm font-medium text-on-surface">{valeur || '—'}</span>
    </div>
  );
}

function ToggleInfo({ label }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-on-surface">{label}</span>
      <span className="inline-flex h-6 w-11 items-center rounded-full bg-primary-container p-0.5">
        <span className="ml-auto h-5 w-5 rounded-full bg-white shadow" />
      </span>
    </div>
  );
}

export default function ParametresPage() {
  const { utilisateur, deconnecter } = useAuth();

  return (
    <div>
      <PageHeader titre="Paramètres" sous="Votre compte et vos préférences." />

      <div className="max-w-2xl space-y-6">
        <Card className="p-6">
          <div className="mb-2 flex items-center gap-2 text-on-surface">
            <Icon name="person" size={20} />
            <h3 className="font-display text-lg font-bold">Profil</h3>
          </div>
          <Ligne label="Prénom" valeur={utilisateur?.prenom} />
          <Ligne label="Nom" valeur={utilisateur?.nom} />
          <Ligne label="Téléphone" valeur={utilisateur?.telephone} />
          <Ligne label="Rôle" valeur={LIBELLES_ROLE[utilisateur?.role]} />
          <p className="mt-3 rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
            Ces informations proviennent de l'état civil. Contactez votre établissement pour toute correction.
          </p>
        </Card>

        <Card className="p-6">
          <div className="mb-2 flex items-center gap-2 text-on-surface">
            <Icon name="notifications" size={20} />
            <h3 className="font-display text-lg font-bold">Notifications</h3>
          </div>
          <ToggleInfo label="M'alerter lors de la certification d'un diplôme" />
          <ToggleInfo label="M'alerter en cas de révocation" />
          <p className="mt-2 text-xs text-on-surface-variant">Notifications par WhatsApp (à venir).</p>
        </Card>

        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2 text-on-surface">
            <Icon name="logout" size={20} />
            <h3 className="font-display text-lg font-bold">Session</h3>
          </div>
          <button onClick={deconnecter} className={`${BTN_GHOST} text-error`}>
            Se déconnecter
          </button>
        </Card>
      </div>
    </div>
  );
}
