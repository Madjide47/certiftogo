// ─────────────────────────────────────────────────────────────
// Promotions de l'établissement : cohortes, inscriptions, résultats,
// puis transmission au ministère.
//
// La promotion est l'unité de transmission. Son cycle de vie dépend du
// mode de fonctionnement de l'établissement (simple ou hiérarchique) :
// l'écran interroge le profil pour ne proposer que les étapes réelles.
//
// La transmission n'est pas un changement de statut de plus : elle crée
// un lot et un dossier par étudiant ADMIS. Elle a donc sa propre modale,
// qui annonce le décompte avant de partir.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listerPromotions,
  creerPromotion,
  changerStatutPromotion,
  supprimerPromotion,
  listerInscriptions,
  inscrireEtudiant,
  enregistrerResultat,
  desinscrireEtudiant,
} from '../../services/promotion.service.js';
import { transmettrePromotion } from '../../services/lot.service.js';
import {
  simulerImport,
  executerImport,
  telechargerModeleImport,
} from '../../services/import.service.js';
import { listerAnnees, listerSessions } from '../../services/referentiel.service.js';
import { listerFilieres, monProfil } from '../../services/structure.service.js';
import { listerCandidats } from '../../services/candidat.service.js';
import PiecesJointes from '../../components/PiecesJointes.jsx';
import {
  LIBELLES_STATUT_PROMOTION,
  TON_STATUT_PROMOTION,
  OPTIONS_STATUT_PROMOTION,
  actionsPromotion,
  transmissiblePromotion,
  LIBELLES_STATUT_INSCRIPTION,
  TON_STATUT_INSCRIPTION,
  OPTIONS_STATUT_INSCRIPTION,
  LIBELLES_TYPE_SESSION,
  LIBELLES_MENTION,
  OPTIONS_MENTION,
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
  Icone,
  Chiffre,
} from '../../components/ui/index.jsx';

const PROMOTION_VIDE = {
  filiere_id: '',
  annee_id: '',
  session_id: '',
  libelle: '',
  niveau: 1,
  effectif_prevu: '',
};

const STATUTS_FIGES = ['transmise', 'certifiee', 'cloturee'];
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState([]);
  const [annees, setAnnees] = useState([]);
  const [filieres, setFilieres] = useState([]);
  const [mode, setMode] = useState('simple');
  const [filtres, setFiltres] = useState({ annee_id: '', filiere_id: '', statut: '' });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  // Création
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [form, setForm] = useState(PROMOTION_VIDE);
  const [sessions, setSessions] = useState([]);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  // Étudiants
  const [promotionOuverte, setPromotionOuverte] = useState(null);
  const [inscriptions, setInscriptions] = useState([]);
  const [candidats, setCandidats] = useState([]);
  const [candidatAAjouter, setCandidatAAjouter] = useState('');
  const [erreurEtudiants, setErreurEtudiants] = useState('');
  const [resultatEnCours, setResultatEnCours] = useState(null);

  // Import
  const [importCible, setImportCible] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [erreurImport, setErreurImport] = useState('');
  const [importEnCours, setImportEnCours] = useState(false);

  // Pièces justificatives
  const [piecesEtudiant, setPiecesEtudiant] = useState(null);
  const [piecesPromotion, setPiecesPromotion] = useState(null);

  // Transmission
  const [transmission, setTransmission] = useState(null);
  const [dateDeliberation, setDateDeliberation] = useState(aujourdhui());
  const [erreurTransmission, setErreurTransmission] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const filiereChoisie = useMemo(
    () => filieres.find((f) => f.id === form.filiere_id),
    [filieres, form.filiere_id]
  );

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setPromotions(await listerPromotions(filtres));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [a, f, p] = await Promise.all([
          listerAnnees(),
          listerFilieres({ statut: 'active' }),
          monProfil().catch(() => null),
        ]);
        setAnnees(a);
        setFilieres(f);
        if (p?.mode_workflow) setMode(p.mode_workflow);
      } catch (err) {
        setErreur(messageErreur(err));
      }
    })();
  }, []);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres]);

  // Les sessions dépendent de l'année : le serveur refuse une session
  // rattachée à une autre année, autant ne proposer que les bonnes.
  useEffect(() => {
    if (!form.annee_id) {
      setSessions([]);
      return;
    }
    listerSessions(form.annee_id)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [form.annee_id]);

  function ouvrirCreation() {
    const anneeOuverte = annees.find((a) => a.statut === 'ouverte');
    setForm({ ...PROMOTION_VIDE, annee_id: anneeOuverte?.id || '' });
    setErreurForm('');
    setModaleOuverte(true);
  }

  async function soumettre(e) {
    e.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      await creerPromotion({
        ...form,
        session_id: form.session_id || undefined,
        effectif_prevu: form.effectif_prevu === '' ? undefined : form.effectif_prevu,
      });
      setModaleOuverte(false);
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function appliquerStatut(promotion, statut) {
    setErreur('');
    setSucces('');
    try {
      await changerStatutPromotion(promotion.id, statut);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function retirer(promotion) {
    if (!window.confirm(`Supprimer la promotion « ${promotion.libelle} » ?`)) return;
    setErreur('');
    try {
      await supprimerPromotion(promotion.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  // ── Étudiants d'une promotion ─────────────────────────────────
  async function ouvrirEtudiants(promotion) {
    setPromotionOuverte(promotion);
    setErreurEtudiants('');
    setCandidatAAjouter('');
    setResultatEnCours(null);
    setInscriptions([]);
    try {
      const [ins, cands] = await Promise.all([listerInscriptions(promotion.id), listerCandidats()]);
      setInscriptions(ins);
      setCandidats(cands);
    } catch (err) {
      setErreurEtudiants(messageErreur(err));
    }
  }

  async function rafraichirInscriptions() {
    setInscriptions(await listerInscriptions(promotionOuverte.id));
    await charger();
  }

  async function ajouterEtudiant(e) {
    e.preventDefault();
    setErreurEtudiants('');
    try {
      await inscrireEtudiant(promotionOuverte.id, candidatAAjouter);
      setCandidatAAjouter('');
      await rafraichirInscriptions();
    } catch (err) {
      setErreurEtudiants(messageErreur(err));
    }
  }

  async function retirerEtudiant(inscription) {
    setErreurEtudiants('');
    try {
      await desinscrireEtudiant(promotionOuverte.id, inscription.id);
      await rafraichirInscriptions();
    } catch (err) {
      setErreurEtudiants(messageErreur(err));
    }
  }

  async function soumettreResultat(e) {
    e.preventDefault();
    setErreurEtudiants('');
    try {
      await enregistrerResultat(promotionOuverte.id, resultatEnCours.id, {
        statut: resultatEnCours.statut,
        moyenne: resultatEnCours.moyenne === '' ? undefined : resultatEnCours.moyenne,
        mention: resultatEnCours.mention || undefined,
      });
      setResultatEnCours(null);
      await rafraichirInscriptions();
    } catch (err) {
      setErreurEtudiants(messageErreur(err));
    }
  }

  // ── Import ────────────────────────────────────────────────────
  function ouvrirImport(promotion) {
    setImportCible(promotion);
    setFichier(null);
    setRapport(null);
    setErreurImport('');
  }

  function choisirFichier(e) {
    setFichier(e.target.files?.[0] || null);
    setRapport(null); // un nouveau fichier invalide le rapport précédent
    setErreurImport('');
  }

  async function simuler() {
    if (!fichier) return;
    setImportEnCours(true);
    setErreurImport('');
    try {
      setRapport(await simulerImport(importCible.id, fichier));
    } catch (err) {
      setErreurImport(messageErreur(err));
    } finally {
      setImportEnCours(false);
    }
  }

  async function confirmerImport() {
    setImportEnCours(true);
    setErreurImport('');
    setSucces('');
    try {
      const res = await executerImport(importCible.id, fichier);
      setImportCible(null);
      setSucces(`${res.valides ?? res.total} étudiant(s) importés et inscrits dans la promotion.`);
      await charger();
    } catch (err) {
      setErreurImport(messageErreur(err));
    } finally {
      setImportEnCours(false);
    }
  }

  // ── Transmission ──────────────────────────────────────────────
  async function ouvrirTransmission(promotion) {
    setErreurTransmission('');
    setDateDeliberation(promotion.date_deliberation?.slice(0, 10) || aujourdhui());
    setTransmission({ promotion, inscriptions: null });
    try {
      const ins = await listerInscriptions(promotion.id);
      setTransmission({ promotion, inscriptions: ins });
    } catch (err) {
      setErreurTransmission(messageErreur(err));
      setTransmission({ promotion, inscriptions: [] });
    }
  }

  async function confirmerTransmission(e) {
    e.preventDefault();
    setEnvoiEnCours(true);
    setErreurTransmission('');
    try {
      const res = await transmettrePromotion(transmission.promotion.id, {
        date_deliberation: dateDeliberation,
      });
      setTransmission(null);
      setSucces(
        `Lot ${res.lot?.reference || ''} transmis : ${res.dossiers_crees ?? res.lot?.effectif ?? 0} dossier(s) envoyés au ministère.`
      );
      await charger();
    } catch (err) {
      setErreurTransmission(messageErreur(err));
    } finally {
      setEnvoiEnCours(false);
    }
  }

  const promotionFigee = promotionOuverte && STATUTS_FIGES.includes(promotionOuverte.statut);
  const dejaInscrits = new Set(inscriptions.map((i) => i.candidat_id));
  const candidatsDisponibles = candidats.filter((c) => !dejaInscrits.has(c.id));
  const admisATransmettre = (transmission?.inscriptions || []).filter((i) => i.statut === 'admis');
  const nonAdmis = (transmission?.inscriptions || []).length - admisATransmettre.length;

  return (
    <div>
      <EnTetePage
        titre="Promotions"
        description="Une promotion regroupe les étudiants d'une filière pour une année ; c'est elle qui part au ministère."
        fil={[{ libelle: 'Scolarité' }, { libelle: 'Promotions' }]}
      >
        <Bouton
          icone="add"
          onClick={ouvrirCreation}
          disabled={filieres.length === 0 || annees.length === 0}
          title={
            filieres.length === 0
              ? "Créez d'abord une filière dans Structure"
              : annees.length === 0
                ? "Le ministère n'a ouvert aucune année académique"
                : undefined
          }
        >
          Nouvelle promotion
        </Bouton>
      </EnTetePage>

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}
      {succes && (
        <div className="mb-4">
          <Encart ton="succes">
            {succes}{' '}
            {succes.startsWith('Lot') && (
              <Link to="/lots" className="underline underline-offset-2">
                Suivre le lot
              </Link>
            )}
          </Encart>
        </div>
      )}

      {/* Un bouton grisé sans explication est une impasse : l'agent ne
          peut pas deviner que le blocage vient du ministère ou d'une
          filière manquante. On nomme le prérequis et on y renvoie. */}
      {annees.length === 0 && (
        <div className="mb-4">
          <Encart ton="alerte" titre="Aucune année académique ouverte">
            Une promotion se rattache toujours à une année académique, et c'est le{' '}
            <strong>ministère</strong> qui les ouvre. Tant qu'aucune année n'est ouverte, aucune
            promotion ne peut être créée — signalez-le à votre correspondant au ministère.
          </Encart>
        </div>
      )}

      {annees.length > 0 && filieres.length === 0 && (
        <div className="mb-4">
          <Encart ton="alerte" titre="Aucune filière active">
            Une promotion se rattache à une filière, qui elle-même dépend d'une faculté.{' '}
            <Link to="/structure" className="underline underline-offset-2">
              Créez votre structure
            </Link>{' '}
            avant de revenir ici.
          </Encart>
        </div>
      )}

      {mode === 'hierarchique' && (
        <div className="mb-4">
          <Encart ton="info" titre="Mode hiérarchique">
            Une promotion passe par un contrôle interne puis une validation avant d'être
            transmise. Seul le directeur peut lancer la transmission.
          </Encart>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Champ label="Année académique" htmlFor="f-annee">
          <Liste
            id="f-annee"
            vide="Toutes les années"
            value={filtres.annee_id}
            onChange={(e) => setFiltres((f) => ({ ...f, annee_id: e.target.value }))}
            options={annees.map((a) => ({ value: a.id, label: a.libelle }))}
          />
        </Champ>
        <Champ label="Filière" htmlFor="f-filiere">
          <Liste
            id="f-filiere"
            vide="Toutes les filières"
            value={filtres.filiere_id}
            onChange={(e) => setFiltres((f) => ({ ...f, filiere_id: e.target.value }))}
            options={filieres.map((f) => ({ value: f.id, label: f.nom }))}
          />
        </Champ>
        <Champ label="Statut" htmlFor="f-statut">
          <Liste
            id="f-statut"
            vide="Tous les statuts"
            value={filtres.statut}
            onChange={(e) => setFiltres((f) => ({ ...f, statut: e.target.value }))}
            options={OPTIONS_STATUT_PROMOTION}
          />
        </Champ>
      </div>

      <Tableau
        legende="Promotions de l'établissement"
        chargement={chargement}
        lignes={promotions}
        colonnes={[
          {
            cle: 'libelle',
            libelle: 'Promotion',
            rendu: (p) => (
              <span>
                <span className="font-medium">{p.libelle}</span>
                <span className="block text-xs text-gris-500">
                  {p.filiere_nom} — niveau {p.niveau}
                </span>
              </span>
            ),
          },
          { cle: 'annee_libelle', libelle: 'Année' },
          {
            cle: 'session_type',
            libelle: 'Session',
            rendu: (p) => (p.session_type ? LIBELLES_TYPE_SESSION[p.session_type] : '—'),
          },
          {
            cle: 'effectif',
            libelle: 'Effectif',
            alignement: 'droite',
            tabulaire: true,
            rendu: (p) => (
              <span>
                {p.effectif_inscrit}
                {p.effectif_prevu != null && (
                  <span className="text-gris-500"> / {p.effectif_prevu}</span>
                )}
              </span>
            ),
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (p) => (
              <Etiquette ton={TON_STATUT_PROMOTION[p.statut]}>
                {LIBELLES_STATUT_PROMOTION[p.statut]}
              </Etiquette>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (p) => (
              <span className="whitespace-nowrap">
                <Bouton variante="discret" onClick={() => ouvrirEtudiants(p)}>
                  Inscrire / noter ({p.effectif_inscrit})
                </Bouton>
                {['brouillon', 'ouverte'].includes(p.statut) && (
                  <Bouton variante="discret" className="ml-3" onClick={() => ouvrirImport(p)}>
                    Importer
                  </Bouton>
                )}
                <Bouton
                  variante="discret"
                  className="ml-3"
                  onClick={() => setPiecesPromotion(p)}
                >
                  Pièces
                </Bouton>
                {actionsPromotion(p.statut, mode).map((a) => (
                  <Bouton
                    key={a.statut}
                    variante="discret"
                    className="ml-3"
                    onClick={() => appliquerStatut(p, a.statut)}
                  >
                    {a.libelle}
                  </Bouton>
                ))}
                {transmissiblePromotion(p.statut, mode) && (
                  <Bouton
                    variante="discret"
                    className="ml-3 font-bold"
                    onClick={() => ouvrirTransmission(p)}
                  >
                    Transmettre
                  </Bouton>
                )}
                {p.statut === 'brouillon' && (
                  <Bouton
                    variante="discret"
                    className="ml-3 text-erreur hover:text-erreur"
                    onClick={() => retirer(p)}
                  >
                    Supprimer
                  </Bouton>
                )}
              </span>
            ),
          },
        ]}
        vide={
          <EtatVide
            icone="groups"
            titre="Aucune promotion"
            action={
              filieres.length > 0 && annees.length > 0 ? (
                <Bouton icone="add" onClick={ouvrirCreation}>
                  Créer une promotion
                </Bouton>
              ) : null
            }
          >
            {filieres.length === 0
              ? "Créez d'abord une filière dans Structure : une promotion s'y rattache."
              : "Créez une promotion pour y inscrire vos étudiants, saisir leurs résultats, puis la transmettre au ministère."}
          </EtatVide>
        }
      />

      {/* ── Création d'une promotion ── */}
      <Modale
        ouvert={modaleOuverte}
        titre="Nouvelle promotion"
        onFermer={() => setModaleOuverte(false)}
      >
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && <Encart ton="erreur">{erreurForm}</Encart>}

          <Champ label="Filière" htmlFor="p-filiere" requis>
            <Liste
              id="p-filiere"
              required
              value={form.filiere_id}
              onChange={(e) => setForm((f) => ({ ...f, filiere_id: e.target.value }))}
              options={filieres.map((f) => ({
                value: f.id,
                label: `${f.nom} (${f.duree_annees} an(s))`,
              }))}
            />
          </Champ>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Année académique" htmlFor="p-annee" requis>
              <Liste
                id="p-annee"
                required
                value={form.annee_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, annee_id: e.target.value, session_id: '' }))
                }
                options={annees
                  .filter((a) => a.statut !== 'cloturee')
                  .map((a) => ({ value: a.id, label: a.libelle }))}
              />
            </Champ>
            <Champ label="Session" htmlFor="p-session" aide="Modifiable plus tard.">
              <Liste
                id="p-session"
                vide="À définir plus tard"
                value={form.session_id}
                onChange={(e) => setForm((f) => ({ ...f, session_id: e.target.value }))}
                options={sessions.map((s) => ({
                  value: s.id,
                  label: `${LIBELLES_TYPE_SESSION[s.type]}${s.libelle ? ` — ${s.libelle}` : ''}`,
                }))}
              />
            </Champ>
          </div>

          <Champ label="Libellé" htmlFor="p-libelle" requis>
            <Saisie
              id="p-libelle"
              required
              placeholder="Licence 3 Génie Logiciel — 2024-2025"
              value={form.libelle}
              onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
            />
          </Champ>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              label="Niveau"
              htmlFor="p-niveau"
              requis
              aide={filiereChoisie ? `De 1 à ${filiereChoisie.duree_annees}.` : undefined}
            >
              <Saisie
                id="p-niveau"
                required
                type="number"
                min={1}
                max={filiereChoisie?.duree_annees || 8}
                value={form.niveau}
                onChange={(e) => setForm((f) => ({ ...f, niveau: e.target.value }))}
              />
            </Champ>
            <Champ label="Effectif prévu" htmlFor="p-effectif" aide="Indicatif.">
              <Saisie
                id="p-effectif"
                type="number"
                min={0}
                value={form.effectif_prevu}
                onChange={(e) => setForm((f) => ({ ...f, effectif_prevu: e.target.value }))}
              />
            </Champ>
          </div>

          <Encart ton="info">
            La promotion est créée en brouillon. Ouvrez-la pour y inscrire des étudiants et saisir
            leurs résultats avant toute transmission.
          </Encart>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Bouton>
            <Bouton type="submit" enCours={enregistrement}>
              Créer
            </Bouton>
          </div>
        </form>
      </Modale>

      {/* ── Étudiants de la promotion ── */}
      <Modale
        ouvert={Boolean(promotionOuverte)}
        titre={`Inscrire et noter — ${promotionOuverte?.libelle || ''}`}
        onFermer={() => setPromotionOuverte(null)}
        largeur="max-w-4xl"
      >
        {erreurEtudiants && (
          <div className="mb-4">
            <Encart ton="erreur">{erreurEtudiants}</Encart>
          </div>
        )}

        {promotionFigee && (
          <div className="mb-4">
            <Encart ton="info">
              Promotion {LIBELLES_STATUT_PROMOTION[promotionOuverte.statut].toLowerCase()} : sa
              composition ne peut plus changer.
            </Encart>
          </div>
        )}

        <Tableau
          legende="Étudiants inscrits"
          lignes={inscriptions}
          colonnes={[
            { cle: 'numero_etudiant', libelle: 'N° étudiant', tabulaire: true },
            { cle: 'etudiant', libelle: 'Étudiant', rendu: (i) => `${i.nom} ${i.prenom}` },
            {
              cle: 'statut',
              libelle: 'Statut',
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
            {
              cle: 'actions',
              libelle: 'Actions',
              alignement: 'droite',
              rendu: (i) => (
                <span className="whitespace-nowrap">
                  <Bouton
                    variante="discret"
                    onClick={() =>
                      setResultatEnCours({
                        id: i.id,
                        nom: `${i.nom} ${i.prenom}`,
                        statut: i.statut,
                        moyenne: i.moyenne ?? '',
                        mention: i.mention || '',
                      })
                    }
                  >
                    Résultat
                  </Bouton>
                  <Bouton
                    variante="discret"
                    className="ml-3"
                    onClick={() =>
                      setPiecesEtudiant({
                        candidat_id: i.candidat_id,
                        nom: `${i.nom} ${i.prenom}`,
                      })
                    }
                  >
                    Pièces
                  </Bouton>
                  {!promotionFigee && (
                    <Bouton
                      variante="discret"
                      className="ml-3 text-erreur hover:text-erreur"
                      onClick={() => retirerEtudiant(i)}
                    >
                      Retirer
                    </Bouton>
                  )}
                </span>
              ),
            },
          ]}
          vide={
            <EtatVide icone="person_add" titre="Aucun étudiant inscrit">
              Inscrivez les étudiants de votre fichier ci-dessous, ou importez-les en masse depuis
              l'écran Étudiants.
            </EtatVide>
          }
        />

        {!promotionFigee && (
          <form
            onSubmit={ajouterEtudiant}
            className="mt-5 flex flex-wrap items-end gap-2 border-t border-gris-200 pt-5"
          >
            <div className="min-w-[16rem] flex-1">
              <Champ label="Inscrire un étudiant" htmlFor="ajout-etudiant">
                <Liste
                  id="ajout-etudiant"
                  required
                  value={candidatAAjouter}
                  onChange={(e) => setCandidatAAjouter(e.target.value)}
                  options={candidatsDisponibles.map((c) => ({
                    value: c.id,
                    label: `${c.numero_etudiant} — ${c.nom} ${c.prenom}`,
                  }))}
                />
              </Champ>
            </div>
            <Bouton type="submit" icone="add">
              Inscrire
            </Bouton>
          </form>
        )}
      </Modale>

      {/* ── Saisie d'un résultat ── */}
      <Modale
        ouvert={Boolean(resultatEnCours)}
        titre={`Résultat — ${resultatEnCours?.nom || ''}`}
        onFermer={() => setResultatEnCours(null)}
      >
        {resultatEnCours && (
          <form onSubmit={soumettreResultat} className="space-y-4">
            <Champ
              label="Statut"
              htmlFor="r-statut"
              requis
              aide="Seuls les étudiants admis génèrent un dossier à la transmission."
            >
              <Liste
                id="r-statut"
                vide={null}
                value={resultatEnCours.statut}
                onChange={(e) =>
                  setResultatEnCours((r) => ({
                    ...r,
                    statut: e.target.value,
                    // Une mention n'a de sens que pour un admis.
                    mention: e.target.value === 'admis' ? r.mention : '',
                  }))
                }
                options={OPTIONS_STATUT_INSCRIPTION}
              />
            </Champ>

            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Moyenne" htmlFor="r-moyenne" aide="De 0 à 20.">
                <Saisie
                  id="r-moyenne"
                  type="number"
                  min={0}
                  max={20}
                  step="0.01"
                  value={resultatEnCours.moyenne}
                  onChange={(e) => setResultatEnCours((r) => ({ ...r, moyenne: e.target.value }))}
                />
              </Champ>
              <Champ
                label="Mention"
                htmlFor="r-mention"
                aide={
                  resultatEnCours.statut !== 'admis'
                    ? 'Réservée aux étudiants admis.'
                    : undefined
                }
              >
                <Liste
                  id="r-mention"
                  disabled={resultatEnCours.statut !== 'admis'}
                  value={resultatEnCours.mention}
                  onChange={(e) => setResultatEnCours((r) => ({ ...r, mention: e.target.value }))}
                  options={OPTIONS_MENTION}
                />
              </Champ>
            </div>

            <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
              <Bouton variante="neutre" onClick={() => setResultatEnCours(null)}>
                Annuler
              </Bouton>
              <Bouton type="submit">Enregistrer</Bouton>
            </div>
          </form>
        )}
      </Modale>

      {/* ── Import d'un fichier ──
          Simulation obligatoire avant écriture : l'agent voit ce qui va se
          passer, ligne par ligne, avant que quoi que ce soit ne soit créé. */}
      <Modale
        ouvert={Boolean(importCible)}
        titre={`Importer des étudiants — ${importCible?.libelle || ''}`}
        onFermer={() => setImportCible(null)}
        largeur="max-w-3xl"
      >
        <div className="space-y-4">
          {erreurImport && <Encart ton="erreur">{erreurImport}</Encart>}

          <Encart ton="info" titre="Deux étapes">
            La <strong>vérification</strong> ne touche à rien : elle liste les anomalies avec leur
            numéro de ligne. L'<strong>import</strong> n'est possible qu'une fois le fichier
            vierge d'erreur — une seule ligne fautive annule tout.
          </Encart>

          <div>
            <Bouton variante="secondaire" icone="download" onClick={telechargerModeleImport}>
              Télécharger le modèle Excel
            </Bouton>
            <p className="mt-1 text-sm text-gris-500">
              Les en-têtes sont tolérants aux accents et à la casse, mais partir du modèle évite
              la moitié des rejets.
            </p>
          </div>

          <Champ
            label="Fichier"
            htmlFor="import-fichier"
            requis
            aide="Classeur .xlsx ou fichier .csv, 5 Mo au plus."
          >
            <input
              id="import-fichier"
              type="file"
              accept=".xlsx,.csv"
              onChange={choisirFichier}
              className="w-full rounded border border-gris-500 bg-white px-3 py-2 text-base file:mr-3 file:rounded file:border-0 file:bg-gris-100 file:px-3 file:py-1 file:text-sm"
            />
          </Champ>

          {rapport && (
            <div className="border border-gris-300 bg-white p-4">
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <Chiffre libelle="Lignes lues" valeur={rapport.total} />
                <Chiffre libelle="Prêtes à importer" valeur={rapport.valides} ton="vert" />
                <Chiffre
                  libelle="En erreur"
                  valeur={rapport.erreurs.length}
                  ton={rapport.erreurs.length > 0 ? 'erreur' : 'neutre'}
                />
              </div>

              {rapport.erreurs.length > 0 ? (
                <>
                  <p className="mb-2 text-sm font-bold text-gris-700">
                    Corrigez ces lignes dans votre fichier, puis relancez la vérification :
                  </p>
                  <ul className="max-h-64 space-y-1 overflow-y-auto border border-gris-200 bg-gris-50 p-3 text-sm">
                    {rapport.erreurs.map((e) => (
                      <li key={e.ligne}>
                        <span className="tabulaire font-bold">Ligne {e.ligne}</span> —{' '}
                        <span className="text-erreur">{e.erreurs.join(' ; ')}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <Encart ton="succes" titre="Fichier conforme">
                    Aucune anomalie détectée. L'import peut être exécuté.
                  </Encart>
                  {rapport.apercu?.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 text-sm font-bold text-gris-700">
                        Aperçu des premières lignes :
                      </p>
                      <Tableau
                        legende="Aperçu de l'import"
                        lignes={rapport.apercu}
                        cle={(l) => l.ligne}
                        colonnes={[
                          { cle: 'ligne', libelle: 'Ligne', tabulaire: true },
                          { cle: 'numero_etudiant', libelle: 'N° étudiant', tabulaire: true },
                          { cle: 'nom', libelle: 'Nom' },
                          { cle: 'prenom', libelle: 'Prénom' },
                          {
                            cle: 'telephone',
                            libelle: 'Téléphone',
                            tabulaire: true,
                            rendu: (l) => l.telephone || '—',
                          },
                          {
                            cle: 'mention',
                            libelle: 'Mention',
                            rendu: (l) => (l.mention ? LIBELLES_MENTION[l.mention] : '—'),
                          },
                        ]}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setImportCible(null)}>
              Fermer
            </Bouton>
            <Bouton
              variante="secondaire"
              icone="fact_check"
              onClick={simuler}
              disabled={!fichier}
              enCours={importEnCours && !rapport}
            >
              Vérifier le fichier
            </Bouton>
            <Bouton
              icone="upload"
              onClick={confirmerImport}
              disabled={!rapport || rapport.erreurs.length > 0}
              enCours={importEnCours && Boolean(rapport)}
            >
              Importer {rapport ? `${rapport.valides} étudiant(s)` : ''}
            </Bouton>
          </div>
        </div>
      </Modale>

      {/* ── Transmission au ministère ── */}
      <Modale
        ouvert={Boolean(transmission)}
        titre={`Transmettre — ${transmission?.promotion?.libelle || ''}`}
        onFermer={() => setTransmission(null)}
      >
        <form onSubmit={confirmerTransmission} className="space-y-4">
          {erreurTransmission && <Encart ton="erreur">{erreurTransmission}</Encart>}

          {transmission?.inscriptions === null ? (
            <p className="text-base text-gris-500">Décompte des étudiants…</p>
          ) : (
            <>
              <Encart
                ton={admisATransmettre.length === 0 ? 'alerte' : 'info'}
                titre={`${admisATransmettre.length} dossier(s) seront créés`}
              >
                Seuls les étudiants <strong>admis</strong> partent au ministère.
                {nonAdmis > 0 && (
                  <> {nonAdmis} étudiant(s) non admis resteront dans la promotion sans dossier.</>
                )}
                {admisATransmettre.length === 0 && (
                  <> Saisissez d'abord les résultats depuis « Étudiants ».</>
                )}
              </Encart>

              <Champ
                label="Date de délibération"
                htmlFor="t-deliberation"
                requis
                aide="Date à laquelle le jury a arrêté les résultats. Elle figure sur les diplômes."
              >
                <Saisie
                  id="t-deliberation"
                  type="date"
                  required
                  max={aujourdhui()}
                  value={dateDeliberation}
                  onChange={(e) => setDateDeliberation(e.target.value)}
                />
              </Champ>

              <p className="flex items-start gap-1.5 text-sm text-gris-500">
                <Icone nom="lock" taille={16} className="mt-0.5 shrink-0" />
                Après transmission, la composition de la promotion est figée. Le ministère peut
                renvoyer certains dossiers ; les autres poursuivent leur instruction.
              </p>
            </>
          )}

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setTransmission(null)}>
              Annuler
            </Bouton>
            <Bouton
              type="submit"
              enCours={envoiEnCours}
              disabled={!transmission?.inscriptions || admisATransmettre.length === 0}
            >
              Transmettre au ministère
            </Bouton>
          </div>
        </form>
      </Modale>

      {/* ── Pièces d'un étudiant ── */}
      <Modale
        ouvert={Boolean(piecesEtudiant)}
        titre={`Pièces justificatives — ${piecesEtudiant?.nom || ''}`}
        onFermer={() => setPiecesEtudiant(null)}
        largeur="max-w-3xl"
      >
        <PiecesJointes
          portee="candidat"
          cibleId={piecesEtudiant?.candidat_id}
          aide="Ces documents sont ceux que le ministère ouvrira pour instruire le dossier. Le relevé de notes est obligatoire ; le rapport de stage et les autres pièces le complètent."
        />
      </Modale>

      {/* ── Pièces de la promotion ── */}
      <Modale
        ouvert={Boolean(piecesPromotion)}
        titre={`Actes de la promotion — ${piecesPromotion?.libelle || ''}`}
        onFermer={() => setPiecesPromotion(null)}
        largeur="max-w-3xl"
      >
        <PiecesJointes
          portee="promotion"
          cibleId={piecesPromotion?.id}
          aide="Le procès-verbal de délibération vaut pour la promotion entière : il se dépose une fois, pas une fois par étudiant. Sans lui, le ministère ne peut pas valider le lot."
        />
      </Modale>
    </div>
  );
}
