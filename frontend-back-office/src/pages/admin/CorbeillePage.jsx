// ─────────────────────────────────────────────────────────────
// Corbeille — suppressions réversibles.
//
// Une fiche étudiant supprimée par erreur, c'est un diplômé qui
// disparaît. Le système ne détruit donc pas : il dépose ici, avec
// l'auteur et la date, et la restauration remet la ligne en place.
//
// Ce qui a produit un diplôme certifié ne passe jamais par ici : on ne
// supprime pas un dossier dont le hash est ancré sur la blockchain.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { listerCorbeille, restaurer } from '../../services/journal.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Tableau,
  Encart,
  EtatVide,
  Bouton,
  Champ,
  Liste,
  Etiquette,
  Icone,
} from '../../components/ui/index.jsx';

const LIBELLES_TABLE = {
  candidats: 'Fiche étudiant',
  promotions: 'Promotion',
  facultes: 'Faculté',
  filieres: 'Filière',
  dossiers: 'Dossier',
  inscriptions: 'Inscription',
};

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/**
 * Résumé lisible d'une ligne supprimée. La colonne `libelle` est écrite
 * pour ça au moment du dépôt ; le JSON n'est qu'un filet.
 */
function apercu(element) {
  if (element.libelle) return element.libelle;
  const d = element.donnees || {};
  const parties = [d.nom, d.prenom, d.libelle, d.reference, d.numero_etudiant, d.code].filter(
    Boolean
  );
  return parties.length > 0 ? parties.join(' · ') : '—';
}

export default function CorbeillePage() {
  const [elements, setElements] = useState([]);
  const [table, setTable] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setElements(await listerCorbeille({ table_source: table }));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  async function remettre(element) {
    setErreur('');
    setMessage('');
    try {
      await restaurer(element.id);
      setMessage(
        `${LIBELLES_TABLE[element.table_source] || element.table_source} restauré : la ligne est de nouveau visible dans son écran d’origine.`
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  return (
    <div>
      <EnTetePage
        titre="Corbeille"
        description="Éléments supprimés, conservés le temps de revenir en arrière."
        fil={[{ libelle: 'Supervision' }, { libelle: 'Corbeille' }]}
      >
        <Bouton variante="secondaire" icone="refresh" onClick={charger}>
          Actualiser
        </Bouton>
      </EnTetePage>

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

      <div className="mb-4 max-w-sm">
        <Champ label="Nature de l’élément" htmlFor="f-table">
          <Liste
            id="f-table"
            vide="Tout"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            options={Object.entries(LIBELLES_TABLE).map(([value, label]) => ({ value, label }))}
          />
        </Champ>
      </div>

      <Tableau
        legende="Éléments supprimés"
        chargement={chargement}
        lignes={elements}
        colonnes={[
          {
            cle: 'table_source',
            libelle: 'Nature',
            rendu: (e) => (
              <Etiquette ton="neutre">
                {LIBELLES_TABLE[e.table_source] || e.table_source}
              </Etiquette>
            ),
          },
          { cle: 'apercu', libelle: 'Élément', rendu: apercu },
          {
            cle: 'date_suppression',
            libelle: 'Supprimé le',
            tabulaire: true,
            rendu: (e) => horodatage(e.date_suppression),
          },
          {
            cle: 'auteur',
            libelle: 'Par',
            rendu: (e) => e.auteur_libelle || '—',
          },
          {
            cle: 'actions',
            libelle: '',
            alignement: 'droite',
            rendu: (e) =>
              e.restaure ? (
                <Etiquette ton="succes">Restauré</Etiquette>
              ) : (
                <Bouton variante="discret" onClick={() => remettre(e)}>
                  Restaurer
                </Bouton>
              ),
          },
        ]}
        vide={
          <EtatVide icone="restore_from_trash" titre="Corbeille vide">
            Aucune suppression en attente. C’est le cas normal.
          </EtatVide>
        }
      />

      <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
        <Icone nom="lock" taille={16} className="mt-0.5 shrink-0" />
        Restaurer ne réécrit pas l’histoire : la suppression et la restauration figurent toutes
        deux au journal, avec leur auteur.
      </p>
    </div>
  );
}
