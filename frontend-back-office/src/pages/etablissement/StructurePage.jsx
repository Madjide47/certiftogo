// ─────────────────────────────────────────────────────────────
// Structure de l'établissement : facultés et filières.
//
// C'est le socle des promotions — sans filière, aucune cohorte ne peut
// être créée. L'écran suit donc l'ordre de dépendance : la faculté
// d'abord, la filière ensuite, et le bouton « nouvelle filière » reste
// désactivé tant qu'aucune faculté n'existe.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  listerFacultes,
  creerFaculte,
  modifierFaculte,
  supprimerFaculte,
  listerFilieres,
  creerFiliere,
  modifierFiliere,
  supprimerFiliere,
} from '../../services/structure.service.js';
import {
  LIBELLES_TYPE_DIPLOME,
  OPTIONS_TYPE_DIPLOME,
  LIBELLES_STATUT_STRUCTURE,
  messageErreur,
} from '../../utils/libelles.js';
import {
  EnTetePage,
  Section,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Modale,
  Bouton,
  Champ,
  Saisie,
  Liste,
} from '../../components/ui/index.jsx';

const FACULTE_VIDE = { nom: '', code: '', statut: 'active' };
const FILIERE_VIDE = {
  faculte_id: '',
  nom: '',
  code: '',
  type_diplome: 'licence',
  duree_annees: 3,
  statut: 'active',
};

const OPTIONS_STATUT = [
  { value: 'active', label: 'Active' },
  { value: 'archivee', label: 'Archivée' },
];

const tonStatut = (s) => (s === 'active' ? 'succes' : 'neutre');

export default function StructurePage() {
  const [facultes, setFacultes] = useState([]);
  const [filieres, setFilieres] = useState([]);
  const [filtreFaculte, setFiltreFaculte] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const [modaleFaculte, setModaleFaculte] = useState(false);
  const [faculteEnEdition, setFaculteEnEdition] = useState(null);
  const [formFaculte, setFormFaculte] = useState(FACULTE_VIDE);

  const [modaleFiliere, setModaleFiliere] = useState(false);
  const [filiereEnEdition, setFiliereEnEdition] = useState(null);
  const [formFiliere, setFormFiliere] = useState(FILIERE_VIDE);

  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      const [f, fi] = await Promise.all([
        listerFacultes(),
        listerFilieres({ faculte_id: filtreFaculte }),
      ]);
      setFacultes(f);
      setFilieres(fi);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreFaculte]);

  // ── Facultés ──────────────────────────────────────────────────
  function ouvrirFaculte(faculte = null) {
    setFaculteEnEdition(faculte?.id || null);
    setFormFaculte(
      faculte ? { nom: faculte.nom, code: faculte.code, statut: faculte.statut } : FACULTE_VIDE
    );
    setErreurForm('');
    setModaleFaculte(true);
  }

  async function soumettreFaculte(e) {
    e.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      if (faculteEnEdition) await modifierFaculte(faculteEnEdition, formFaculte);
      else await creerFaculte(formFaculte);
      setModaleFaculte(false);
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function retirerFaculte(faculte) {
    if (!window.confirm(`Supprimer la faculté « ${faculte.nom} » ?`)) return;
    setErreur('');
    try {
      await supprimerFaculte(faculte.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  // ── Filières ──────────────────────────────────────────────────
  function ouvrirFiliere(filiere = null) {
    setFiliereEnEdition(filiere?.id || null);
    setFormFiliere(
      filiere
        ? {
            faculte_id: filiere.faculte_id,
            nom: filiere.nom,
            code: filiere.code,
            type_diplome: filiere.type_diplome,
            duree_annees: filiere.duree_annees,
            statut: filiere.statut,
          }
        : { ...FILIERE_VIDE, faculte_id: filtreFaculte || facultes[0]?.id || '' }
    );
    setErreurForm('');
    setModaleFiliere(true);
  }

  async function soumettreFiliere(e) {
    e.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      if (filiereEnEdition) await modifierFiliere(filiereEnEdition, formFiliere);
      else await creerFiliere(formFiliere);
      setModaleFiliere(false);
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function retirerFiliere(filiere) {
    if (!window.confirm(`Supprimer la filière « ${filiere.nom} » ?`)) return;
    setErreur('');
    try {
      await supprimerFiliere(filiere.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  const optionsFacultes = facultes.map((f) => ({ value: f.id, label: f.nom }));

  return (
    <div>
      <EnTetePage
        titre="Structure"
        description="Facultés et filières de votre établissement. Toute promotion se rattache à une filière."
        fil={[{ libelle: 'Établissement' }, { libelle: 'Structure' }]}
      />

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      <Section
        titre="Facultés"
        description={`${facultes.length} faculté(s) déclarée(s).`}
        actions={
          <Bouton icone="add" onClick={() => ouvrirFaculte()}>
            Nouvelle faculté
          </Bouton>
        }
      >
        <Tableau
          legende="Facultés de l'établissement"
          chargement={chargement}
          lignes={facultes}
          colonnes={[
            {
              cle: 'code',
              libelle: 'Code',
              rendu: (f) => <span className="font-medium">{f.code}</span>,
            },
            { cle: 'nom', libelle: 'Nom' },
            {
              cle: 'statut',
              libelle: 'Statut',
              rendu: (f) => (
                <Etiquette ton={tonStatut(f.statut)}>
                  {LIBELLES_STATUT_STRUCTURE[f.statut]}
                </Etiquette>
              ),
            },
            {
              cle: 'actions',
              libelle: 'Actions',
              alignement: 'droite',
              rendu: (f) => (
                <span className="whitespace-nowrap">
                  <Bouton variante="discret" onClick={() => ouvrirFaculte(f)}>
                    Modifier
                  </Bouton>
                  <Bouton
                    variante="discret"
                    className="ml-3 text-erreur hover:text-erreur"
                    onClick={() => retirerFaculte(f)}
                  >
                    Supprimer
                  </Bouton>
                </span>
              ),
            },
          ]}
          vide={
            <EtatVide
              icone="account_balance"
              titre="Aucune faculté"
              action={
                <Bouton icone="add" onClick={() => ouvrirFaculte()}>
                  Créer une faculté
                </Bouton>
              }
            >
              Commencez par créer une faculté ; vous pourrez ensuite y rattacher des filières.
            </EtatVide>
          }
        />
      </Section>

      <Section
        titre="Filières"
        description={`${filieres.length} filière(s) affichée(s).`}
        actions={
          <Bouton
            icone="add"
            onClick={() => ouvrirFiliere()}
            disabled={facultes.length === 0}
            title={facultes.length === 0 ? "Créez d'abord une faculté" : undefined}
          >
            Nouvelle filière
          </Bouton>
        }
      >
        <div className="mb-3 max-w-xs">
          <Champ label="Filtrer par faculté" htmlFor="filtre-faculte">
            <Liste
              id="filtre-faculte"
              vide="Toutes les facultés"
              value={filtreFaculte}
              onChange={(e) => setFiltreFaculte(e.target.value)}
              options={optionsFacultes}
            />
          </Champ>
        </div>

        <Tableau
          legende="Filières de l'établissement"
          chargement={chargement}
          lignes={filieres}
          colonnes={[
            {
              cle: 'code',
              libelle: 'Code',
              rendu: (f) => <span className="font-medium">{f.code}</span>,
            },
            { cle: 'nom', libelle: 'Nom' },
            { cle: 'faculte_nom', libelle: 'Faculté' },
            {
              cle: 'type_diplome',
              libelle: 'Diplôme',
              rendu: (f) => LIBELLES_TYPE_DIPLOME[f.type_diplome],
            },
            {
              cle: 'duree_annees',
              libelle: 'Durée',
              tabulaire: true,
              rendu: (f) => `${f.duree_annees} an(s)`,
            },
            {
              cle: 'statut',
              libelle: 'Statut',
              rendu: (f) => (
                <Etiquette ton={tonStatut(f.statut)}>
                  {LIBELLES_STATUT_STRUCTURE[f.statut]}
                </Etiquette>
              ),
            },
            {
              cle: 'actions',
              libelle: 'Actions',
              alignement: 'droite',
              rendu: (f) => (
                <span className="whitespace-nowrap">
                  <Bouton variante="discret" onClick={() => ouvrirFiliere(f)}>
                    Modifier
                  </Bouton>
                  <Bouton
                    variante="discret"
                    className="ml-3 text-erreur hover:text-erreur"
                    onClick={() => retirerFiliere(f)}
                  >
                    Supprimer
                  </Bouton>
                </span>
              ),
            },
          ]}
          vide={
            <EtatVide icone="school" titre="Aucune filière">
              Une filière porte le type de diplôme et sa durée : c'est elle qui borne les
              promotions que vous pourrez créer.
            </EtatVide>
          }
        />
      </Section>

      {/* ── Modale faculté ── */}
      <Modale
        ouvert={modaleFaculte}
        titre={faculteEnEdition ? 'Modifier la faculté' : 'Nouvelle faculté'}
        onFermer={() => setModaleFaculte(false)}
      >
        <form onSubmit={soumettreFaculte} className="space-y-4">
          {erreurForm && <Encart ton="erreur">{erreurForm}</Encart>}

          <Champ label="Nom" htmlFor="fac-nom" requis>
            <Saisie
              id="fac-nom"
              required
              placeholder="Faculté des Sciences et Techniques"
              value={formFaculte.nom}
              onChange={(e) => setFormFaculte((f) => ({ ...f, nom: e.target.value }))}
            />
          </Champ>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Code" htmlFor="fac-code" requis aide="20 caractères au plus.">
              <Saisie
                id="fac-code"
                required
                maxLength={20}
                placeholder="FST"
                value={formFaculte.code}
                onChange={(e) => setFormFaculte((f) => ({ ...f, code: e.target.value }))}
              />
            </Champ>
            <Champ label="Statut" htmlFor="fac-statut">
              <Liste
                id="fac-statut"
                vide={null}
                value={formFaculte.statut}
                onChange={(e) => setFormFaculte((f) => ({ ...f, statut: e.target.value }))}
                options={OPTIONS_STATUT}
              />
            </Champ>
          </div>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setModaleFaculte(false)}>
              Annuler
            </Bouton>
            <Bouton type="submit" enCours={enregistrement}>
              Enregistrer
            </Bouton>
          </div>
        </form>
      </Modale>

      {/* ── Modale filière ── */}
      <Modale
        ouvert={modaleFiliere}
        titre={filiereEnEdition ? 'Modifier la filière' : 'Nouvelle filière'}
        onFermer={() => setModaleFiliere(false)}
      >
        <form onSubmit={soumettreFiliere} className="space-y-4">
          {erreurForm && <Encart ton="erreur">{erreurForm}</Encart>}

          <Champ
            label="Faculté"
            htmlFor="fil-faculte"
            requis
            aide={
              filiereEnEdition
                ? 'Le rattachement ne peut plus changer : des promotions en dépendent.'
                : undefined
            }
          >
            <Liste
              id="fil-faculte"
              required
              disabled={Boolean(filiereEnEdition)}
              value={formFiliere.faculte_id}
              onChange={(e) => setFormFiliere((f) => ({ ...f, faculte_id: e.target.value }))}
              options={optionsFacultes}
            />
          </Champ>

          <Champ label="Nom" htmlFor="fil-nom" requis>
            <Saisie
              id="fil-nom"
              required
              placeholder="Génie Logiciel"
              value={formFiliere.nom}
              onChange={(e) => setFormFiliere((f) => ({ ...f, nom: e.target.value }))}
            />
          </Champ>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Code" htmlFor="fil-code" requis>
              <Saisie
                id="fil-code"
                required
                maxLength={20}
                placeholder="GL"
                value={formFiliere.code}
                onChange={(e) => setFormFiliere((f) => ({ ...f, code: e.target.value }))}
              />
            </Champ>
            <Champ label="Type de diplôme" htmlFor="fil-type" requis>
              <Liste
                id="fil-type"
                vide={null}
                value={formFiliere.type_diplome}
                onChange={(e) => setFormFiliere((f) => ({ ...f, type_diplome: e.target.value }))}
                options={OPTIONS_TYPE_DIPLOME}
              />
            </Champ>
            <Champ
              label="Durée"
              htmlFor="fil-duree"
              requis
              aide="Entre 1 et 8 ans. Elle borne le niveau des promotions."
            >
              <Saisie
                id="fil-duree"
                required
                type="number"
                min={1}
                max={8}
                value={formFiliere.duree_annees}
                onChange={(e) => setFormFiliere((f) => ({ ...f, duree_annees: e.target.value }))}
              />
            </Champ>
            <Champ label="Statut" htmlFor="fil-statut">
              <Liste
                id="fil-statut"
                vide={null}
                value={formFiliere.statut}
                onChange={(e) => setFormFiliere((f) => ({ ...f, statut: e.target.value }))}
                options={OPTIONS_STATUT}
              />
            </Champ>
          </div>

          <Encart ton="info">
            Une licence de 3 ans n'acceptera pas de promotion de niveau 4 : la durée déclarée ici
            est contrôlée à la création de chaque promotion.
          </Encart>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setModaleFiliere(false)}>
              Annuler
            </Bouton>
            <Bouton type="submit" enCours={enregistrement}>
              Enregistrer
            </Bouton>
          </div>
        </form>
      </Modale>
    </div>
  );
}
