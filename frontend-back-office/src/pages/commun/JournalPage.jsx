// ─────────────────────────────────────────────────────────────
// Journal d'audit — « qui a fait quoi ».
//
// Écran partagé par l'établissement, le ministère et l'administration :
// c'est le serveur qui décide de la portée. Un établissement ne reçoit
// que ses propres actions, sans avoir à le demander.
//
// L'entrée développée montre les valeurs AVANT et APRÈS : c'est la pièce
// qu'on produit en cas de contestation, pas la ligne de résumé.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { consulterJournal, exporterJournal } from '../../services/journal.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Bouton,
  Champ,
  Saisie,
  Liste,
  Icone,
} from '../../components/ui/index.jsx';

const ACTIONS = [
  { value: 'connexion_reussie', label: 'Connexion réussie' },
  { value: 'connexion_echouee', label: 'Connexion échouée' },
  { value: 'candidat_cree', label: 'Étudiant créé' },
  { value: 'candidat_modifie', label: 'Étudiant modifié' },
  { value: 'candidat_supprime', label: 'Étudiant supprimé' },
  { value: 'import_execute', label: 'Import exécuté' },
  { value: 'lot_transmis', label: 'Lot transmis' },
  { value: 'lot_examine', label: 'Lot examiné' },
  { value: 'lot_valide', label: 'Lot validé' },
  { value: 'lot_rejete', label: 'Lot rejeté' },
  { value: 'diplome_certifie', label: 'Diplôme certifié' },
  { value: 'diplome_revoque', label: 'Diplôme révoqué' },
  { value: 'diplome_corrige', label: 'Diplôme corrigé' },
  { value: 'agent_cree', label: 'Agent créé' },
  { value: 'agent_depart', label: "Départ d'un agent" },
];

const LIBELLES = Object.fromEntries(ACTIONS.map((a) => [a.value, a.label]));

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function JournalPage() {
  const [entrees, setEntrees] = useState([]);
  const [total, setTotal] = useState(0);
  const [filtres, setFiltres] = useState({ action: '', resultat: '', depuis: '' });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [ouverte, setOuverte] = useState(null);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      const data = await consulterJournal({ ...filtres, limit: 200 });
      setEntrees(data.entrees);
      setTotal(data.total);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres]);

  async function telecharger() {
    try {
      const blob = await exporterJournal(filtres);
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'journal-audit.csv';
      lien.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  return (
    <div>
      <EnTetePage
        titre="Journal"
        description="Chaque action sensible est enregistrée avec son auteur, son origine et son résultat."
        fil={[{ libelle: 'Supervision' }, { libelle: 'Journal' }]}
      >
        <Bouton variante="secondaire" icone="download" onClick={telecharger}>
          Exporter en CSV
        </Bouton>
      </EnTetePage>

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Champ label="Action" htmlFor="f-action">
          <Liste
            id="f-action"
            vide="Toutes les actions"
            value={filtres.action}
            onChange={(e) => setFiltres({ ...filtres, action: e.target.value })}
            options={ACTIONS}
          />
        </Champ>
        <Champ label="Résultat" htmlFor="f-resultat">
          <Liste
            id="f-resultat"
            vide="Tous"
            value={filtres.resultat}
            onChange={(e) => setFiltres({ ...filtres, resultat: e.target.value })}
            options={[
              { value: 'succes', label: 'Succès' },
              { value: 'echec', label: 'Échec' },
            ]}
          />
        </Champ>
        <Champ label="Depuis le" htmlFor="f-depuis">
          <Saisie
            id="f-depuis"
            type="date"
            value={filtres.depuis}
            onChange={(e) => setFiltres({ ...filtres, depuis: e.target.value })}
          />
        </Champ>
      </div>

      <p className="mb-2 text-sm text-gris-500">
        {total} entrée(s) — {entrees.length} affichée(s).
      </p>

      <Tableau
        legende="Journal d'audit"
        chargement={chargement}
        lignes={entrees}
        colonnes={[
          {
            cle: 'date_action',
            libelle: 'Date',
            tabulaire: true,
            rendu: (e) => horodatage(e.date_action),
          },
          {
            cle: 'auteur_libelle',
            libelle: 'Auteur',
            rendu: (e) => (
              <span>
                <span className="font-medium">{e.auteur_libelle || '—'}</span>
                {e.role && <span className="block text-xs text-gris-500">{e.role}</span>}
              </span>
            ),
          },
          {
            cle: 'action',
            libelle: 'Action',
            rendu: (e) => LIBELLES[e.action] || e.action.replace(/_/g, ' '),
          },
          {
            cle: 'message',
            libelle: 'Détail',
            rendu: (e) => <span className="text-gris-700">{e.message || '—'}</span>,
          },
          {
            cle: 'resultat',
            libelle: 'Résultat',
            rendu: (e) => (
              <Etiquette ton={e.resultat === 'echec' ? 'erreur' : 'succes'}>
                {e.resultat === 'echec' ? 'Échec' : 'Succès'}
              </Etiquette>
            ),
          },
          {
            cle: 'actions',
            libelle: '',
            alignement: 'droite',
            rendu: (e) =>
              e.valeurs_avant || e.valeurs_apres || e.transaction_hash ? (
                <Bouton
                  variante="discret"
                  onClick={() => setOuverte(ouverte?.id === e.id ? null : e)}
                >
                  {ouverte?.id === e.id ? 'Masquer' : 'Voir'}
                </Bouton>
              ) : null,
          },
        ]}
        vide={
          <EtatVide icone="history" titre="Aucune entrée">
            Aucune action ne correspond à ces filtres.
          </EtatVide>
        }
      />

      {ouverte && (
        <div className="mt-4 border border-gris-300 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg">
              {LIBELLES[ouverte.action] || ouverte.action} — {horodatage(ouverte.date_action)}
            </h2>
            <Bouton variante="discret" onClick={() => setOuverte(null)}>
              Fermer
            </Bouton>
          </div>

          <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gris-500">Auteur</dt>
              <dd className="font-medium">{ouverte.auteur_libelle || '—'}</dd>
            </div>
            <div>
              <dt className="text-gris-500">Adresse IP</dt>
              <dd className="tabulaire font-medium">{ouverte.adresse_ip || '—'}</dd>
            </div>
            <div>
              <dt className="text-gris-500">Entité</dt>
              <dd className="font-medium">{ouverte.entite || '—'}</dd>
            </div>
          </dl>

          {ouverte.transaction_hash && (
            <div className="mb-4">
              <Encart ton="info" titre="Transaction blockchain associée">
                <code className="break-all font-mono text-xs">{ouverte.transaction_hash}</code>
              </Encart>
            </div>
          )}

          {(ouverte.valeurs_avant || ouverte.valeurs_apres) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-bold text-gris-700">Avant</p>
                <pre className="overflow-x-auto border border-gris-200 bg-gris-50 p-3 font-mono text-xs">
                  {JSON.stringify(ouverte.valeurs_avant ?? null, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-sm font-bold text-gris-700">Après</p>
                <pre className="overflow-x-auto border border-gris-200 bg-gris-50 p-3 font-mono text-xs">
                  {JSON.stringify(ouverte.valeurs_apres ?? null, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
            <Icone nom="lock" taille={16} className="mt-0.5 shrink-0" />
            L'identité de l'auteur est figée au moment de l'action : supprimer un compte n'efface
            pas l'historique de ses actes.
          </p>
        </div>
      )}
    </div>
  );
}
