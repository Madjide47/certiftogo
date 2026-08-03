// ─────────────────────────────────────────────────────────────
// Contrôle à quatre yeux (ADR-015).
//
// Certaines actions sont irréversibles ou massives : révoquer un diplôme
// ancré, certifier un lot entier. Un seul agent ne doit pas pouvoir les
// engager seul — pas par défiance, mais parce qu'une erreur de clic y
// coûte cher et ne se rattrape pas on-chain.
//
// Règle centrale, portée par la base (contrainte `chk_quatre_yeux`) :
// le demandeur ne peut pas être l'approbateur. L'écran l'annonce plutôt
// que de laisser l'agent découvrir le refus après coup.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  listerValidations,
  approuverValidation,
  refuserValidation,
} from '../../services/gouvernance.service.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Modale,
  Bouton,
  Champ,
  Zone,
  Onglets,
  Icone,
} from '../../components/ui/index.jsx';

const ACTIONS = {
  diplome_revoquer: 'Révocation d’un diplôme',
  lot_certifier: 'Certification d’un lot',
};

const STATUTS = {
  en_attente: { libelle: 'En attente', ton: 'alerte' },
  approuvee: { libelle: 'Approuvée', ton: 'succes' },
  refusee: { libelle: 'Refusée', ton: 'erreur' },
  expiree: { libelle: 'Expirée', ton: 'neutre' },
};

const ONGLETS = [
  { cle: 'en_attente', libelle: 'À traiter' },
  { cle: 'approuvee', libelle: 'Approuvées' },
  { cle: 'refusee', libelle: 'Refusées' },
  { cle: 'expiree', libelle: 'Expirées' },
];

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Une demande périmée n'est plus approuvable : le dire évite un clic vain. */
function expiration(v) {
  if (!v) return null;
  const restant = new Date(v).getTime() - Date.now();
  if (restant <= 0) return 'expirée';
  const heures = Math.round(restant / 3600000);
  return heures < 24 ? `expire dans ${heures} h` : `expire dans ${Math.round(heures / 24)} j`;
}

export default function ValidationsPage() {
  const { utilisateur } = useAuth();
  const [validations, setValidations] = useState([]);
  const [active, setActive] = useState(true);
  const [onglet, setOnglet] = useState('en_attente');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const [refus, setRefus] = useState(null);
  const [motif, setMotif] = useState('');
  const [action, setAction] = useState(false);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      const data = await listerValidations({ statut: onglet });
      setValidations(data.validations);
      setActive(data.active);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet]);

  async function approuver(v) {
    setAction(true);
    setErreur('');
    setSucces('');
    try {
      await approuverValidation(v.id);
      setSucces("Demande approuvée : l'action a été exécutée.");
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  async function confirmerRefus(e) {
    e.preventDefault();
    setAction(true);
    setErreur('');
    try {
      await refuserValidation(refus.id, motif);
      setRefus(null);
      setMotif('');
      setSucces("Demande refusée : l'action n'a pas été exécutée.");
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  // Le serveur refusera de toute façon ; l'afficher évite de le découvrir
  // au clic, et explique pourquoi le bouton n'est pas disponible.
  const estDemandeur = (v) =>
    v.demandeur_id === utilisateur?.id ||
    (v.demandeur_libelle && v.demandeur_libelle === `${utilisateur?.nom} ${utilisateur?.prenom}`);

  return (
    <div>
      <EnTetePage
        titre="Validations"
        description="Les actions critiques exigent l'accord d'un second agent."
        fil={[{ libelle: 'Instruction' }, { libelle: 'Validations' }]}
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

      {!active && (
        <div className="mb-5">
          <Encart ton="alerte" titre="Contrôle à quatre yeux désactivé">
            Les révocations et certifications de lot s'exécutent actuellement sans second
            accord. Cet écran ne montre alors que l'historique.
          </Encart>
        </div>
      )}

      <div className="mb-5">
        <Encart ton="info">
          Un agent ne peut pas approuver sa propre demande — la base elle-même le refuse. Il
          faut donc deux comptes ministère distincts pour aller au bout d'une action critique.
        </Encart>
      </div>

      <Onglets onglets={ONGLETS} actif={onglet} onChanger={setOnglet} />

      <Tableau
        legende="Demandes de validation critique"
        chargement={chargement}
        lignes={validations}
        colonnes={[
          {
            cle: 'action',
            libelle: 'Action demandée',
            rendu: (v) => (
              <span>
                <span className="font-medium">{ACTIONS[v.action] || v.action}</span>
                <span className="block text-xs text-gris-500">
                  {v.entite} {v.entite_id?.slice(0, 8)}
                </span>
              </span>
            ),
          },
          {
            cle: 'demandeur_libelle',
            libelle: 'Demandé par',
            rendu: (v) => (
              <span>
                {v.demandeur_libelle || '—'}
                <span className="block text-xs text-gris-500">
                  {horodatage(v.date_demande)}
                </span>
              </span>
            ),
          },
          {
            cle: 'motif',
            libelle: 'Motif',
            rendu: (v) => <span className="text-gris-700">{v.motif || '—'}</span>,
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (v) => (
              <span>
                <Etiquette ton={STATUTS[v.statut]?.ton}>
                  {STATUTS[v.statut]?.libelle || v.statut}
                </Etiquette>
                {v.statut === 'en_attente' && (
                  <span className="block text-xs text-gris-500">
                    {expiration(v.date_expiration)}
                  </span>
                )}
                {v.motif_refus && (
                  <span className="block text-xs text-erreur">{v.motif_refus}</span>
                )}
                {v.approbateur_libelle && (
                  <span className="block text-xs text-gris-500">
                    par {v.approbateur_libelle}
                  </span>
                )}
              </span>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (v) => {
              if (v.statut !== 'en_attente') return <span className="text-gris-500">—</span>;
              if (estDemandeur(v)) {
                return (
                  <span className="flex items-center justify-end gap-1 text-sm text-gris-500">
                    <Icone nom="block" taille={16} />
                    Votre demande
                  </span>
                );
              }
              return (
                <span className="whitespace-nowrap">
                  <Bouton variante="discret" disabled={action} onClick={() => approuver(v)}>
                    Approuver
                  </Bouton>
                  <Bouton
                    variante="discret"
                    className="ml-3 text-erreur hover:text-erreur"
                    onClick={() => {
                      setRefus(v);
                      setMotif('');
                    }}
                  >
                    Refuser
                  </Bouton>
                </span>
              );
            },
          },
        ]}
        vide={
          <EtatVide icone="how_to_reg" titre="Aucune demande">
            {onglet === 'en_attente'
              ? 'Aucune action critique n’attend de second accord.'
              : 'Aucune demande dans cet état.'}
          </EtatVide>
        }
      />

      <Modale
        ouvert={Boolean(refus)}
        titre="Refuser la demande"
        onFermer={() => setRefus(null)}
      >
        <form onSubmit={confirmerRefus} className="space-y-4">
          <Encart ton="info">
            {ACTIONS[refus?.action] || refus?.action} demandée par{' '}
            <strong>{refus?.demandeur_libelle}</strong>. Un refus n'exécute rien : l'action est
            simplement abandonnée.
          </Encart>

          <Champ
            label="Motif du refus"
            htmlFor="motif-refus"
            requis
            aide="Il sera visible par le demandeur et conservé au journal."
          >
            <Zone
              id="motif-refus"
              rows={4}
              required
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </Champ>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setRefus(null)}>
              Annuler
            </Bouton>
            <Bouton type="submit" variante="danger" enCours={action} disabled={!motif.trim()}>
              Refuser
            </Bouton>
          </div>
        </form>
      </Modale>
    </div>
  );
}
