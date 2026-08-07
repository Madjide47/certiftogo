// ─────────────────────────────────────────────────────────────
// Instruction des pièces d'un lot, côté ministère.
//
// C'est ici que « valider un lot » cesse d'être un acte de confiance :
// l'agent OUVRE chaque acte, puis le valide ou le rejette. Le serveur
// refuse de valider un lot dont des pièces n'ont pas été examinées —
// cet écran n'est donc pas une courtoisie, c'est le passage obligé.
//
// Ouvrir une pièce la marque « consultée », jamais « validée » : voir un
// document et l'accepter sont deux gestes distincts, et la trace doit
// pouvoir les distinguer après coup.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  piecesDuLot,
  piecesDuDossier,
  ouvrirPiece,
  deciderPiece,
} from '../services/piece.service.js';
import { messageErreur } from '../utils/libelles.js';
import { Bouton, Etiquette, Encart, Chiffre, Chargement, Icone, Champ, Zone, Modale } from './ui/index.jsx';

const TONS = { deposee: 'alerte', vue: 'info', validee: 'succes', rejetee: 'erreur' };
const LIBELLES = {
  deposee: 'À examiner',
  vue: 'Consultée',
  validee: 'Validée',
  rejetee: 'Rejetée',
};

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// Le lot est la voie normale ; le dossier isolé la voie d'exception. Les
// deux se lisent pareil — c'est le même dossier d'instruction, cadré plus
// ou moins large.
export default function PiecesInstruction({ lotId, dossierId, onChangement }) {
  const cible = lotId || dossierId;
  const [dossier, setDossier] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [rejet, setRejet] = useState(null);
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    if (!cible) return;
    setChargement(true);
    setErreur('');
    try {
      setDossier(lotId ? await piecesDuLot(lotId) : await piecesDuDossier(dossierId));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible]);

  async function ouvrir(piece) {
    setErreur('');
    try {
      await ouvrirPiece(piece.id);
      // La consultation change le statut côté serveur : on le reflète.
      await charger();
      onChangement?.();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function decider(piece, statut, motifRejet) {
    setEnCours(true);
    setErreur('');
    try {
      await deciderPiece(piece.id, { statut, motif: motifRejet });
      setRejet(null);
      setMotif('');
      await charger();
      onChangement?.();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  if (chargement) return <Chargement libelle="Chargement des pièces…" />;

  const compteurs = dossier?.compteurs || {};
  const collectives = dossier?.collectives || [];
  const individuelles = dossier?.individuelles || [];

  // Regroupées par étudiant : l'agent instruit un dossier, pas une liste
  // de fichiers détachés de leur titulaire.
  const parEtudiant = new Map();
  for (const piece of individuelles) {
    const cle = piece.candidat_id;
    if (!parEtudiant.has(cle)) {
      parEtudiant.set(cle, {
        nom: `${piece.candidat_nom || ''} ${piece.candidat_prenom || ''}`.trim() || 'Étudiant',
        numero: piece.numero_etudiant,
        pieces: [],
      });
    }
    parEtudiant.get(cle).pieces.push(piece);
  }

  return (
    <div>
      {erreur && (
        <div className="mb-3">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Chiffre
          libelle="À examiner"
          valeur={compteurs.deposee || 0}
          ton={compteurs.deposee > 0 ? 'alerte' : 'neutre'}
          precision={compteurs.deposee > 0 ? 'bloque la validation' : undefined}
        />
        <Chiffre libelle="Consultées" valeur={compteurs.vue || 0} />
        <Chiffre libelle="Validées" valeur={compteurs.validee || 0} ton="vert" />
        <Chiffre
          libelle="Rejetées"
          valeur={compteurs.rejetee || 0}
          ton={compteurs.rejetee > 0 ? 'erreur' : 'neutre'}
        />
      </div>

      {collectives.length === 0 && (
        <div className="mb-4">
          <Encart ton="erreur" titre="Aucun acte de délibération">
            Le procès-verbal n'a pas été transmis. Sans lui, rien n'atteste que ces résultats
            proviennent d'un jury : le lot ne peut pas être validé.
          </Encart>
        </div>
      )}

      <Section titre="Actes de la promotion" pieces={collectives} onOuvrir={ouvrir} onRejeter={setRejet} onValider={(p) => decider(p, 'validee')} />

      {[...parEtudiant.values()].map((groupe) => (
        <Section
          key={`${groupe.numero}-${groupe.nom}`}
          titre={`${groupe.nom}${groupe.numero ? ` — ${groupe.numero}` : ''}`}
          pieces={groupe.pieces}
          onOuvrir={ouvrir}
          onRejeter={setRejet}
          onValider={(p) => decider(p, 'validee')}
        />
      ))}

      {collectives.length === 0 && individuelles.length === 0 && (
        <Encart ton="alerte" titre={`Aucune pièce jointe à ce ${lotId ? 'lot' : 'dossier'}`}>
          L'établissement n'a transmis aucun justificatif.{' '}
          {lotId ? 'Les dossiers seront bloqués' : 'Le dossier sera bloqué'} à l'instruction
          pour pièce obligatoire manquante.
        </Encart>
      )}

      <Modale
        ouvert={Boolean(rejet)}
        titre={`Rejeter « ${rejet?.type_libelle || ''} »`}
        onFermer={() => setRejet(null)}
        largeur="max-w-lg"
      >
        <Champ
          label="Motif du rejet"
          htmlFor="motif-piece"
          requis
          aide="Document illisible, incomplet, non signé… L'établissement doit savoir quoi redéposer."
        >
          <Zone id="motif-piece" value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
        <div className="mt-4 flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={() => setRejet(null)}>
            Annuler
          </Bouton>
          <Bouton
            variante="danger"
            icone="block"
            enCours={enCours}
            disabled={!motif.trim()}
            onClick={() => decider(rejet, 'rejetee', motif.trim())}
          >
            Confirmer le rejet
          </Bouton>
        </div>
      </Modale>
    </div>
  );
}

function Section({ titre, pieces, onOuvrir, onValider, onRejeter }) {
  if (pieces.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="mb-1 text-sm font-bold text-gris-700">{titre}</p>
      <ul className="border border-gris-300 bg-white">
        {pieces.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-gris-200 px-4 py-2.5 last:border-0">
            <Icone
              nom={p.type_mime === 'application/pdf' ? 'picture_as_pdf' : 'image'}
              taille={20}
              className="shrink-0 text-gris-500"
            />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-gris-900">
                {p.type_libelle}
                {p.libelle && <span className="font-normal text-gris-700"> — {p.libelle}</span>}
              </p>
              <p className="text-sm text-gris-500">
                {p.nom_fichier} · déposée le {horodatage(p.date_depot)}
                {p.date_consultation && ` · consultée le ${horodatage(p.date_consultation)}`}
              </p>
              {p.statut === 'rejetee' && p.motif_rejet && (
                <p className="text-sm font-medium text-erreur">Motif : {p.motif_rejet}</p>
              )}
            </div>

            <Etiquette ton={TONS[p.statut]}>{LIBELLES[p.statut]}</Etiquette>

            <span className="whitespace-nowrap">
              <Bouton variante="discret" onClick={() => onOuvrir(p)}>
                Ouvrir
              </Bouton>
              {p.statut !== 'validee' && (
                <Bouton variante="discret" className="ml-3" onClick={() => onValider(p)}>
                  Valider
                </Bouton>
              )}
              {p.statut !== 'rejetee' && (
                <Bouton
                  variante="discret"
                  className="ml-3 text-erreur hover:text-erreur"
                  onClick={() => onRejeter(p)}
                >
                  Rejeter
                </Bouton>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
