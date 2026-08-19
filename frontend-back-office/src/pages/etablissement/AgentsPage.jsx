// ─────────────────────────────────────────────────────────────
// Agents de l'établissement — comptes, sous-rôles, organisation interne
// et départ d'un agent.
//
// L'écran explique le mode de fonctionnement AVANT de lister les agents :
// sans cela, les sous-rôles affichés n'ont aucun sens visible pour un
// établissement en mode simple, où ils n'ont aucun effet.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  monProfil,
  listerAgents,
  creerAgent,
  definirModeWorkflow,
  transfererDossiers,
} from '../../services/structure.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Section,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Modale,
  Bouton,
  Champ,
  Saisie,
  Liste,
  Chargement,
} from '../../components/ui/index.jsx';

const SOUS_ROLES = [
  { value: 'agent_saisie', label: 'Agent de saisie', aide: 'Crée les étudiants et les promotions.' },
  {
    value: 'chef_scolarite',
    label: 'Chef de scolarité',
    aide: 'Contrôle, corrige et arrête les résultats.',
  },
  { value: 'directeur', label: 'Directeur', aide: 'Seul à pouvoir transmettre au ministère.' },
];

const LIBELLE_SOUS_ROLE = Object.fromEntries(SOUS_ROLES.map((s) => [s.value, s.label]));
const AGENT_VIDE = { nom: '', prenom: '', telephone: '', sous_role: 'agent_saisie' };

export default function AgentsPage() {
  const [profil, setProfil] = useState(null);
  const [agents, setAgents] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const [modale, setModale] = useState(false);
  const [form, setForm] = useState(AGENT_VIDE);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const [depart, setDepart] = useState(null);
  const [repreneur, setRepreneur] = useState('');

  async function charger() {
    setChargement(true);
    try {
      const [p, a] = await Promise.all([monProfil(), listerAgents()]);
      setProfil(p);
      setAgents(a);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  const hierarchique = profil?.mode_workflow === 'hierarchique';
  const estPrincipal = agents.some(
    (a) => a.est_agent_principal && a.sous_role === profil?.sous_role
  );

  async function basculerMode() {
    setErreur('');
    setSucces('');
    try {
      const etab = await definirModeWorkflow(hierarchique ? 'simple' : 'hierarchique');
      setSucces(
        etab.mode_workflow === 'hierarchique'
          ? 'Mode hiérarchique activé : seul le directeur peut désormais transmettre.'
          : 'Mode simple rétabli : tous les agents disposent de toutes les permissions.'
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function soumettre(e) {
    e.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      await creerAgent(form);
      setModale(false);
      setForm(AGENT_VIDE);
      setSucces('Agent créé. Il peut se connecter avec son numéro de téléphone.');
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function confirmerDepart(e) {
    e.preventDefault();
    setErreur('');
    try {
      const res = await transfererDossiers({
        agent_id: depart.id,
        repreneur_id: repreneur,
        desactiver: true,
      });
      setDepart(null);
      setRepreneur('');
      setSucces(
        `${res.dossiers_transferes} dossier(s) transféré(s). Le compte est désactivé et ses sessions sont closes.`
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  if (chargement) return <Chargement />;

  const repreneursPossibles = agents
    .filter((a) => a.actif && a.id !== depart?.id)
    .map((a) => ({ value: a.id, label: `${a.nom} ${a.prenom}` }));

  return (
    <div>
      <EnTetePage
        titre="Agents"
        description="Comptes de votre établissement et organisation interne du travail."
        fil={[{ libelle: 'Administration' }, { libelle: 'Agents' }]}
      >
        <Bouton icone="person_add" onClick={() => setModale(true)}>
          Créer un agent
        </Bouton>
      </EnTetePage>

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}
      {succes && (
        <div className="mb-4">
          <Encart ton="succes">{succes}</Encart>
        </div>
      )}

      <Section titre="Organisation du travail">
        <div className="border border-gris-300 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-base font-bold">
                Mode {hierarchique ? 'hiérarchique' : 'simple'}
              </p>
              <p className="mt-1 text-base text-gris-700">
                {hierarchique ? (
                  <>
                    L'agent de saisie produit la donnée, le chef de scolarité contrôle et arrête
                    les résultats, et <strong>seul le directeur transmet au ministère</strong>. Une
                    promotion passe par un contrôle interne puis une validation avant d'être
                    envoyée.
                  </>
                ) : (
                  <>
                    Tous les agents disposent de toutes les permissions et une promotion part
                    directement au ministère. C'est le mode adapté à une scolarité tenue par une
                    ou deux personnes.
                  </>
                )}
              </p>
            </div>
            <Bouton variante="secondaire" icone="swap_horiz" onClick={basculerMode}>
              Passer en mode {hierarchique ? 'simple' : 'hiérarchique'}
            </Bouton>
          </div>

          {!hierarchique && (
            <p className="mt-3 border-t border-gris-200 pt-3 text-sm text-gris-500">
              En mode simple, les sous-rôles ci-dessous sont enregistrés mais sans effet sur les
              permissions.
            </p>
          )}
        </div>
      </Section>

      <Section titre="Comptes">
        <Tableau
          legende="Agents de l'établissement"
          lignes={agents}
          colonnes={[
            {
              cle: 'nom',
              libelle: 'Agent',
              rendu: (a) => (
                <span>
                  <span className="font-medium">
                    {a.nom} {a.prenom}
                  </span>
                  {a.est_agent_principal && (
                    <span className="ml-2">
                      <Etiquette ton="vert">Agent principal</Etiquette>
                    </span>
                  )}
                </span>
              ),
            },
            { cle: 'telephone', libelle: 'Téléphone', tabulaire: true },
            {
              cle: 'sous_role',
              libelle: 'Sous-rôle',
              rendu: (a) => LIBELLE_SOUS_ROLE[a.sous_role] || '—',
            },
            {
              cle: 'actif',
              libelle: 'Statut',
              rendu: (a) => (
                <Etiquette ton={a.actif ? 'succes' : 'neutre'}>
                  {a.actif ? 'Actif' : 'Désactivé'}
                </Etiquette>
              ),
            },
            {
              cle: 'actions',
              libelle: 'Actions',
              alignement: 'droite',
              rendu: (a) =>
                a.actif && !a.est_agent_principal ? (
                  <Bouton variante="discret" onClick={() => setDepart(a)}>
                    Organiser son départ
                  </Bouton>
                ) : (
                  <span className="text-gris-500">—</span>
                ),
            },
          ]}
          vide={<EtatVide icone="badge" titre="Aucun agent" />}
        />
      </Section>

      {/* ── Création ── */}
      <Modale ouvert={modale} titre="Créer un agent" onFermer={() => setModale(false)}>
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && <Encart ton="erreur">{erreurForm}</Encart>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Nom" htmlFor="nom" requis>
              <Saisie
                id="nom"
                required
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
            </Champ>
            <Champ label="Prénom" htmlFor="prenom" requis>
              <Saisie
                id="prenom"
                required
                value={form.prenom}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
              />
            </Champ>
          </div>

          <Champ
            label="Téléphone"
            htmlFor="telephone"
            requis
            aide="Ce numéro servira d'identifiant de connexion. Il doit être unique sur la plateforme."
          >
            <Saisie
              id="telephone"
              required
              placeholder="+228 90 00 00 00"
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            />
          </Champ>

          <Champ
            label="Sous-rôle"
            htmlFor="sous_role"
            aide={SOUS_ROLES.find((s) => s.value === form.sous_role)?.aide}
          >
            <Liste
              id="sous_role"
              vide={null}
              value={form.sous_role}
              onChange={(e) => setForm({ ...form, sous_role: e.target.value })}
              options={SOUS_ROLES}
            />
          </Champ>

          <Encart ton="info">
            Le nouvel agent n'est jamais agent principal : seul celui désigné par le ministère à
            l'agrément peut créer des comptes.
          </Encart>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setModale(false)}>
              Annuler
            </Bouton>
            <Bouton type="submit" enCours={enregistrement}>
              Créer l'agent
            </Bouton>
          </div>
        </form>
      </Modale>

      {/* ── Départ ── */}
      <Modale
        ouvert={Boolean(depart)}
        titre={`Départ de ${depart?.nom || ''} ${depart?.prenom || ''}`}
        onFermer={() => setDepart(null)}
      >
        <form onSubmit={confirmerDepart} className="space-y-4">
          <Encart ton="alerte" titre="Cette action est immédiate">
            Le compte sera désactivé et ses sessions ouvertes fermées. Ses dossiers <strong>en
            cours</strong> passeront au repreneur ; les dossiers déjà certifiés conserveront son
            nom, car c'est une trace historique.
          </Encart>

          <Champ
            label="Repreneur des dossiers en cours"
            htmlFor="repreneur"
            requis
            aide="Un agent actif de votre établissement."
          >
            <Liste
              id="repreneur"
              required
              value={repreneur}
              onChange={(e) => setRepreneur(e.target.value)}
              options={repreneursPossibles}
            />
          </Champ>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setDepart(null)}>
              Annuler
            </Bouton>
            <Bouton type="submit" variante="danger" disabled={!repreneur}>
              Transférer et désactiver
            </Bouton>
          </div>
        </form>
      </Modale>
    </div>
  );
}
