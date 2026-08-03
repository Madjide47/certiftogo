// ─────────────────────────────────────────────────────────────
// File d'ancrage blockchain.
//
// Certifier 400 diplômes prendrait des heures si chaque écriture on-chain
// bloquait l'agent : les diplômes sont donc émis tout de suite et
// l'ancrage part dans une file traitée par un worker, avec reprise
// exponentielle sur échec.
//
// Cet écran existe pour une raison précise : quand une tâche a épuisé ses
// tentatives, personne ne le sait. Elle tombe dans la file des
// abandonnées, et sans écran pour la voir, un diplôme reste indéfiniment
// non ancré alors que la base le dit certifié.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  etatAncrage,
  tachesAbandonnees,
  relancerTache,
  traiterFile,
} from '../../services/ancrage.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Section,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Bouton,
  Chiffre,
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';

const STATUTS_FILE = {
  en_attente: { libelle: 'En attente', ton: 'info' },
  en_cours: { libelle: 'En cours', ton: 'alerte' },
  confirmee: { libelle: 'Confirmée', ton: 'vert' },
  echouee: { libelle: 'En échec', ton: 'alerte' },
  abandonnee: { libelle: 'Abandonnée', ton: 'erreur' },
};

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Le coût est stocké en wei ; on l'affiche en POL, l'unité du réseau. */
function enPol(wei) {
  const n = Number(wei || 0) / 1e18;
  if (n === 0) return '—';
  return `${n.toFixed(4)} POL`;
}

export default function AncragePage() {
  const [file, setFile] = useState([]);
  const [couts, setCouts] = useState([]);
  const [abandonnees, setAbandonnees] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [travail, setTravail] = useState(false);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      const [etat, taches] = await Promise.all([etatAncrage(), tachesAbandonnees()]);
      setFile(etat.file || []);
      setCouts(etat.couts || []);
      setAbandonnees(taches);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function relancer(tache) {
    setErreur('');
    setSucces('');
    try {
      await relancerTache(tache.id);
      setSucces(
        `Tâche remise en file pour ${tache.diplome_reference}. Le compteur de tentatives est remis à zéro.`
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function traiter() {
    setTravail(true);
    setErreur('');
    setSucces('');
    try {
      const res = await traiterFile(25);
      setSucces(
        `${res.traitees ?? 0} tâche(s) traitées${res.echecs ? `, ${res.echecs} en échec` : ''}.`
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setTravail(false);
    }
  }

  if (chargement) return <Chargement />;

  const parStatut = Object.fromEntries(file.map((f) => [f.statut, f.total]));
  const enAttente = (parStatut.en_attente || 0) + (parStatut.en_cours || 0);
  const coutTotal = couts.reduce((somme, c) => somme + Number(c.cout_wei || 0), 0);

  return (
    <div>
      <EnTetePage
        titre="File d'ancrage"
        description="Les écritures blockchain en attente, et ce qu'elles coûtent."
        fil={[{ libelle: 'Certification' }, { libelle: "File d'ancrage" }]}
      >
        <Bouton variante="secondaire" icone="refresh" onClick={charger}>
          Actualiser
        </Bouton>
        <Bouton icone="play_arrow" enCours={travail} onClick={traiter} disabled={enAttente === 0}>
          Traiter une tranche
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

      {abandonnees.length > 0 && (
        <div className="mb-5">
          <Encart
            ton="erreur"
            titre={`${abandonnees.length} ancrage(s) abandonné(s)`}
          >
            Ces diplômes sont certifiés en base mais <strong>absents de la blockchain</strong> :
            leur vérification publique indiquera « non ancré ». Corrigez la cause — solde du
            compte, RPC injoignable — puis relancez.
          </Encart>
        </div>
      )}

      <Section titre="État de la file">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Chiffre
            libelle="En attente"
            valeur={enAttente}
            ton={enAttente > 0 ? 'alerte' : 'neutre'}
          />
          <Chiffre libelle="Confirmées" valeur={parStatut.confirmee ?? 0} ton="vert" />
          <Chiffre
            libelle="En échec"
            valeur={parStatut.echouee ?? 0}
            precision="reprise automatique"
            ton={parStatut.echouee > 0 ? 'alerte' : 'neutre'}
          />
          <Chiffre
            libelle="Abandonnées"
            valeur={parStatut.abandonnee ?? 0}
            precision="intervention requise"
            ton={parStatut.abandonnee > 0 ? 'erreur' : 'neutre'}
          />
          <Chiffre libelle="Coût cumulé" valeur={enPol(coutTotal)} precision="Polygon Amoy" />
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
          <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
          Une tâche en échec est reprise automatiquement avec un délai croissant. Elle n'est
          « abandonnée » qu'après épuisement de ses tentatives — c'est alors seulement qu'une
          intervention humaine est nécessaire.
        </p>
      </Section>

      <Section
        titre="Ancrages abandonnés"
        description="La file des échecs définitifs. Chaque ligne est un diplôme non ancré."
      >
        <Tableau
          legende="Tâches d'ancrage abandonnées"
          lignes={abandonnees}
          colonnes={[
            {
              cle: 'diplome_reference',
              libelle: 'Diplôme',
              tabulaire: true,
              rendu: (t) => <span className="font-medium">{t.diplome_reference}</span>,
            },
            {
              cle: 'operation',
              libelle: 'Opération',
              rendu: (t) => (t.operation === 'revoquer' ? 'Révocation' : 'Certification'),
            },
            {
              cle: 'tentatives',
              libelle: 'Tentatives',
              alignement: 'droite',
              tabulaire: true,
              rendu: (t) => `${t.tentatives} / ${t.max_tentatives}`,
            },
            {
              cle: 'derniere_erreur',
              libelle: 'Dernière erreur',
              rendu: (t) => (
                <span className="text-erreur">{t.derniere_erreur || 'non renseignée'}</span>
              ),
            },
            {
              cle: 'date_traitement',
              libelle: 'Dernier essai',
              rendu: (t) => horodatage(t.date_traitement),
            },
            {
              cle: 'actions',
              libelle: 'Actions',
              alignement: 'droite',
              rendu: (t) => (
                <Bouton variante="discret" onClick={() => relancer(t)}>
                  Relancer
                </Bouton>
              ),
            },
          ]}
          vide={
            <EtatVide icone="task_alt" titre="Aucun ancrage abandonné">
              Tout ce qui a été certifié est ancré, ou en cours de l'être.
            </EtatVide>
          }
        />
      </Section>

      <Section
        titre="Coût par établissement"
        description="Ce que la certification a réellement consommé sur le réseau."
      >
        <Tableau
          legende="Coût blockchain par établissement"
          lignes={couts}
          cle={(c) => c.code}
          colonnes={[
            { cle: 'code', libelle: 'Code', tabulaire: true },
            { cle: 'nom', libelle: 'Établissement' },
            {
              cle: 'transactions',
              libelle: 'Transactions',
              alignement: 'droite',
              tabulaire: true,
            },
            {
              cle: 'cout_wei',
              libelle: 'Coût',
              alignement: 'droite',
              tabulaire: true,
              rendu: (c) => enPol(c.cout_wei),
            },
          ]}
          vide={
            <EtatVide icone="savings" titre="Aucun coût mesuré">
              Aucune transaction ne remonte encore de coût. En mode « mock », aucune écriture
              réelle n'est faite : le coût n'apparaît qu'en mode on-chain.
            </EtatVide>
          }
        />
      </Section>
    </div>
  );
}
