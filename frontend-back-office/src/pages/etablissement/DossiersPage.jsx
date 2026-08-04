// ─────────────────────────────────────────────────────────────
// Dossiers de l'établissement — vue dossier par dossier.
//
// Depuis la V2, le mode normal est la transmission d'une promotion
// entière : les dossiers sont GÉNÉRÉS par le lot. Cet écran sert donc
// d'abord à suivre et à corriger, pas à saisir.
//
// La création à l'unité reste possible — candidat libre, rattrapage
// isolé, régularisation — mais elle est présentée comme l'exception
// qu'elle est, pas comme le point d'entrée.
// ─────────────────────────────────────────────────────────────
import { useNomenclatures } from '../../hooks/useNomenclatures.js';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listerDossiers,
  creerDossier,
  modifierDossier,
  transmettreDossier,
  supprimerDossier,
} from '../../services/dossier.service.js';
import { listerCandidats } from '../../services/candidat.service.js';
import {
  LIBELLES_STATUT_DOSSIER,
  LIBELLES_MENTION,
  LIBELLES_TYPE_DIPLOME,
  messageErreur,
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
  Onglets,
} from '../../components/ui/index.jsx';

const DOSSIER_VIDE = {
  candidat_id: '',
  filiere: '',
  parcours: '',
  mention: '',
  date_obtention: '',
  type_diplome: '',
  annee_academique: '',
};

const TONS_DOSSIER = {
  brouillon: 'neutre',
  soumis: 'info',
  en_examen: 'alerte',
  valide: 'succes',
  rejete: 'erreur',
  en_attente_ancrage: 'alerte',
  certifie: 'vert',
};

// Un dossier n'est modifiable que tant qu'il n'est pas parti, ou après
// avoir été renvoyé : c'est justement à ce moment qu'il faut le corriger.
const estModifiable = (s) => s === 'brouillon' || s === 'rejete';

const ONGLETS = [
  { cle: '', libelle: 'Tous' },
  { cle: 'rejete', libelle: 'À corriger' },
  { cle: 'brouillon', libelle: 'Brouillons' },
  { cle: 'soumis', libelle: 'En instruction' },
  { cle: 'certifie', libelle: 'Certifiés' },
];

export default function DossiersPage() {
  const { optionsTypeDiplome, optionsMention } = useNomenclatures();
  const [dossiers, setDossiers] = useState([]);
  const [candidats, setCandidats] = useState([]);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState(null);
  const [form, setForm] = useState(DOSSIER_VIDE);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setDossiers(await listerDossiers({ statut: filtreStatut }));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreStatut]);

  useEffect(() => {
    listerCandidats()
      .then(setCandidats)
      .catch(() => {});
  }, []);

  function ouvrirCreation() {
    setEnEdition(null);
    setForm(DOSSIER_VIDE);
    setErreurForm('');
    setModaleOuverte(true);
  }

  function ouvrirEdition(d) {
    setEnEdition(d.id);
    setForm({
      candidat_id: d.candidat_id || '',
      filiere: d.filiere || '',
      parcours: d.parcours || '',
      mention: d.mention || '',
      date_obtention: d.date_obtention ? d.date_obtention.slice(0, 10) : '',
      type_diplome: d.type_diplome || '',
      annee_academique: d.annee_academique || '',
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
      if (enEdition) await modifierDossier(enEdition, form);
      else await creerDossier(form);
      setModaleOuverte(false);
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function transmettre(d) {
    if (!window.confirm(`Transmettre le dossier ${d.reference} au ministère ?`)) return;
    setErreur('');
    try {
      await transmettreDossier(d.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function supprimer(d) {
    if (!window.confirm(`Supprimer le dossier ${d.reference} ?`)) return;
    setErreur('');
    try {
      await supprimerDossier(d.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  const aCorriger = dossiers.filter((d) => d.statut === 'rejete');

  return (
    <div>
      <EnTetePage
        titre="Dossiers"
        description="Chaque dossier correspond à un étudiant admis. Ils sont normalement créés par la transmission d'une promotion."
        fil={[{ libelle: 'Transmission' }, { libelle: 'Dossiers' }]}
      >
        <Bouton variante="secondaire" icone="add" onClick={ouvrirCreation}>
          Dossier isolé
        </Bouton>
      </EnTetePage>

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {aCorriger.length > 0 && filtreStatut !== 'rejete' && (
        <div className="mb-5">
          <Encart ton="alerte" titre={`${aCorriger.length} dossier(s) renvoyés par le ministère`}>
            Corrigez-les puis retransmettez-les individuellement — inutile de renvoyer le lot
            entier.
          </Encart>
        </div>
      )}

      <Onglets onglets={ONGLETS} actif={filtreStatut} onChanger={setFiltreStatut} />

      <Tableau
        legende="Dossiers de l'établissement"
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
                {d.lot_reference ? (
                  <span className="block text-xs text-gris-500">lot {d.lot_reference}</span>
                ) : (
                  <span className="block text-xs text-gris-500">dossier isolé</span>
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
          {
            cle: 'type_diplome',
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
            cle: 'statut',
            libelle: 'Statut',
            rendu: (d) => (
              <span>
                <Etiquette ton={TONS_DOSSIER[d.statut] || 'neutre'}>
                  {LIBELLES_STATUT_DOSSIER[d.statut] || d.statut}
                </Etiquette>
                {d.motif_rejet && (
                  <span className="mt-1 block max-w-xs text-xs text-erreur">{d.motif_rejet}</span>
                )}
              </span>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (d) =>
              estModifiable(d.statut) ? (
                <span className="whitespace-nowrap">
                  <Bouton variante="discret" onClick={() => ouvrirEdition(d)}>
                    {d.statut === 'rejete' ? 'Corriger' : 'Modifier'}
                  </Bouton>
                  <Bouton variante="discret" className="ml-3" onClick={() => transmettre(d)}>
                    Transmettre
                  </Bouton>
                  {d.statut === 'brouillon' && (
                    <Bouton
                      variante="discret"
                      className="ml-3 text-erreur hover:text-erreur"
                      onClick={() => supprimer(d)}
                    >
                      Supprimer
                    </Bouton>
                  )}
                </span>
              ) : (
                <span className="text-gris-500">—</span>
              ),
          },
        ]}
        vide={
          <EtatVide
            icone="folder"
            titre="Aucun dossier"
            action={
              <Link to="/promotions">
                <Bouton icone="groups">Aller aux promotions</Bouton>
              </Link>
            }
          >
            Les dossiers sont créés lorsque vous transmettez une promotion : un dossier par
            étudiant admis.
          </EtatVide>
        }
      />

      <Modale
        ouvert={modaleOuverte}
        titre={enEdition ? 'Modifier le dossier' : 'Nouveau dossier isolé'}
        onFermer={() => setModaleOuverte(false)}
      >
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && <Encart ton="erreur">{erreurForm}</Encart>}

          {!enEdition && (
            <Encart ton="info" titre="Voie exceptionnelle">
              Pour une cohorte entière, passez par « Promotions » : la transmission crée les
              dossiers automatiquement et sans erreur de recopie.
            </Encart>
          )}

          <Champ label="Étudiant" htmlFor="d-candidat" requis>
            <Liste
              id="d-candidat"
              required
              value={form.candidat_id}
              onChange={(e) => majChamp('candidat_id', e.target.value)}
              options={candidats.map((c) => ({
                value: c.id,
                label: `${c.nom} ${c.prenom} (${c.numero_etudiant})`,
              }))}
            />
          </Champ>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              label="Type de diplôme"
              htmlFor="d-type"
              aide="Requis avant transmission."
            >
              <Liste
                id="d-type"
                value={form.type_diplome}
                onChange={(e) => majChamp('type_diplome', e.target.value)}
                options={optionsTypeDiplome}
              />
            </Champ>
            <Champ label="Mention" htmlFor="d-mention">
              <Liste
                id="d-mention"
                value={form.mention}
                onChange={(e) => majChamp('mention', e.target.value)}
                options={optionsMention}
              />
            </Champ>
            <Champ label="Filière" htmlFor="d-filiere">
              <Saisie
                id="d-filiere"
                value={form.filiere}
                onChange={(e) => majChamp('filiere', e.target.value)}
              />
            </Champ>
            <Champ label="Parcours" htmlFor="d-parcours">
              <Saisie
                id="d-parcours"
                value={form.parcours}
                onChange={(e) => majChamp('parcours', e.target.value)}
              />
            </Champ>
            <Champ
              label="Date d'obtention"
              htmlFor="d-obtention"
              aide="Requise avant transmission."
            >
              <Saisie
                id="d-obtention"
                type="date"
                value={form.date_obtention}
                onChange={(e) => majChamp('date_obtention', e.target.value)}
              />
            </Champ>
            <Champ label="Année académique" htmlFor="d-annee">
              <Saisie
                id="d-annee"
                placeholder="2024-2025"
                value={form.annee_academique}
                onChange={(e) => majChamp('annee_academique', e.target.value)}
              />
            </Champ>
          </div>

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
    </div>
  );
}
