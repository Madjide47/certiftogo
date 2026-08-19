// ─────────────────────────────────────────────────────────────
// Récupération de compte après perte du téléphone (ERR-003).
//
// Le dépôt de la demande est public — le demandeur a justement perdu
// l'accès à son compte. Rien de ce qu'il déclare ne prouve quoi que ce
// soit : c'est l'agent qui tranche, pièce d'identité en main. Cet écran
// n'est donc pas un formulaire de vérification automatique, c'est le
// dossier que l'agent consulte AVANT de reconnaître la personne devant
// lui.
//
// Accepter bascule le compte sur le nouveau numéro et coupe toutes les
// sessions ouvertes : l'ancien téléphone est peut-être entre d'autres
// mains. C'est écrit à l'écran, parce qu'accepter à tort donne un
// portefeuille de diplômes à un inconnu.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  listerRecuperations,
  validerRecuperation,
  refuserRecuperation,
} from '../../services/recuperation.service.js';
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
  Zone,
  Liste,
  Modale,
  Icone,
} from '../../components/ui/index.jsx';

const STATUTS = {
  soumise: { libelle: 'À instruire', ton: 'alerte' },
  acceptee: { libelle: 'Acceptée', ton: 'succes' },
  refusee: { libelle: 'Refusée', ton: 'erreur' },
};

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function RecuperationsPage() {
  const [demandes, setDemandes] = useState([]);
  const [statut, setStatut] = useState('soumise');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [ouverte, setOuverte] = useState(null);
  const [refus, setRefus] = useState(null);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setDemandes(await listerRecuperations({ statut }));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statut]);

  return (
    <div>
      <EnTetePage
        titre="Récupérations de compte"
        description="Demandes déposées par des titulaires qui ont perdu l'accès à leur numéro de téléphone."
        fil={[{ libelle: 'Supervision' }, { libelle: 'Récupérations' }]}
      />

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

      <div className="mb-4">
        <Encart ton="alerte" titre="Aucune pièce du dossier ne fait preuve">
          Nom, date de naissance, numéro étudiant : tout ce qui figure ici a été saisi par le
          demandeur. Ne validez qu'après avoir vu la personne et sa pièce d'identité.
        </Encart>
      </div>

      <div className="mb-4 max-w-xs">
        <Champ label="Statut" htmlFor="f-statut">
          <Liste
            id="f-statut"
            vide="Tous les statuts"
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            options={[
              { value: 'soumise', label: 'À instruire' },
              { value: 'acceptee', label: 'Acceptées' },
              { value: 'refusee', label: 'Refusées' },
            ]}
          />
        </Champ>
      </div>

      <Tableau
        legende="Demandes de récupération de compte"
        chargement={chargement}
        lignes={demandes}
        colonnes={[
          {
            cle: 'reference',
            libelle: 'Référence',
            tabulaire: true,
            rendu: (d) => (
              <span>
                <span className="font-medium">{d.reference}</span>
                <span className="block text-xs text-gris-500">{horodatage(d.date_demande)}</span>
              </span>
            ),
          },
          {
            cle: 'demandeur',
            libelle: 'Demandeur déclaré',
            rendu: (d) => (
              <span>
                <span className="font-medium">
                  {d.nom?.toUpperCase()} {d.prenom}
                </span>
                <span className="block text-xs text-gris-500">
                  {d.numero_etudiant || 'sans numéro étudiant'} · né(e) le {date(d.date_naissance)}
                </span>
              </span>
            ),
          },
          {
            cle: 'telephones',
            libelle: 'Numéro',
            tabulaire: true,
            rendu: (d) => (
              <span>
                <span className="block text-xs text-gris-500">{d.telephone_ancien || '—'}</span>
                <span className="font-medium">→ {d.telephone_nouveau}</span>
              </span>
            ),
          },
          {
            cle: 'rapprochement',
            libelle: 'Compte',
            rendu: (d) =>
              d.utilisateur_id ? (
                <Etiquette ton="info">Rapproché</Etiquette>
              ) : (
                <Etiquette ton="alerte">À identifier</Etiquette>
              ),
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (d) => (
              <Etiquette ton={STATUTS[d.statut]?.ton || 'neutre'}>
                {STATUTS[d.statut]?.libelle || d.statut}
              </Etiquette>
            ),
          },
          {
            cle: 'actions',
            libelle: '',
            alignement: 'droite',
            rendu: (d) => (
              <Bouton variante="discret" onClick={() => setOuverte(d)}>
                Instruire
              </Bouton>
            ),
          },
        ]}
        vide={
          <EtatVide icone="phonelink_lock" titre="Aucune demande">
            {statut === 'soumise'
              ? 'Aucune demande en attente d’instruction.'
              : 'Aucune demande pour ce statut.'}
          </EtatVide>
        }
      />

      <ModaleInstruction
        demande={ouverte}
        onFermer={() => setOuverte(null)}
        onRefuser={(d) => {
          setOuverte(null);
          setRefus(d);
        }}
        onValide={(resultat) => {
          setOuverte(null);
          setSucces(
            `Récupération ${resultat.reference} validée : le compte est passé de ${resultat.ancien_telephone} à ${resultat.nouveau_telephone}. Toutes les sessions ouvertes ont été coupées.`
          );
          charger();
        }}
        onErreur={setErreur}
      />

      <ModaleRefus
        demande={refus}
        onFermer={() => setRefus(null)}
        onRefuse={(resultat) => {
          setRefus(null);
          setSucces(`Demande ${resultat.reference} refusée.`);
          charger();
        }}
        onErreur={setErreur}
      />
    </div>
  );
}

/* ── Instruction ─────────────────────────────────────────────────── */

function ModaleInstruction({ demande, onFermer, onRefuser, onValide, onErreur }) {
  const [compte, setCompte] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    setCompte('');
  }, [demande?.id]);

  if (!demande) return null;

  const instruite = demande.statut !== 'soumise';
  const identifiant = demande.utilisateur_id || compte.trim();

  async function valider() {
    setEnCours(true);
    try {
      const resultat = await validerRecuperation(demande.id, {
        utilisateur_id: demande.utilisateur_id ? undefined : compte.trim(),
      });
      onValide(resultat);
    } catch (err) {
      onErreur(messageErreur(err));
      onFermer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale ouvert={Boolean(demande)} titre={`Demande ${demande.reference}`} onFermer={onFermer}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gris-500">Identité déclarée</dt>
          <dd className="font-medium">
            {demande.nom?.toUpperCase()} {demande.prenom}
          </dd>
        </div>
        <div>
          <dt className="text-gris-500">Date de naissance</dt>
          <dd className="tabulaire font-medium">{date(demande.date_naissance)}</dd>
        </div>
        <div>
          <dt className="text-gris-500">Ancien numéro</dt>
          <dd className="tabulaire font-medium">{demande.telephone_ancien || '—'}</dd>
        </div>
        <div>
          <dt className="text-gris-500">Nouveau numéro</dt>
          <dd className="tabulaire font-medium">{demande.telephone_nouveau}</dd>
        </div>
        <div>
          <dt className="text-gris-500">Numéro étudiant</dt>
          <dd className="font-medium">{demande.numero_etudiant || '—'}</dd>
        </div>
        <div>
          <dt className="text-gris-500">Diplôme invoqué</dt>
          <dd className="font-medium">{demande.reference_diplome || '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-gris-500">Pièce justificative annoncée</dt>
          <dd className="font-medium">{demande.piece_justificative || '—'}</dd>
        </div>
      </dl>

      {instruite ? (
        <div className="mt-4">
          <Encart ton={demande.statut === 'acceptee' ? 'succes' : 'info'}>
            Demande {STATUTS[demande.statut]?.libelle.toLowerCase()} le{' '}
            {horodatage(demande.date_decision)}
            {demande.motif_refus && ` — motif : ${demande.motif_refus}`}
          </Encart>
        </div>
      ) : (
        <>
          {!demande.utilisateur_id && (
            <div className="mt-4">
              <Encart ton="alerte" titre="Aucun compte rapproché automatiquement">
                Le nom déclaré ne correspond à aucune personne enregistrée. Sans identifiant de
                compte, la validation est refusée par le serveur : faites identifier le titulaire
                par l'administration système avant de poursuivre.
              </Encart>
              <div className="mt-3">
                <Champ
                  label="Identifiant du compte à récupérer"
                  htmlFor="compte"
                  aide="UUID du compte, communiqué par l'administration système."
                >
                  <Saisie
                    id="compte"
                    value={compte}
                    onChange={(e) => setCompte(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </Champ>
              </div>
            </div>
          )}

          <div className="mt-4">
            <Encart ton="alerte" titre="Ce que la validation déclenche">
              Le compte bascule immédiatement sur {demande.telephone_nouveau} et toutes ses sessions
              ouvertes sont coupées. L'ancien numéro ne donnera plus accès à rien.
            </Encart>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Bouton variante="secondaire" onClick={onFermer}>
              Fermer
            </Bouton>
            <Bouton variante="danger" icone="block" onClick={() => onRefuser(demande)}>
              Refuser
            </Bouton>
            <Bouton
              icone="check"
              onClick={valider}
              enCours={enCours}
              disabled={!identifiant}
            >
              Valider la récupération
            </Bouton>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
            <Icone nom="badge" taille={16} className="mt-0.5 shrink-0" />
            Votre identité est enregistrée au journal avec cette décision.
          </p>
        </>
      )}
    </Modale>
  );
}

/* ── Refus ───────────────────────────────────────────────────────── */

function ModaleRefus({ demande, onFermer, onRefuse, onErreur }) {
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    setMotif('');
  }, [demande?.id]);

  if (!demande) return null;

  async function refuser() {
    setEnCours(true);
    try {
      onRefuse(await refuserRecuperation(demande.id, motif.trim()));
    } catch (err) {
      onErreur(messageErreur(err));
      onFermer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale
      ouvert={Boolean(demande)}
      titre={`Refuser la demande ${demande.reference}`}
      onFermer={onFermer}
      largeur="max-w-lg"
    >
      <Champ
        label="Motif du refus"
        htmlFor="motif"
        requis
        aide="Le demandeur peut se présenter de nouveau : le motif doit lui dire ce qui manquait."
      >
        <Zone id="motif" value={motif} onChange={(e) => setMotif(e.target.value)} />
      </Champ>

      <div className="mt-4 flex justify-end gap-2">
        <Bouton variante="secondaire" onClick={onFermer}>
          Annuler
        </Bouton>
        <Bouton variante="danger" icone="block" onClick={refuser} enCours={enCours} disabled={!motif.trim()}>
          Confirmer le refus
        </Bouton>
      </div>
    </Modale>
  );
}
