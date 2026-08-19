// ─────────────────────────────────────────────────────────────
// Étudiants de l'établissement : recherche, fiche, parcours.
//
// « Candidat » a disparu de l'écran : l'agent de scolarité parle
// d'étudiants. Le mot reste dans le code et dans l'API, où il désigne le
// rattachement d'une personne à un établissement.
//
// Le parcours pluriannuel est l'apport principal de cet écran : une
// personne peut avoir été inscrite plusieurs années de suite, et c'est ce
// fil qu'on consulte quand un dossier est contesté.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  listerCandidats,
  creerCandidat,
  modifierCandidat,
  supprimerCandidat,
  ficheEtudiant,
} from '../../services/candidat.service.js';
import {
  messageErreur,
  LIBELLES_STATUT_INSCRIPTION,
  TON_STATUT_INSCRIPTION,
  LIBELLES_MENTION,
} from '../../utils/libelles.js';
import {
  EnTetePage,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Modale,
  Bouton,
  Champ,
  Saisie,
  Liste,
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';
import ChampsEtudiant, { ETUDIANT_VIDE } from '../../components/ChampsEtudiant.jsx';
import FicheEtudiant from '../../components/FicheEtudiant.jsx';

// L'état civil est saisi par `ChampsEtudiant`, monté aussi depuis
// l'écran Promotions : un champ ajouté ici l'est donc des deux côtés.
const CANDIDAT_VIDE = ETUDIANT_VIDE;

export default function CandidatsPage() {
  const [candidats, setCandidats] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState(null);
  const [form, setForm] = useState(CANDIDAT_VIDE);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  // La fiche remplace l'ancienne modale « Parcours » : celle-ci ne
  // montrait que les inscriptions, alors que juger un cas demande aussi
  // l'état civil, les pièces, les dossiers et les diplômes.
  const [fiche, setFiche] = useState(null);

  async function charger(q = '') {
    setChargement(true);
    setErreur('');
    try {
      setCandidats(await listerCandidats({ recherche: q }));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  // Débounce : la recherche part au serveur, inutile d'y aller à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => charger(recherche), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  function ouvrirCreation() {
    setEnEdition(null);
    setForm(CANDIDAT_VIDE);
    setErreurForm('');
    setModaleOuverte(true);
  }

  function ouvrirEdition(candidat) {
    setEnEdition(candidat.id);
    setForm({
      numero_etudiant: candidat.numero_etudiant || '',
      nom: candidat.nom || '',
      prenom: candidat.prenom || '',
      date_naissance: candidat.date_naissance ? candidat.date_naissance.slice(0, 10) : '',
      lieu_naissance: candidat.lieu_naissance || '',
      sexe: candidat.sexe || '',
      telephone: candidat.telephone || '',
      email: candidat.email || '',
    });
    setErreurForm('');
    setModaleOuverte(true);
  }

  const majChamp = (nom, valeur) => setForm((f) => ({ ...f, [nom]: valeur }));

  async function soumettre(e) {
    e.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      if (enEdition) await modifierCandidat(enEdition, form);
      else await creerCandidat(form);
      setModaleOuverte(false);
      await charger(recherche);
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer(candidat) {
    if (!window.confirm(`Supprimer l'étudiant ${candidat.prenom} ${candidat.nom} ?`)) return;
    setErreur('');
    try {
      await supprimerCandidat(candidat.id);
      await charger(recherche);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function ouvrirFiche(candidat) {
    setFiche({ candidat, donnees: null });
    try {
      setFiche({ candidat, donnees: await ficheEtudiant(candidat.id) });
    } catch (err) {
      setErreur(messageErreur(err));
      setFiche(null);
    }
  }

  return (
    <div>
      <EnTetePage
        titre="Étudiants"
        description="Les personnes inscrites dans votre établissement, toutes années confondues."
        fil={[{ libelle: 'Scolarité' }, { libelle: 'Étudiants' }]}
      >
        <Bouton icone="person_add" onClick={ouvrirCreation}>
          Nouvel étudiant
        </Bouton>
      </EnTetePage>

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      <div className="mb-4 max-w-md">
        <Champ
          label="Rechercher"
          htmlFor="recherche"
          aide="Par nom, prénom ou numéro étudiant."
        >
          <Saisie
            id="recherche"
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="KOFFI, Ama, 2024-0142…"
          />
        </Champ>
      </div>

      <p className="mb-2 text-sm text-gris-500">{candidats.length} étudiant(s) affiché(s).</p>

      <Tableau
        legende="Étudiants de l'établissement"
        chargement={chargement}
        lignes={candidats}
        colonnes={[
          {
            cle: 'numero_etudiant',
            libelle: 'N° étudiant',
            tabulaire: true,
            rendu: (c) => <span className="font-medium">{c.numero_etudiant}</span>,
          },
          {
            cle: 'identite',
            libelle: 'Étudiant',
            rendu: (c) => (
              <span>
                <span className="font-medium">{c.nom}</span> {c.prenom}
                {c.date_naissance && (
                  <span className="block text-xs text-gris-500">
                    né(e) le {new Date(c.date_naissance).toLocaleDateString('fr-FR')}
                    {c.lieu_naissance ? ` à ${c.lieu_naissance}` : ''}
                  </span>
                )}
              </span>
            ),
          },
          { cle: 'sexe', libelle: 'Sexe', rendu: (c) => c.sexe || '—' },
          {
            cle: 'telephone',
            libelle: 'Téléphone',
            tabulaire: true,
            // Une fiche sans numéro n'est pas une fiche incomplète parmi
            // d'autres : elle bloquera la transmission de toute sa
            // promotion. Autant la signaler ici, où elle se corrige.
            rendu: (c) =>
              c.telephone || (
                <Etiquette ton="alerte">En attente de numéro</Etiquette>
              ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (c) => (
              <span className="whitespace-nowrap">
                <Bouton variante="discret" onClick={() => ouvrirFiche(c)}>
                  Fiche
                </Bouton>
                <Bouton variante="discret" className="ml-3" onClick={() => ouvrirEdition(c)}>
                  Modifier
                </Bouton>
                <Bouton
                  variante="discret"
                  className="ml-3 text-erreur hover:text-erreur"
                  onClick={() => supprimer(c)}
                >
                  Supprimer
                </Bouton>
              </span>
            ),
          },
        ]}
        vide={
          <EtatVide
            icone="group"
            titre={recherche ? 'Aucun résultat' : 'Aucun étudiant'}
            action={
              recherche ? null : (
                <Bouton icone="person_add" onClick={ouvrirCreation}>
                  Créer un étudiant
                </Bouton>
              )
            }
          >
            {recherche
              ? 'Aucun étudiant ne correspond à cette recherche.'
              : "Saisissez vos étudiants un par un, ou importez une promotion entière depuis un classeur Excel depuis l'écran Promotions."}
          </EtatVide>
        }
      />

      {/* ── Fiche étudiant ── */}
      <Modale
        ouvert={modaleOuverte}
        titre={enEdition ? "Modifier l'étudiant" : 'Nouvel étudiant'}
        onFermer={() => setModaleOuverte(false)}
      >
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && <Encart ton="erreur">{erreurForm}</Encart>}

          <ChampsEtudiant valeurs={form} onChange={majChamp} prefixe="c" />

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Bouton>
            <Bouton type="submit" enCours={enregistrement}>
              Enregistrer
            </Bouton>
          </div>
        </form>
      </Modale>

      {/* ── Fiche complète ── */}
      <Modale
        ouvert={Boolean(fiche)}
        titre={`Fiche — ${fiche?.candidat?.nom || ''} ${fiche?.candidat?.prenom || ''}`}
        onFermer={() => setFiche(null)}
        largeur="max-w-5xl"
      >
        <FicheEtudiant
          fiche={fiche?.donnees}
          onChangement={() => fiche?.candidat && ouvrirFiche(fiche.candidat)}
        />
      </Modale>

    </div>
  );
}
