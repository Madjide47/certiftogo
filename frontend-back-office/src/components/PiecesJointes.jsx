// ─────────────────────────────────────────────────────────────
// Pièces justificatives — grille de dépôt.
//
// L'écran affichait la LISTE des documents déposés. Une liste ne montre
// que ce qui est là : l'agent qui avait fourni trois pièces sur quatre
// voyait trois lignes et rien qui l'avertisse. Le manque n'apparaissait
// qu'au moment de transmettre, sous la forme d'un refus.
//
// La grille inverse la lecture. Une CASE par document attendu, remplie
// ou vide, obligatoire ou facultative, chacune avec son propre bouton
// de dépôt. Ce qu'il reste à faire se voit sans connaître la
// nomenclature, et se fait sans changer d'écran.
//
// Le fourre-tout « Autre document » n'a pas de case : il n'est jamais
// attendu, il s'ajoute. Le mettre sur le même plan que le relevé de
// notes brouillerait précisément ce que la grille sert à distinguer.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  grilleCandidat,
  grillePromotion,
  deposerPourCandidat,
  deposerPourPromotion,
  supprimerPiece,
  ouvrirPiece,
} from '../services/piece.service.js';
import { messageErreur } from '../utils/libelles.js';
import { Bouton, Champ, Saisie, Etiquette, Encart, Icone, Chargement } from './ui/index.jsx';

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

const ACCEPTES = '.pdf,.jpg,.jpeg,.png';

/**
 * Une case de la grille : un document attendu, et l'état où il en est.
 *
 * Le champ de fichier vit DANS la case. Un formulaire unique en bas de
 * page obligeait à choisir la nature dans une liste déroulante — donc à
 * savoir laquelle manquait avant de commencer.
 */
function Case({ donnees, lectureSeule, enCours, onDeposer, onOuvrir, onRetirer }) {
  const champ = useRef(null);
  const { piece, rejetee } = donnees;
  const manque = donnees.requise && !donnees.remplie;

  return (
    <li
      className={`flex flex-wrap items-start gap-3 border-b border-gris-200 px-4 py-3 last:border-0 ${
        manque ? 'bg-erreur-clair/40' : ''
      }`}
    >
      <Icone
        nom={donnees.remplie ? 'task_alt' : manque ? 'error_outline' : 'add_circle_outline'}
        taille={22}
        className={`mt-0.5 shrink-0 ${
          donnees.remplie ? 'text-succes' : manque ? 'text-erreur' : 'text-gris-500'
        }`}
      />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium text-gris-900">
          {donnees.libelle}
          {donnees.requise ? (
            <Etiquette ton={donnees.remplie ? 'succes' : 'erreur'}>Obligatoire</Etiquette>
          ) : (
            <Etiquette ton="neutre">Facultatif</Etiquette>
          )}
        </p>

        {piece ? (
          <p className="text-sm text-gris-500">
            {piece.nom_fichier} · {poids(piece.taille_octets)} · déposée le{' '}
            {horodatage(piece.date_depot)}
          </p>
        ) : (
          <p className="text-sm text-gris-500">{donnees.aide}</p>
        )}

        {/* Une pièce rejetée laisse la case VIDE : le motif dit quoi
            redéposer, la case dit qu'il reste à le faire. */}
        {rejetee && !donnees.remplie && (
          <p className="mt-1 text-sm font-medium text-erreur">
            Document précédent rejeté — {rejetee.motif_rejet} Déposez une nouvelle version.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {piece && (
          <>
            <Etiquette ton={TONS_STATUT[piece.statut]}>{LIBELLES_STATUT[piece.statut]}</Etiquette>
            <Bouton variante="discret" onClick={() => onOuvrir(piece)}>
              Ouvrir
            </Bouton>
          </>
        )}

        {!lectureSeule && (
          <>
            <input
              ref={champ}
              type="file"
              className="hidden"
              accept={ACCEPTES}
              aria-label={`Déposer : ${donnees.libelle}`}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                e.target.value = '';
                if (fichier) onDeposer(donnees.type_piece, fichier);
              }}
            />
            <Bouton
              variante={donnees.remplie ? 'discret' : 'neutre'}
              icone="upload_file"
              enCours={enCours}
              onClick={() => champ.current?.click()}
            >
              {donnees.remplie ? 'Remplacer' : 'Déposer'}
            </Bouton>
          </>
        )}

        {!lectureSeule && piece?.statut === 'deposee' && (
          <Bouton
            variante="discret"
            className="text-erreur hover:text-erreur"
            onClick={() => onRetirer(piece)}
          >
            Retirer
          </Bouton>
        )}
      </div>
    </li>
  );
}

/**
 * @param {object}  props
 * @param {object}  [props.grilleFournie] grille déjà chargée par l'appelant.
 *   Le ministère n'a pas accès à `/candidats/:id/pieces/grille` — cette
 *   route est réservée à l'établissement propriétaire. Sa fiche porte
 *   donc la grille dans sa propre réponse, et la passe ici plutôt que
 *   d'ouvrir aux instructeurs une route d'administration des étudiants.
 */
export default function PiecesJointes({
  portee,
  cibleId,
  lectureSeule = false,
  aide,
  onChangement,
  grilleFournie = null,
}) {
  const [grille, setGrille] = useState(grilleFournie);
  const [chargement, setChargement] = useState(!grilleFournie);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState('');
  const [autre, setAutre] = useState({ libelle: '', fichier: null });

  const charger = portee === 'candidat' ? grilleCandidat : grillePromotion;
  const deposer = portee === 'candidat' ? deposerPourCandidat : deposerPourPromotion;

  async function rafraichir() {
    if (!cibleId || grilleFournie) return;
    setChargement(true);
    setErreur('');
    try {
      setGrille(await charger(cibleId));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    if (grilleFournie) {
      setGrille(grilleFournie);
      setChargement(false);
      return;
    }
    rafraichir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cibleId, portee, grilleFournie]);

  async function envoyer(type_piece, fichier, libelle = '') {
    setEnCours(type_piece);
    setErreur('');
    try {
      await deposer(cibleId, { type_piece, libelle, fichier });
      await rafraichir();
      onChangement?.();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours('');
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
      await rafraichir();
      onChangement?.();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function envoyerAutre(evenement) {
    evenement.preventDefault();
    if (!autre.fichier || !autre.libelle.trim()) return;
    await envoyer('autre', autre.fichier, autre.libelle.trim());
    setAutre({ libelle: '', fichier: null });
    evenement.target.reset();
  }

  if (chargement) return <Chargement />;

  const cases = grille?.cases || [];
  const complementaires = grille?.complementaires || [];
  const manquantes = grille?.manquantes || [];
  const obligatoires = cases.filter((c) => c.requise);
  const remplies = obligatoires.filter((c) => c.remplie).length;

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

      {/* Le verdict AVANT la grille : l'agent doit savoir en une ligne
          s'il peut passer à la suite. */}
      <div className="mb-4">
        {manquantes.length === 0 ? (
          <Encart ton="succes" titre="Pièces obligatoires au complet">
            {obligatoires.length > 0
              ? `${remplies} document(s) obligatoire(s) fourni(s). Les pièces facultatives restent possibles.`
              : 'Aucun document obligatoire pour cette portée.'}
          </Encart>
        ) : (
          <Encart
            ton="erreur"
            titre={`${manquantes.length} document(s) obligatoire(s) manquant(s) sur ${obligatoires.length}`}
          >
            {manquantes.map((m) => m.libelle).join(', ')}.{' '}
            {portee === 'candidat'
              ? "Tant qu'ils manquent, cet étudiant bloque la transmission de sa promotion."
              : 'La promotion ne peut pas être transmise sans ces actes.'}
          </Encart>
        )}
      </div>

      <ul className="border border-gris-300 bg-white">
        {cases.map((c) => (
          <Case
            key={c.type_piece}
            donnees={c}
            lectureSeule={lectureSeule}
            enCours={enCours === c.type_piece}
            onDeposer={envoyer}
            onOuvrir={ouvrir}
            onRetirer={retirer}
          />
        ))}
      </ul>

      {/* ── Documents hors nomenclature ── */}
      {(complementaires.length > 0 || !lectureSeule) && (
        <div className="mt-5 border-t border-gris-200 pt-5">
          <h4 className="mb-2 font-medium text-gris-900">Documents complémentaires</h4>

          {complementaires.length > 0 && (
            <ul className="mb-4 border border-gris-300 bg-white">
              {complementaires.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 border-b border-gris-200 px-4 py-3 last:border-0"
                >
                  <Icone
                    nom={p.type_mime === 'application/pdf' ? 'picture_as_pdf' : 'image'}
                    taille={20}
                    className="shrink-0 text-gris-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gris-900">{p.libelle || p.nom_fichier}</p>
                    <p className="text-sm text-gris-500">
                      {p.nom_fichier} · {poids(p.taille_octets)} · {horodatage(p.date_depot)}
                    </p>
                    {p.statut === 'rejetee' && p.motif_rejet && (
                      <p className="mt-1 text-sm font-medium text-erreur">
                        Motif du rejet : {p.motif_rejet}
                      </p>
                    )}
                  </div>
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
                </li>
              ))}
            </ul>
          )}

          {!lectureSeule && (
            <form onSubmit={envoyerAutre} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              {/* Un document hors nomenclature qu'on ne nomme pas est
                  illisible pour celui qui l'instruira : le libellé est
                  ce qui remplace ici le nom de la case. */}
              <Champ label="Nature du document" htmlFor="autre-libelle" requis>
                <Saisie
                  id="autre-libelle"
                  required
                  placeholder="Ex. : attestation de non-redoublement"
                  value={autre.libelle}
                  onChange={(e) => setAutre({ ...autre, libelle: e.target.value })}
                />
              </Champ>
              <Champ label="Fichier" htmlFor="autre-fichier" requis aide="PDF, JPEG ou PNG — 10 Mo au plus.">
                <input
                  id="autre-fichier"
                  type="file"
                  required
                  accept={ACCEPTES}
                  onChange={(e) => setAutre({ ...autre, fichier: e.target.files?.[0] || null })}
                  className="w-full text-sm text-gris-700 file:mr-3 file:border file:border-gris-500 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-gris-900 hover:file:bg-gris-100"
                />
              </Champ>
              <div className="flex items-end">
                <Bouton
                  type="submit"
                  icone="upload_file"
                  enCours={enCours === 'autre'}
                  disabled={!autre.fichier || !autre.libelle.trim()}
                >
                  Ajouter
                </Bouton>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
