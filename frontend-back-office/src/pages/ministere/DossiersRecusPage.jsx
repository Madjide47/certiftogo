// ─────────────────────────────────────────────────────────────
// Dossiers reçus — instruction à l'unité.
//
// La voie normale est le LOT : un établissement transmet une promotion,
// le ministère l'instruit d'un bloc depuis « Lots reçus ». Cet écran sert
// aux cas qui échappent au lot — un dossier isolé, un dossier renvoyé
// puis retransmis seul, une régularisation.
//
// Il reste aussi le seul endroit où l'on voit un dossier indépendamment
// de son lot : utile quand un diplômé conteste et qu'on part de sa seule
// référence.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listerDossiersRecus,
  examinerDossier,
  validerDossier,
  rejeterDossier,
  certifierDossier,
} from '../../services/ministere.service.js';
import {
  LIBELLES_STATUT_DOSSIER,
  LIBELLES_MENTION,
  LIBELLES_TYPE_DIPLOME,
  messageErreur,
} from '../../utils/libelles.js';
import PiecesInstruction from '../../components/PiecesInstruction.jsx';
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
} from '../../components/ui/index.jsx';

const TONS = {
  brouillon: 'neutre',
  soumis: 'info',
  en_examen: 'alerte',
  valide: 'succes',
  rejete: 'erreur',
  en_attente_ancrage: 'alerte',
  certifie: 'vert',
};

const ONGLETS = [
  { cle: 'soumis', libelle: 'À prendre en charge' },
  { cle: 'en_examen', libelle: 'En examen' },
  { cle: 'valide', libelle: 'À certifier' },
  { cle: 'rejete', libelle: 'Rejetés' },
  { cle: '', libelle: 'Tous' },
];

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function DossiersRecusPage() {
  const [dossiers, setDossiers] = useState([]);
  const [onglet, setOnglet] = useState('soumis');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(null);

  const [rejetCible, setRejetCible] = useState(null);
  const [motif, setMotif] = useState('');
  const [detail, setDetail] = useState(null);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setDossiers(await listerDossiersRecus({ statut: onglet }));
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

  async function agir(dossier, action, message, statutApres) {
    setEnCours(dossier.id);
    setErreur('');
    setSucces('');
    try {
      await action(dossier.id);
      setSucces(message);
      // Le détail reste ouvert : après la prise en charge, l'agent enchaîne
      // sur les pièces sans avoir à retrouver son dossier dans la liste.
      if (statutApres) {
        setDetail((d) => (d && d.id === dossier.id ? { ...d, statut: statutApres } : d));
      }
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(null);
    }
  }

  async function confirmerRejet(e) {
    e.preventDefault();
    setEnCours(rejetCible.id);
    setErreur('');
    try {
      await rejeterDossier(rejetCible.id, motif.trim());
      setSucces(
        `Dossier ${rejetCible.reference} renvoyé à l'établissement, qui pourra le corriger et le retransmettre.`
      );
      setDetail((d) => (d && d.id === rejetCible.id ? { ...d, statut: 'rejete' } : d));
      setRejetCible(null);
      setMotif('');
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(null);
    }
  }

  // Les mêmes transitions servent dans le tableau et dans le détail : les
  // dupliquer ferait diverger les deux écrans à la première évolution.
  function actions(d) {
    const occupe = enCours === d.id;
    if (d.statut === 'soumis') {
      return (
        <Bouton
          variante="discret"
          disabled={occupe}
          onClick={() =>
            agir(d, examinerDossier, `Dossier ${d.reference} pris en examen.`, 'en_examen')
          }
        >
          Prendre en examen
        </Bouton>
      );
    }
    if (d.statut === 'en_examen') {
      return (
        <span className="whitespace-nowrap">
          <Bouton
            variante="discret"
            disabled={occupe}
            onClick={() =>
              agir(d, validerDossier, `Dossier ${d.reference} validé, prêt à certifier.`, 'valide')
            }
          >
            Valider
          </Bouton>
          <Bouton
            variante="discret"
            className="ml-3 text-erreur hover:text-erreur"
            onClick={() => {
              setRejetCible(d);
              setMotif('');
            }}
          >
            Rejeter
          </Bouton>
        </span>
      );
    }
    if (d.statut === 'valide') {
      return (
        <Bouton
          variante="discret"
          disabled={occupe}
          onClick={() =>
            agir(
              d,
              certifierDossier,
              `Diplôme émis pour ${d.candidat_nom} ${d.candidat_prenom}.`,
              'certifie'
            )
          }
        >
          Certifier
        </Bouton>
      );
    }
    return <span className="text-gris-500">—</span>;
  }

  return (
    <div>
      <EnTetePage
        titre="Dossiers reçus"
        description="Instruction dossier par dossier, pour les cas qui n'entrent pas dans un lot."
        fil={[{ libelle: 'Instruction' }, { libelle: 'Dossiers' }]}
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

      <div className="mb-5">
        <Encart ton="info">
          Pour une promotion entière, passez par{' '}
          <Link to="/lots-recus" className="underline underline-offset-2">
            Lots reçus
          </Link>{' '}
          : l'instruction y bénéficie des contrôles automatiques et du rejet partiel.
        </Encart>
      </div>

      <Onglets onglets={ONGLETS} actif={onglet} onChanger={setOnglet} />

      <Tableau
        legende="Dossiers transmis au ministère"
        chargement={chargement}
        lignes={dossiers}
        colonnes={[
          {
            cle: 'reference',
            libelle: 'Référence',
            tabulaire: true,
            rendu: (d) => (
              <span>
                <span className="font-medium">{d.reference}</span>
                {d.lot_reference && (
                  <span className="block text-xs text-gris-500">lot {d.lot_reference}</span>
                )}
              </span>
            ),
          },
          {
            cle: 'candidat',
            libelle: 'Étudiant',
            rendu: (d) => (
              <span>
                <span className="font-medium">{d.candidat_nom}</span> {d.candidat_prenom}
                <span className="block text-xs text-gris-500">
                  {d.candidat_numero_etudiant}
                </span>
              </span>
            ),
          },
          { cle: 'etablissement_nom', libelle: 'Établissement' },
          {
            cle: 'diplome',
            libelle: 'Diplôme',
            rendu: (d) => (
              <span>
                {LIBELLES_TYPE_DIPLOME[d.type_diplome] || '—'}
                {d.mention && (
                  <span className="block text-xs text-gris-500">
                    mention {LIBELLES_MENTION[d.mention]}
                  </span>
                )}
              </span>
            ),
          },
          {
            cle: 'date_transmission',
            libelle: 'Reçu le',
            rendu: (d) => date(d.date_transmission),
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (d) => (
              <span>
                <Etiquette ton={TONS[d.statut] || 'neutre'}>
                  {LIBELLES_STATUT_DOSSIER[d.statut] || d.statut}
                </Etiquette>
                {d.motif_rejet && (
                  <span className="block max-w-xs text-xs text-erreur">{d.motif_rejet}</span>
                )}
              </span>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (d) => (
              <span className="whitespace-nowrap">
                {/* Toujours proposé : consulter un dossier n'est pas en
                    décider, et l'agent doit pouvoir regarder avant d'agir. */}
                <Bouton variante="discret" onClick={() => setDetail(d)}>
                  Détail
                </Bouton>
                <span className="ml-3">{actions(d)}</span>
              </span>
            ),
          },
        ]}
        vide={
          <EtatVide icone="folder_open" titre="Aucun dossier">
            {onglet === 'soumis'
              ? 'Tout ce qui a été transmis est déjà pris en charge.'
              : 'Aucun dossier ne correspond à ce filtre.'}
          </EtatVide>
        }
      />

      {/* ── Détail d'un dossier ── */}
      <Modale
        ouvert={Boolean(detail)}
        titre={`Dossier ${detail?.reference || ''}`}
        onFermer={() => setDetail(null)}
        largeur="max-w-4xl"
      >
        {detail && (
          <>
            <dl className="mb-4 grid gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-sm text-gris-500">Étudiant</dt>
                <dd className="text-base font-medium">
                  {detail.candidat_nom} {detail.candidat_prenom}
                  <span className="block text-xs font-normal text-gris-500">
                    {detail.candidat_numero_etudiant}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gris-500">Établissement</dt>
                <dd className="text-base font-medium">{detail.etablissement_nom}</dd>
              </div>
              <div>
                <dt className="text-sm text-gris-500">Diplôme</dt>
                <dd className="text-base font-medium">
                  {LIBELLES_TYPE_DIPLOME[detail.type_diplome] || '—'}
                  {detail.mention && (
                    <span className="block text-xs font-normal text-gris-500">
                      mention {LIBELLES_MENTION[detail.mention]}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gris-500">Statut</dt>
                <dd>
                  <Etiquette ton={TONS[detail.statut] || 'neutre'}>
                    {LIBELLES_STATUT_DOSSIER[detail.statut] || detail.statut}
                  </Etiquette>
                  {detail.lot_reference && (
                    <span className="block text-xs text-gris-500">
                      lot {detail.lot_reference}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {detail.motif_rejet && (
              <div className="mb-4">
                <Encart ton="erreur" titre="Motif du rejet">
                  {detail.motif_rejet}
                </Encart>
              </div>
            )}

            <div className="mb-5 border-t border-gris-200 pt-4">
              <h3 className="mb-3 text-lg">Pièces justificatives</h3>
              {detail.statut === 'soumis' ? (
                <Encart ton="info" titre="Instruction des pièces après prise en charge">
                  Prenez le dossier en examen pour ouvrir les justificatifs : ouvrir un
                  document le marque « consulté » et vous en désigne comme instructeur.
                </Encart>
              ) : (
                <PiecesInstruction dossierId={detail.id} />
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-gris-200 pt-4">
              <Bouton variante="neutre" onClick={() => setDetail(null)}>
                Fermer
              </Bouton>
              {actions(detail)}
            </div>
          </>
        )}
      </Modale>

      <Modale
        ouvert={Boolean(rejetCible)}
        titre={`Rejeter ${rejetCible?.reference || ''}`}
        onFermer={() => setRejetCible(null)}
      >
        <form onSubmit={confirmerRejet} className="space-y-4">
          <Encart ton="info">
            Le dossier repart à l'établissement, qui pourra le corriger et le retransmettre. Ce
            n'est pas un refus définitif.
          </Encart>

          <Champ
            label="Motif du rejet"
            htmlFor="motif-dossier"
            requis
            aide="Lu tel quel par l'établissement : indiquez précisément ce qui doit être corrigé."
          >
            <Zone
              id="motif-dossier"
              rows={4}
              required
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </Champ>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setRejetCible(null)}>
              Annuler
            </Bouton>
            <Bouton type="submit" variante="danger" disabled={!motif.trim()}>
              Rejeter le dossier
            </Bouton>
          </div>
        </form>
      </Modale>
    </div>
  );
}
