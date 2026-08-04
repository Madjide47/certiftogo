// ─────────────────────────────────────────────────────────────
// Demandes d'intégration — l'entrée d'un établissement dans le système.
//
// Un établissement ne s'inscrit pas tout seul : il dépose une demande
// depuis le site public, le ministère l'instruit, et l'acceptation vaut
// AGRÉMENT. C'est cet acte qui crée l'établissement, son code national
// et le compte de son agent principal.
//
// L'écran d'acceptation est donc un formulaire d'agrément, pas un bouton
// « OK » : le ministère y corrige le nom officiel, attribue le code et
// vise l'arrêté. Les valeurs déclarées par le demandeur ne sont que des
// propositions.
// ─────────────────────────────────────────────────────────────
import { useNomenclatures } from '../../hooks/useNomenclatures.js';
import { useEffect, useState } from 'react';
import {
  listerDemandes,
  examinerDemande,
  accepterDemande,
  refuserDemande,
} from '../../services/gouvernance.service.js';
import { LIBELLES_TYPE_DIPLOME, messageErreur } from '../../utils/libelles.js';
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
  Zone,
  Onglets,
} from '../../components/ui/index.jsx';

const STATUTS = {
  soumise: { libelle: 'Soumise', ton: 'info' },
  en_examen: { libelle: 'En examen', ton: 'alerte' },
  acceptee: { libelle: 'Acceptée', ton: 'vert' },
  refusee: { libelle: 'Refusée', ton: 'erreur' },
};

const ONGLETS = [
  { cle: 'soumise', libelle: 'À instruire' },
  { cle: 'en_examen', libelle: 'En examen' },
  { cle: 'acceptee', libelle: 'Agréées' },
  { cle: 'refusee', libelle: 'Refusées' },
];

const TYPES_ETABLISSEMENT = [
  { value: 'universite', label: 'Université' },
  { value: 'ecole', label: 'École' },
  { value: 'institut', label: 'Institut' },
  { value: 'lycee', label: 'Lycée' },
  { value: 'centre_formation', label: 'Centre de formation' },
];

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function DemandesPage() {
  const { optionsTypeDiplome } = useNomenclatures();
  const [demandes, setDemandes] = useState([]);
  const [repartition, setRepartition] = useState({});
  const [onglet, setOnglet] = useState('soumise');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [action, setAction] = useState(false);

  const [agrement, setAgrement] = useState(null);
  const [form, setForm] = useState(null);
  const [refus, setRefus] = useState(null);
  const [motif, setMotif] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      const data = await listerDemandes({ statut: onglet });
      setDemandes(data.demandes);
      setRepartition(data.repartition || {});
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

  async function examiner(demande) {
    setErreur('');
    try {
      await examinerDemande(demande.id);
      setSucces(`Demande ${demande.reference} prise en examen.`);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  function ouvrirAgrement(demande) {
    setAgrement(demande);
    setForm({
      code: '',
      reference_arrete: '',
      nom: demande.nom || '',
      type: demande.type || 'universite',
      ville: demande.ville || '',
      email: demande.email || '',
      telephone: demande.telephone || '',
      types_diplomes: demande.types_diplomes_demandes || [],
      agent_nom: demande.responsable_nom || '',
      agent_prenom: demande.responsable_prenom || '',
      agent_telephone: demande.responsable_telephone || '',
    });
  }

  function basculerType(valeur) {
    setForm((f) => ({
      ...f,
      types_diplomes: f.types_diplomes.includes(valeur)
        ? f.types_diplomes.filter((t) => t !== valeur)
        : [...f.types_diplomes, valeur],
    }));
  }

  async function confirmerAgrement(e) {
    e.preventDefault();
    setAction(true);
    setErreur('');
    try {
      const res = await accepterDemande(agrement.id, {
        code: form.code,
        reference_arrete: form.reference_arrete,
        nom: form.nom,
        type: form.type,
        ville: form.ville,
        email: form.email,
        telephone: form.telephone,
        types_diplomes: form.types_diplomes,
        agent_principal: {
          nom: form.agent_nom,
          prenom: form.agent_prenom,
          telephone: form.agent_telephone,
        },
      });
      setAgrement(null);
      setSucces(
        `${res.etablissement?.nom || 'Établissement'} agréé sous le code ${res.etablissement?.code}. ` +
          `Son agent principal peut se connecter avec le numéro ${form.agent_telephone}.`
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  async function confirmerRefus(e) {
    e.preventDefault();
    setAction(true);
    setErreur('');
    try {
      await refuserDemande(refus.id, motif);
      setRefus(null);
      setMotif('');
      setSucces('Demande refusée. Le demandeur peut suivre la décision avec sa référence.');
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  return (
    <div>
      <EnTetePage
        titre="Demandes d'intégration"
        description="Les établissements qui demandent à rejoindre la plateforme. Les accepter vaut agrément."
        fil={[{ libelle: 'Référentiel' }, { libelle: "Demandes d'intégration" }]}
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

      <Onglets
        onglets={ONGLETS.map((o) => ({ ...o, compteur: repartition[o.cle] }))}
        actif={onglet}
        onChanger={setOnglet}
      />

      <Tableau
        legende="Demandes d'intégration"
        chargement={chargement}
        lignes={demandes}
        colonnes={[
          {
            cle: 'reference',
            libelle: 'Référence',
            tabulaire: true,
            rendu: (d) => <span className="font-medium">{d.reference}</span>,
          },
          {
            cle: 'nom',
            libelle: 'Établissement',
            rendu: (d) => (
              <span>
                <span className="font-medium">{d.nom}</span>
                <span className="block text-xs text-gris-500">
                  {TYPES_ETABLISSEMENT.find((t) => t.value === d.type)?.label || d.type} —{' '}
                  {d.ville}
                </span>
              </span>
            ),
          },
          {
            cle: 'responsable',
            libelle: 'Responsable',
            rendu: (d) => (
              <span>
                {d.responsable_nom} {d.responsable_prenom}
                <span className="tabulaire block text-xs text-gris-500">
                  {d.responsable_telephone}
                </span>
              </span>
            ),
          },
          {
            cle: 'types_diplomes_demandes',
            libelle: 'Diplômes demandés',
            rendu: (d) =>
              (d.types_diplomes_demandes || []).length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {d.types_diplomes_demandes.map((t) => (
                    <Etiquette key={t}>{LIBELLES_TYPE_DIPLOME[t] || t}</Etiquette>
                  ))}
                </span>
              ) : (
                '—'
              ),
          },
          {
            cle: 'date_soumission',
            libelle: 'Déposée le',
            rendu: (d) => date(d.date_soumission),
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (d) => (
              <span>
                <Etiquette ton={STATUTS[d.statut]?.ton}>
                  {STATUTS[d.statut]?.libelle || d.statut}
                </Etiquette>
                {d.motif_refus && (
                  <span className="block text-xs text-erreur">{d.motif_refus}</span>
                )}
              </span>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (d) => {
              if (d.statut === 'soumise') {
                return (
                  <Bouton variante="discret" onClick={() => examiner(d)}>
                    Prendre en examen
                  </Bouton>
                );
              }
              if (d.statut === 'en_examen') {
                return (
                  <span className="whitespace-nowrap">
                    <Bouton variante="discret" onClick={() => ouvrirAgrement(d)}>
                      Agréer
                    </Bouton>
                    <Bouton
                      variante="discret"
                      className="ml-3 text-erreur hover:text-erreur"
                      onClick={() => {
                        setRefus(d);
                        setMotif('');
                      }}
                    >
                      Refuser
                    </Bouton>
                  </span>
                );
              }
              return <span className="text-gris-500">—</span>;
            },
          },
        ]}
        vide={
          <EtatVide icone="assignment_add" titre="Aucune demande">
            Les demandes arrivent depuis le formulaire public du site de vérification.
          </EtatVide>
        }
      />

      {/* ── Agrément ── */}
      <Modale
        ouvert={Boolean(agrement)}
        titre={`Agréer — ${agrement?.nom || ''}`}
        onFermer={() => setAgrement(null)}
        largeur="max-w-3xl"
      >
        {form && (
          <form onSubmit={confirmerAgrement} className="space-y-4">
            <Encart ton="alerte" titre="Cet acte crée l'établissement">
              L'agrément ouvre un compte à l'agent principal désigné : il pourra dès lors saisir
              des étudiants et transmettre au ministère. Vérifiez le numéro de téléphone, c'est
              son identifiant de connexion.
            </Encart>

            <div className="grid gap-4 sm:grid-cols-2">
              <Champ
                label="Code national"
                htmlFor="a-code"
                requis
                aide="Identifiant officiel, unique. Il figurera sur les diplômes."
              >
                <Saisie
                  id="a-code"
                  required
                  placeholder="ETB-UL"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </Champ>
              <Champ
                label="Référence de l'arrêté"
                htmlFor="a-arrete"
                aide="L'acte administratif qui fonde l'agrément."
              >
                <Saisie
                  id="a-arrete"
                  placeholder="N° 2026-042/MESR"
                  value={form.reference_arrete}
                  onChange={(e) => setForm({ ...form, reference_arrete: e.target.value })}
                />
              </Champ>
            </div>

            <Champ
              label="Nom officiel"
              htmlFor="a-nom"
              requis
              aide="Corrigez si le nom déclaré diffère de la dénomination officielle."
            >
              <Saisie
                id="a-nom"
                required
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
            </Champ>

            <div className="grid gap-4 sm:grid-cols-3">
              <Champ label="Type" htmlFor="a-type" requis>
                <Liste
                  id="a-type"
                  vide={null}
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  options={TYPES_ETABLISSEMENT}
                />
              </Champ>
              <Champ label="Ville" htmlFor="a-ville" requis>
                <Saisie
                  id="a-ville"
                  required
                  value={form.ville}
                  onChange={(e) => setForm({ ...form, ville: e.target.value })}
                />
              </Champ>
              <Champ label="Téléphone" htmlFor="a-tel">
                <Saisie
                  id="a-tel"
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                />
              </Champ>
            </div>

            <fieldset>
              <legend className="text-base font-medium text-gris-900">
                Diplômes habilités
                <span className="text-erreur" aria-hidden="true">
                  {' '}
                  *
                </span>
              </legend>
              <p className="mt-0.5 text-sm text-gris-500">
                L'établissement ne pourra transmettre que ces types de diplômes. Le demandeur en
                a proposé une liste, vous restez libre de la restreindre.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {optionsTypeDiplome.map((o) => (
                  <label key={o.value} className="flex items-center gap-1.5 text-base">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={form.types_diplomes.includes(o.value)}
                      onChange={() => basculerType(o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="border-t border-gris-200 pt-4">
              <legend className="text-base font-medium text-gris-900">Agent principal</legend>
              <p className="mt-0.5 mb-2 text-sm text-gris-500">
                Le seul compte capable de créer les autres agents de l'établissement.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Champ label="Nom" htmlFor="a-agent-nom" requis>
                  <Saisie
                    id="a-agent-nom"
                    required
                    value={form.agent_nom}
                    onChange={(e) => setForm({ ...form, agent_nom: e.target.value })}
                  />
                </Champ>
                <Champ label="Prénom" htmlFor="a-agent-prenom" requis>
                  <Saisie
                    id="a-agent-prenom"
                    required
                    value={form.agent_prenom}
                    onChange={(e) => setForm({ ...form, agent_prenom: e.target.value })}
                  />
                </Champ>
                <Champ label="Téléphone" htmlFor="a-agent-tel" requis>
                  <Saisie
                    id="a-agent-tel"
                    required
                    value={form.agent_telephone}
                    onChange={(e) => setForm({ ...form, agent_telephone: e.target.value })}
                  />
                </Champ>
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
              <Bouton variante="neutre" onClick={() => setAgrement(null)}>
                Annuler
              </Bouton>
              <Bouton
                type="submit"
                enCours={action}
                disabled={form.types_diplomes.length === 0 || !form.code.trim()}
              >
                Agréer l'établissement
              </Bouton>
            </div>
          </form>
        )}
      </Modale>

      {/* ── Refus ── */}
      <Modale
        ouvert={Boolean(refus)}
        titre={`Refuser — ${refus?.nom || ''}`}
        onFermer={() => setRefus(null)}
      >
        <form onSubmit={confirmerRefus} className="space-y-4">
          <Champ
            label="Motif du refus"
            htmlFor="motif-demande"
            requis
            aide="Le demandeur le consultera avec sa référence de suivi. Indiquez ce qui manque s'il peut redéposer."
          >
            <Zone
              id="motif-demande"
              rows={4}
              required
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </Champ>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setRefus(null)}>
              Annuler
            </Bouton>
            <Bouton type="submit" variante="danger" enCours={action} disabled={!motif.trim()}>
              Refuser la demande
            </Bouton>
          </div>
        </form>
      </Modale>
    </div>
  );
}
