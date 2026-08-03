// ─────────────────────────────────────────────────────────────
// Pièces justificatives — dépôt et suivi.
//
// Composant partagé entre l'étudiant (relevé de notes, rapport de stage)
// et la promotion (procès-verbal de délibération). La portée change la
// liste des types proposés, rien d'autre : c'est le même geste.
//
// L'état de chaque pièce est affiché sans euphémisme. « Déposée » n'est
// pas « validée » : tant que le ministère n'a pas ouvert le document,
// rien n'est acquis, et l'établissement doit le voir.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  catalogueTypes,
  listerPourCandidat,
  listerPourPromotion,
  deposerPourCandidat,
  deposerPourPromotion,
  supprimerPiece,
  ouvrirPiece,
} from '../services/piece.service.js';
import { messageErreur } from '../utils/libelles.js';
import { Bouton, Champ, Liste, Saisie, Etiquette, Encart, EtatVide, Icone, Chargement } from './ui/index.jsx';

const TONS_STATUT = {
  deposee: 'neutre',
  vue: 'info',
  validee: 'succes',
  rejetee: 'erreur',
};

const LIBELLES_STATUT = {
  deposee: 'En attente d’examen',
  vue: 'Consultée par le ministère',
  validee: 'Validée',
  rejetee: 'Rejetée',
};

const poids = (octets) => {
  if (!octets) return '—';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
};

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function PiecesJointes({ portee, cibleId, lectureSeule = false, aide }) {
  const [pieces, setPieces] = useState([]);
  const [types, setTypes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [depot, setDepot] = useState({ type_piece: '', libelle: '', fichier: null });
  const [enCours, setEnCours] = useState(false);

  const lister = portee === 'candidat' ? listerPourCandidat : listerPourPromotion;
  const deposer = portee === 'candidat' ? deposerPourCandidat : deposerPourPromotion;

  async function charger() {
    if (!cibleId) return;
    setChargement(true);
    setErreur('');
    try {
      setPieces(await lister(cibleId));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cibleId, portee]);

  useEffect(() => {
    catalogueTypes()
      .then((c) => setTypes(c.types))
      .catch(() => setTypes([]));
  }, []);

  // « autre » s'attache aux deux portées ; les autres types ont la leur.
  const typesProposes = types.filter((t) => t.portee === portee || t.code === 'autre');

  async function envoyer(evenement) {
    evenement.preventDefault();
    if (!depot.fichier || !depot.type_piece) return;

    setEnCours(true);
    setErreur('');
    try {
      await deposer(cibleId, depot);
      setDepot({ type_piece: '', libelle: '', fichier: null });
      evenement.target.reset();
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  async function ouvrir(piece) {
    setErreur('');
    try {
      await ouvrirPiece(piece.id);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function retirer(piece) {
    setErreur('');
    try {
      await supprimerPiece(piece.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  return (
    <div>
      {aide && (
        <div className="mb-4">
          <Encart ton="info">{aide}</Encart>
        </div>
      )}

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {chargement ? (
        <Chargement />
      ) : pieces.length === 0 ? (
        <EtatVide icone="attach_file" titre="Aucune pièce déposée">
          {portee === 'candidat'
            ? 'Le relevé de notes est obligatoire : sans lui, le dossier sera rejeté à l’instruction.'
            : 'Le procès-verbal de délibération est obligatoire : sans lui, le lot ne peut pas être validé.'}
        </EtatVide>
      ) : (
        <ul className="border border-gris-300 bg-white">
          {pieces.map((p) => (
            <li key={p.id} className="flex flex-wrap gap-3 border-b border-gris-200 px-4 py-3 last:border-0">
              <Icone
                nom={p.type_mime === 'application/pdf' ? 'picture_as_pdf' : 'image'}
                taille={22}
                className="mt-0.5 shrink-0 text-gris-500"
              />

              <div className="min-w-0 flex-1">
                <p className="font-medium text-gris-900">
                  {p.type_libelle}
                  {p.libelle && <span className="font-normal text-gris-700"> — {p.libelle}</span>}
                </p>
                <p className="text-sm text-gris-500">
                  {p.nom_fichier} · {poids(p.taille_octets)} · déposée le {horodatage(p.date_depot)}
                </p>
                {p.statut === 'rejetee' && p.motif_rejet && (
                  <p className="mt-1 text-sm font-medium text-erreur">
                    Motif du rejet : {p.motif_rejet}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <Etiquette ton={TONS_STATUT[p.statut]}>{LIBELLES_STATUT[p.statut]}</Etiquette>
                <Bouton variante="discret" onClick={() => ouvrir(p)}>
                  Ouvrir
                </Bouton>
                {!lectureSeule && p.statut === 'deposee' && (
                  <Bouton
                    variante="discret"
                    className="text-erreur hover:text-erreur"
                    onClick={() => retirer(p)}
                  >
                    Retirer
                  </Bouton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!lectureSeule && (
        <form onSubmit={envoyer} className="mt-5 border-t border-gris-200 pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ label="Nature du document" htmlFor="piece-type" requis>
              <Liste
                id="piece-type"
                required
                value={depot.type_piece}
                onChange={(e) => setDepot({ ...depot, type_piece: e.target.value })}
                options={typesProposes.map((t) => ({
                  value: t.code,
                  label: t.requise ? `${t.libelle} (obligatoire)` : t.libelle,
                }))}
              />
            </Champ>

            <Champ label="Précision" htmlFor="piece-libelle" aide="Facultatif : semestre, session…">
              <Saisie
                id="piece-libelle"
                value={depot.libelle}
                onChange={(e) => setDepot({ ...depot, libelle: e.target.value })}
              />
            </Champ>

            <Champ label="Fichier" htmlFor="piece-fichier" requis aide="PDF, JPEG ou PNG — 10 Mo au plus.">
              <input
                id="piece-fichier"
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setDepot({ ...depot, fichier: e.target.files?.[0] || null })}
                className="w-full text-sm text-gris-700 file:mr-3 file:border file:border-gris-500 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-gris-900 hover:file:bg-gris-100"
              />
            </Champ>
          </div>

          <div className="mt-3 flex justify-end">
            <Bouton
              type="submit"
              icone="upload_file"
              enCours={enCours}
              disabled={!depot.fichier || !depot.type_piece}
            >
              Déposer la pièce
            </Bouton>
          </div>
        </form>
      )}
    </div>
  );
}
