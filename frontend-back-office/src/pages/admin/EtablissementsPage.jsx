// ─────────────────────────────────────────────────────────────
// Établissements, vus par l'exploitant.
//
// L'écran précédent proposait un bouton « Nouvel établissement » qui
// appelait une route supprimée : l'agrément est passé au ministère, où
// il s'accompagne d'un code officiel, d'habilitations et d'un premier
// agent. Créer un établissement n'est pas un acte technique — c'est
// reconnaître un organisme, et cela ne relève pas de l'exploitant.
//
// Reste ici ce qui est bien de son ressort : constater l'état du parc, et
// suspendre en urgence. Une suspension gèle les transmissions ; elle ne
// touche PAS aux diplômes déjà certifiés, qui restent vérifiables.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  listerEtablissements,
  definirStatutEtablissement,
} from '../../services/admin.service.js';
import {
  LIBELLES_TYPE_ETABLISSEMENT,
  LIBELLES_STATUT_ETABLISSEMENT,
  messageErreur,
} from '../../utils/libelles.js';
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
  Modale,
  Chiffre,
  Icone,
} from '../../components/ui/index.jsx';

const TONS_STATUT = { actif: 'succes', suspendu: 'erreur', archive: 'neutre' };

export default function AdminEtablissementsPage() {
  const [etablissements, setEtablissements] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setEtablissements(await listerEtablissements());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  const affiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return etablissements.filter((e) => {
      if (filtreStatut && e.statut !== filtreStatut) return false;
      if (!q) return true;
      return `${e.nom} ${e.code || ''} ${e.ville || ''}`.toLowerCase().includes(q);
    });
  }, [etablissements, recherche, filtreStatut]);

  const parStatut = (s) => etablissements.filter((e) => e.statut === s).length;

  async function appliquer() {
    if (!confirmation) return;
    setEnCours(true);
    setErreur('');
    try {
      await definirStatutEtablissement(confirmation.etablissement.id, confirmation.statut);
      setMessage(
        confirmation.statut === 'suspendu'
          ? `${confirmation.etablissement.nom} est suspendu : ses transmissions sont gelées. Ses diplômes déjà certifiés restent vérifiables.`
          : `${confirmation.etablissement.nom} est réactivé.`
      );
      setConfirmation(null);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <EnTetePage
        titre="Établissements"
        description="Parc des organismes agréés. L’agrément relève du ministère ; l’exploitation, de cet écran."
        fil={[{ libelle: 'Comptes' }, { libelle: 'Établissements' }]}
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

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Chiffre libelle="Établissements" valeur={etablissements.length} />
        <Chiffre libelle="Actifs" valeur={parStatut('actif')} ton="vert" />
        <Chiffre
          libelle="Suspendus"
          valeur={parStatut('suspendu')}
          ton={parStatut('suspendu') > 0 ? 'erreur' : 'neutre'}
        />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Champ label="Rechercher" htmlFor="f-recherche" aide="Nom, code officiel ou ville.">
          <Saisie
            id="f-recherche"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="IAI001, Lomé…"
          />
        </Champ>
        <Champ label="Statut" htmlFor="f-statut">
          <Liste
            id="f-statut"
            vide="Tous les statuts"
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            options={[
              { value: 'actif', label: 'Actifs' },
              { value: 'suspendu', label: 'Suspendus' },
              { value: 'archive', label: 'Archivés' },
            ]}
          />
        </Champ>
      </div>

      <Tableau
        legende="Établissements"
        chargement={chargement}
        lignes={affiches}
        colonnes={[
          {
            cle: 'nom',
            libelle: 'Établissement',
            rendu: (e) => (
              <span>
                <span className="font-medium">{e.nom}</span>
                <span className="block text-xs text-gris-500">
                  {LIBELLES_TYPE_ETABLISSEMENT[e.type] || e.type}
                  {e.ville && ` · ${e.ville}`}
                </span>
              </span>
            ),
          },
          {
            cle: 'code',
            libelle: 'Code officiel',
            tabulaire: true,
            rendu: (e) => e.code || '—',
          },
          {
            cle: 'contact',
            libelle: 'Contact',
            rendu: (e) => (
              <span className="text-gris-700">
                {e.telephone || '—'}
                {e.email && <span className="block text-xs text-gris-500">{e.email}</span>}
              </span>
            ),
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (e) => (
              <Etiquette ton={TONS_STATUT[e.statut] || 'neutre'}>
                {LIBELLES_STATUT_ETABLISSEMENT[e.statut] || e.statut}
              </Etiquette>
            ),
          },
          {
            cle: 'actions',
            libelle: '',
            alignement: 'droite',
            rendu: (e) =>
              e.statut === 'suspendu' ? (
                <Bouton
                  variante="discret"
                  onClick={() => setConfirmation({ etablissement: e, statut: 'actif' })}
                >
                  Réactiver
                </Bouton>
              ) : (
                <Bouton
                  variante="discret"
                  className="text-erreur hover:text-erreur"
                  onClick={() => setConfirmation({ etablissement: e, statut: 'suspendu' })}
                >
                  Suspendre
                </Bouton>
              ),
          },
        ]}
        vide={
          <EtatVide icone="account_balance" titre="Aucun établissement">
            Les établissements sont agréés par le ministère, à partir des demandes d’intégration.
          </EtatVide>
        }
      />

      <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
        <Icone nom="account_balance" taille={16} className="mt-0.5 shrink-0" />
        Pour agréer un nouvel établissement, lui attribuer son code officiel et ses habilitations,
        passez par l’espace ministère : c’est un acte administratif, pas une opération technique.
      </p>

      <Modale
        ouvert={Boolean(confirmation)}
        titre={
          confirmation?.statut === 'suspendu'
            ? `Suspendre ${confirmation?.etablissement?.nom}`
            : `Réactiver ${confirmation?.etablissement?.nom}`
        }
        onFermer={() => setConfirmation(null)}
        largeur="max-w-lg"
      >
        {confirmation?.statut === 'suspendu' ? (
          <Encart ton="alerte" titre="Ce que la suspension produit">
            Les transmissions de cet établissement sont gelées immédiatement : ses promotions ne
            partent plus au ministère. Ses agents conservent leur accès en lecture. Les diplômes
            déjà certifiés restent valides et vérifiables — une suspension n’efface pas le passé.
          </Encart>
        ) : (
          <Encart ton="info">
            L’établissement pourra de nouveau transmettre des promotions au ministère.
          </Encart>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={() => setConfirmation(null)}>
            Annuler
          </Bouton>
          <Bouton
            variante={confirmation?.statut === 'suspendu' ? 'danger' : 'primaire'}
            icone={confirmation?.statut === 'suspendu' ? 'block' : 'check'}
            enCours={enCours}
            onClick={appliquer}
          >
            {confirmation?.statut === 'suspendu' ? 'Suspendre' : 'Réactiver'}
          </Bouton>
        </div>
      </Modale>
    </div>
  );
}
