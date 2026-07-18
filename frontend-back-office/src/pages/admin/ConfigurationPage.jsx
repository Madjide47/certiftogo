// ─────────────────────────────────────────────────────────────
// Admin système — configuration (lecture seule) : paramètres de la plateforme.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { configurationAdmin } from '../../services/admin.service.js';
import { messageErreur } from '../../utils/libelles.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';

function Ligne({ label, valeur, mono }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-outline-variant/15 py-3 last:border-0">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className={`text-right text-sm font-medium text-on-surface ${mono ? 'break-all font-mono text-xs' : ''}`}>
        {valeur ?? '—'}
      </span>
    </div>
  );
}

export default function ConfigurationPage() {
  const [config, setConfig] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    configurationAdmin()
      .then(setConfig)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  const bc = config?.blockchain;
  const modeOnchain = bc?.mode === 'onchain';

  return (
    <div>
      <PageHeader titre="Configuration" sous="Paramètres généraux de la plateforme (lecture seule)." />

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      {chargement ? (
        <div className="py-16 text-center text-on-surface-variant">Chargement…</div>
      ) : (
        <div className="grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-on-surface">
                <Icon name="link" size={20} />
                <h3 className="font-display text-lg font-bold">Blockchain</h3>
              </div>
              <Badge className={modeOnchain ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary-fixed/50 text-secondary'}>
                {modeOnchain ? 'On-chain' : 'Mock'}
              </Badge>
            </div>
            <Ligne label="Mode d'ancrage" valeur={bc?.mode} />
            <Ligne label="Adresse du contrat" valeur={bc?.contrat_adresse} mono />
            <Ligne label="Nœud RPC" valeur={bc?.rpc_url} mono />
          </Card>

          <Card className="p-6">
            <div className="mb-2 flex items-center gap-2 text-on-surface">
              <Icon name="sms" size={20} />
              <h3 className="font-display text-lg font-bold">Authentification OTP</h3>
            </div>
            <Ligne label="Canal d'envoi" valeur={config?.otp?.canal} />
            <Ligne label="Longueur du code" valeur={config?.otp?.longueur} />
            <Ligne label="Validité (minutes)" valeur={config?.otp?.expiration_minutes} />
          </Card>

          <Card className="p-6">
            <div className="mb-2 flex items-center gap-2 text-on-surface">
              <Icon name="security" size={20} />
              <h3 className="font-display text-lg font-bold">Sécurité</h3>
            </div>
            <Ligne label="Durée de session (JWT)" valeur={config?.securite?.jwt_expiration} />
            <Ligne label="Environnement" valeur={config?.environnement} />
          </Card>

          <Card className="p-6">
            <div className="mb-2 flex items-center gap-2 text-on-surface">
              <Icon name="info" size={20} />
              <h3 className="font-display text-lg font-bold">À propos</h3>
            </div>
            <p className="text-sm text-on-surface-variant">
              La configuration est définie côté serveur (variables d'environnement). Cette page en
              donne un aperçu non sensible.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
