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
} from '../../services/candidat.service.js';
import { parcoursEtudiant } from '../../services/promotion.service.js';
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

const CANDIDAT_VIDE = {
  numero_etudiant: '',
  nom: '',
  prenom: '',
  date_naissance: '',
  lieu_naissance: '',
  sexe: '',
  telephone: '',
  email: '',
};

const OPTIONS_SEXE = [
  { value: 'M', label: 'Masculin' },
  { value: 'F', label: 'Féminin' },
];

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

  const [parcours, setParcours] = useState(null);

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

  async function ouvrirParcours(candidat) {
    setParcours({ candidat, inscriptions: null });
    try {
      const ins = await parcoursEtudiant(candidat.id);
      setParcours({ candidat, inscriptions: ins });
    } catch (err) {
      setErreur(messageErreur(err));
      setParcours(null);
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
            rendu: (c) => c.telephone || '—',
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (c) => (
              <span className="whitespace-nowrap">
                <Bouton variante="discret" onClick={() => ouvrirParcours(c)}>
                  Parcours
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              label="N° étudiant"
              htmlFor="c-numero"
              requis
              aide="Unique dans votre établissement."
            >
              <Saisie
                id="c-numero"
                required
                value={form.numero_etudiant}
                onChange={(e) => majChamp('numero_etudiant', e.target.value)}
              />
            </Champ>
            <Champ label="Sexe" htmlFor="c-sexe">
              <Liste
                id="c-sexe"
                value={form.sexe}
                onChange={(e) => majChamp('sexe', e.target.value)}
                options={OPTIONS_SEXE}
              />
            </Champ>
            <Champ label="Nom" htmlFor="c-nom" requis>
              <Saisie
                id="c-nom"
                required
                value={form.nom}
                onChange={(e) => majChamp('nom', e.target.value)}
              />
            </Champ>
            <Champ label="Prénom" htmlFor="c-prenom" requis>
              <Saisie
                id="c-prenom"
                required
                value={form.prenom}
                onChange={(e) => majChamp('prenom', e.target.value)}
              />
            </Champ>
            <Champ label="Date de naissance" htmlFor="c-naissance">
              <Saisie
                id="c-naissance"
                type="date"
                value={form.date_naissance}
                onChange={(e) => majChamp('date_naissance', e.target.value)}
              />
            </Champ>
            <Champ label="Lieu de naissance" htmlFor="c-lieu">
              <Saisie
                id="c-lieu"
                value={form.lieu_naissance}
                onChange={(e) => majChamp('lieu_naissance', e.target.value)}
              />
            </Champ>
          </div>

          <Champ
            label="Téléphone"
            htmlFor="c-telephone"
            aide="Sert à ouvrir le portefeuille du diplômé après certification. Sans numéro, l'étudiant ne pourra pas consulter ses diplômes."
          >
            <Saisie
              id="c-telephone"
              placeholder="+228 90 00 00 00"
              value={form.telephone}
              onChange={(e) => majChamp('telephone', e.target.value)}
            />
          </Champ>

          <Champ label="Email" htmlFor="c-email">
            <Saisie
              id="c-email"
              type="email"
              value={form.email}
              onChange={(e) => majChamp('email', e.target.value)}
            />
          </Champ>

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

      {/* ── Parcours pluriannuel ── */}
      <Modale
        ouvert={Boolean(parcours)}
        titre={`Parcours — ${parcours?.candidat?.nom || ''} ${parcours?.candidat?.prenom || ''}`}
        onFermer={() => setParcours(null)}
        largeur="max-w-3xl"
      >
        {parcours?.inscriptions === null ? (
          <Chargement />
        ) : (
          <>
            <Tableau
              legende="Inscriptions successives"
              lignes={parcours?.inscriptions || []}
              colonnes={[
                { cle: 'annee_libelle', libelle: 'Année' },
                {
                  cle: 'promotion',
                  libelle: 'Promotion',
                  rendu: (i) => (
                    <span>
                      <span className="font-medium">{i.promotion_libelle}</span>
                      <span className="block text-xs text-gris-500">
                        {i.filiere_nom} — niveau {i.niveau}
                      </span>
                    </span>
                  ),
                },
                {
                  cle: 'statut',
                  libelle: 'Résultat',
                  rendu: (i) => (
                    <Etiquette ton={TON_STATUT_INSCRIPTION[i.statut]}>
                      {LIBELLES_STATUT_INSCRIPTION[i.statut]}
                    </Etiquette>
                  ),
                },
                {
                  cle: 'moyenne',
                  libelle: 'Moyenne',
                  alignement: 'droite',
                  tabulaire: true,
                  rendu: (i) => i.moyenne ?? '—',
                },
                {
                  cle: 'mention',
                  libelle: 'Mention',
                  rendu: (i) => (i.mention ? LIBELLES_MENTION[i.mention] : '—'),
                },
              ]}
              vide={
                <EtatVide icone="timeline" titre="Aucune inscription">
                  Cet étudiant n'est encore inscrit dans aucune promotion.
                </EtatVide>
              }
            />

            <p className="mt-4 flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
              Ce parcours ne couvre que votre établissement. Un diplômé peut avoir étudié
              ailleurs : son portefeuille national, lui, réunit tout.
            </p>
          </>
        )}
      </Modale>
    </div>
  );
}
