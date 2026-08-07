// ─────────────────────────────────────────────────────────────
// Dossier d'agrément d'un établissement demandeur.
//
// L'écran d'instruction montrait ce que le demandeur DÉCLARE. Il montre
// désormais ce qu'il PROUVE : le formulaire porte les données, les
// pièces les fondent. Agréer sur la seule déclaration reviendrait à
// créer un établissement certificateur sur parole.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { piecesDemande, ouvrirPieceDemande } from '../services/gouvernance.service.js';
import { messageErreur } from '../utils/libelles.js';
import { Bouton, Encart, Icone, Chargement } from './ui/index.jsx';

const poids = (o) =>
  !o
    ? '—'
    : o < 1024
      ? `${o} o`
      : o < 1024 * 1024
        ? `${Math.round(o / 1024)} ko`
        : `${(o / (1024 * 1024)).toFixed(1)} Mo`;

const LIBELLES = {
  lettre_demande: 'Lettre de demande signée',
  acte_creation: "Acte de création ou autorisation d'exercer",
  agrement: 'Agrément ou accréditation',
  registre_commerce: 'Registre de commerce',
  attestation_fiscale: "Attestation d'identification fiscale",
  presentation: "Présentation de l'établissement",
  liste_formations: 'Liste des formations',
  piece_identite_representant: "Pièce d'identité du représentant légal",
  logo: 'Logo',
  autre: 'Autre document',
};

const Ligne = ({ libelle, valeur }) =>
  valeur ? (
    <div>
      <dt className="text-sm text-gris-500">{libelle}</dt>
      <dd className="text-base font-medium text-gris-900">{valeur}</dd>
    </div>
  ) : null;

export default function DossierIntegration({ demande }) {
  const [pieces, setPieces] = useState([]);
  const [manquants, setManquants] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    if (!demande?.id) return;
    setChargement(true);
    setErreur('');
    piecesDemande(demande.id)
      .then((data) => {
        setPieces(data.pieces);
        setManquants(data.manquants);
      })
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, [demande?.id]);

  async function ouvrir(piece) {
    setErreur('');
    try {
      await ouvrirPieceDemande(piece.id);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  if (!demande) return null;

  return (
    <div>
      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      <h3 className="mb-2 text-base font-bold">Établissement déclaré</h3>
      <dl className="mb-5 grid gap-3 sm:grid-cols-3">
        <Ligne libelle="Nom" valeur={demande.nom} />
        <Ligne libelle="Type" valeur={demande.type} />
        <Ligne
          libelle="Statut"
          valeur={
            demande.statut_juridique === 'prive'
              ? 'Privé'
              : demande.statut_juridique === 'public'
                ? 'Public'
                : null
          }
        />
        <Ligne libelle="Ville" valeur={demande.ville} />
        <Ligne libelle="Adresse" valeur={demande.adresse} />
        <Ligne libelle="Téléphone" valeur={demande.telephone} />
        <Ligne libelle="E-mail" valeur={demande.email} />
        <Ligne libelle="Site web" valeur={demande.site_web} />
        <Ligne libelle="Diplômes demandés" valeur={demande.types_diplomes_demandes} />
      </dl>

      <h3 className="mb-2 text-base font-bold">Responsables</h3>
      <dl className="mb-5 grid gap-3 sm:grid-cols-3">
        <Ligne
          libelle="Représentant légal"
          valeur={
            [demande.representant_nom, demande.representant_prenom].filter(Boolean).join(' ') ||
            null
          }
        />
        <Ligne libelle="Fonction" valeur={demande.representant_fonction} />
        <Ligne libelle="Téléphone" valeur={demande.representant_telephone} />
        <Ligne
          libelle="Responsable des certifications"
          valeur={`${demande.responsable_nom} ${demande.responsable_prenom}`}
        />
        <Ligne libelle="Téléphone" valeur={demande.responsable_telephone} />
        <Ligne libelle="Contact informatique" valeur={demande.contact_technique_nom} />
      </dl>

      {demande.message && (
        <div className="mb-5">
          <Encart ton="info" titre="Message du demandeur">
            {demande.message}
          </Encart>
        </div>
      )}

      <h3 className="mb-2 text-base font-bold">Pièces justificatives</h3>

      {/* Un dossier transmis est complet par construction — le serveur
          refuse la transmission autrement. Si une pièce manque ici, c'est
          une demande reprise d'avant cette règle : le dire vaut mieux que
          laisser croire à un oubli d'affichage. */}
      {manquants.length > 0 && (
        <div className="mb-3">
          <Encart ton="alerte" titre="Pièces obligatoires absentes">
            {manquants.map((m) => m.libelle).join(', ')}.
          </Encart>
        </div>
      )}

      {chargement ? (
        <Chargement libelle="Chargement des pièces…" />
      ) : pieces.length === 0 ? (
        <Encart ton="alerte">Aucune pièce n'a été jointe à cette demande.</Encart>
      ) : (
        <ul className="border border-gris-300 bg-white">
          {pieces.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 border-b border-gris-200 px-4 py-2.5 last:border-0"
            >
              <Icone
                nom={p.type_mime === 'application/pdf' ? 'picture_as_pdf' : 'description'}
                taille={20}
                className="shrink-0 text-gris-500"
              />
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-gris-900">
                  {LIBELLES[p.type_piece] || p.type_piece}
                  {p.libelle && <span className="font-normal text-gris-700"> — {p.libelle}</span>}
                </p>
                <p className="text-sm text-gris-500">
                  {p.nom_fichier} · {poids(p.taille_octets)}
                </p>
              </div>
              <Bouton variante="discret" onClick={() => ouvrir(p)}>
                Ouvrir
              </Bouton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
