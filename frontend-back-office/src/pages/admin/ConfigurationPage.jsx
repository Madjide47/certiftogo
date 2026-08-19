// ─────────────────────────────────────────────────────────────
// Configuration en vigueur.
//
// Lecture seule, et c'est voulu : ces réglages viennent des variables
// d'environnement du serveur. Les rendre modifiables depuis le navigateur
// donnerait à un compte web le pouvoir de basculer la plateforme en mode
// simulation — donc d'émettre des diplômes ancrés nulle part.
//
// L'écran sert à CONSTATER, en particulier l'écart entre ce que l'équipe
// croit avoir déployé et ce qui tourne réellement.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { configurationAdmin } from '../../services/admin.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Section,
  Encart,
  Etiquette,
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';

function Ligne({ label, valeur, mono, ton }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gris-200 px-4 py-2.5 last:border-0">
      <dt className="text-sm text-gris-500">{label}</dt>
      <dd
        className={`text-right text-base font-medium text-gris-900 ${
          mono ? 'break-all font-mono text-xs' : ''
        }`}
      >
        {ton ? <Etiquette ton={ton}>{valeur}</Etiquette> : valeur || '—'}
      </dd>
    </div>
  );
}

export default function ConfigurationPage() {
  const [configuration, setConfiguration] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    configurationAdmin()
      .then(setConfiguration)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  const chaine = configuration?.blockchain || {};
  const otp = configuration?.otp || {};
  const securite = configuration?.securite || {};
  const production = configuration?.environnement === 'production';
  const simulation = chaine.mode !== 'onchain';

  return (
    <div>
      <EnTetePage
        titre="Configuration"
        description="Réglages effectivement en vigueur sur ce serveur. Ils se modifient par les variables d’environnement, pas depuis cet écran."
        fil={[{ libelle: 'Système' }, { libelle: 'Configuration' }]}
      />

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {chargement ? (
        <Chargement />
      ) : (
        <div className="max-w-3xl">
          {production && simulation && (
            <div className="mb-5">
              <Encart ton="erreur" titre="Production en mode simulation">
                Le serveur tourne en production alors que la blockchain est en mode « mock » : les
                diplômes certifiés ne sont inscrits sur AUCUNE chaîne, et la vérification publique
                les donnera pour non ancrés. À corriger avant toute certification réelle.
              </Encart>
            </div>
          )}

          {securite.signature_ministere === 'absente' && (
            <div className="mb-5">
              <Encart ton="alerte" titre="Secret de signature absent">
                Aucun secret de signature ministériel n’est configuré. En production le serveur
                refuse de démarrer sans lui ; en développement, un secret de repli est utilisé et
                les signatures produites n’ont aucune valeur probante.
              </Encart>
            </div>
          )}

          <Section titre="Environnement">
            <div className="border border-gris-300 bg-white">
              <dl>
                <Ligne
                  label="Mode d’exécution"
                  valeur={configuration?.environnement}
                  ton={production ? 'vert' : 'neutre'}
                />
              </dl>
            </div>
          </Section>

          <Section titre="Blockchain">
            <div className="border border-gris-300 bg-white">
              <dl>
                <Ligne
                  label="Mode"
                  valeur={chaine.mode === 'onchain' ? 'Ancrage réel' : 'Simulation (mock)'}
                  ton={chaine.mode === 'onchain' ? 'succes' : 'alerte'}
                />
                <Ligne label="Adresse du contrat" valeur={chaine.contrat_adresse} mono />
                <Ligne label="Nœud RPC" valeur={chaine.rpc_url} mono />
              </dl>
            </div>
            {simulation && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-gris-500">
                <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
                En simulation, les transactions sont fabriquées localement : aucun frais n’est
                payé et rien n’est inscrit sur la chaîne publique.
              </p>
            )}
          </Section>

          <Section titre="Connexion des utilisateurs">
            <div className="border border-gris-300 bg-white">
              <dl>
                <Ligne label="Longueur du code" valeur={`${otp.longueur} chiffres`} />
                <Ligne label="Validité du code" valeur={`${otp.expiration_minutes} minutes`} />
                <Ligne
                  label="Canal d’envoi"
                  valeur={otp.canal}
                  ton={otp.mode === 'cloud' ? 'succes' : 'alerte'}
                />
                <Ligne label="Durée de session" valeur={securite.jwt_expiration} />
              </dl>
            </div>
            {otp.mode !== 'cloud' && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-gris-500">
                <Icone nom="terminal" taille={16} className="mt-0.5 shrink-0" />
                Les codes de connexion s’affichent dans la console du serveur : personne ne les
                reçoit sur son téléphone. Utilisable en démonstration, pas en service réel.
              </p>
            )}
          </Section>

          <Section titre="Signature">
            <div className="border border-gris-300 bg-white">
              <dl>
                <Ligne
                  label="Secret ministériel"
                  valeur={securite.signature_ministere}
                  ton={securite.signature_ministere === 'configurée' ? 'succes' : 'erreur'}
                />
              </dl>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="key" taille={16} className="mt-0.5 shrink-0" />
              La clé elle-même n’est exposée nulle part. Le registre des empreintes et la
              procédure de compromission vivent dans l’écran « Clés de signature ».
            </p>
          </Section>
        </div>
      )}
    </div>
  );
}
