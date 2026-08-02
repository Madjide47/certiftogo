// ─────────────────────────────────────────────────────────────
// Promotions de l'établissement : cohortes, inscriptions, résultats.
//
// La promotion est l'unité de transmission au ministère. Son cycle de vie
// est arbitré par le serveur ; l'écran n'affiche que les actions plausibles
// et restitue le refus quand une règle métier s'y oppose.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { INPUT, BTN_PRIMARY, BTN_GHOST, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
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
import { listerAnnees, listerSessions } from '../../services/referentiel.service.js';
import { listerFilieres } from '../../services/structure.service.js';
import { listerCandidats } from '../../services/candidat.service.js';
import {
  LIBELLES_STATUT_PROMOTION,
  BADGE_STATUT_PROMOTION,
  ACTIONS_PROMOTION,
  LIBELLES_STATUT_INSCRIPTION,
  BADGE_STATUT_INSCRIPTION,
  OPTIONS_STATUT_INSCRIPTION,
  LIBELLES_TYPE_SESSION,
  LIBELLES_MENTION,
  OPTIONS_MENTION,
  messageErreur,
} from '../../utils/libelles.js';

const PROMOTION_VIDE = {
  filiere_id: '',
  annee_id: '',
  session_id: '',
  libelle: '',
  niveau: 1,
  effectif_prevu: '',
};

const STATUTS_FIGES = ['transmise', 'certifiee', 'cloturee'];

function Champ({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState([]);
  const [annees, setAnnees] = useState([]);
  const [filieres, setFilieres] = useState([]);
  const [filtres, setFiltres] = useState({ annee_id: '', filiere_id: '', statut: '' });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  // Création
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [form, setForm] = useState(PROMOTION_VIDE);
  const [sessions, setSessions] = useState([]);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  // Panneau des étudiants
  const [promotionOuverte, setPromotionOuverte] = useState(null);
  const [inscriptions, setInscriptions] = useState([]);
  const [candidats, setCandidats] = useState([]);
  const [candidatAAjouter, setCandidatAAjouter] = useState('');
  const [erreurEtudiants, setErreurEtudiants] = useState('');
  const [resultatEnCours, setResultatEnCours] = useState(null);

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
        const [a, f] = await Promise.all([listerAnnees(), listerFilieres({ statut: 'active' })]);
        setAnnees(a);
        setFilieres(f);
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
    (async () => {
      try {
        setSessions(await listerSessions(form.annee_id));
      } catch {
        setSessions([]);
      }
    })();
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

  const promotionFigee = promotionOuverte && STATUTS_FIGES.includes(promotionOuverte.statut);
  const dejaInscrits = new Set(inscriptions.map((i) => i.candidat_id));
  const candidatsDisponibles = candidats.filter((c) => !dejaInscrits.has(c.id));

  return (
    <div>
      <PageHeader titre="Promotions" sous={`${promotions.length} promotion(s)`}>
        <button
          onClick={ouvrirCreation}
          disabled={filieres.length === 0 || annees.length === 0}
          className={BTN_PRIMARY}
          title={
            filieres.length === 0
              ? 'Créez d\'abord une filière dans Structure'
              : annees.length === 0
                ? 'Le ministère n\'a ouvert aucune année académique'
                : undefined
          }
        >
          <Icon name="add" size={20} /> Nouvelle promotion
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filtres.annee_id}
          onChange={(e) => setFiltres((f) => ({ ...f, annee_id: e.target.value }))}
          className={`${INPUT} mt-0 w-auto`}
        >
          <option value="">Toutes les années</option>
          {annees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.libelle}
            </option>
          ))}
        </select>
        <select
          value={filtres.filiere_id}
          onChange={(e) => setFiltres((f) => ({ ...f, filiere_id: e.target.value }))}
          className={`${INPUT} mt-0 w-auto`}
        >
          <option value="">Toutes les filières</option>
          {filieres.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nom}
            </option>
          ))}
        </select>
        <select
          value={filtres.statut}
          onChange={(e) => setFiltres((f) => ({ ...f, statut: e.target.value }))}
          className={`${INPUT} mt-0 w-auto`}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(LIBELLES_STATUT_PROMOTION).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      <div className={TABLE_WRAP}>
        <table className="w-full">
          <thead className="bg-surface-container-low/60">
            <tr>
              <th className={TH}>Promotion</th>
              <th className={TH}>Filière</th>
              <th className={TH}>Niveau</th>
              <th className={TH}>Année</th>
              <th className={TH}>Session</th>
              <th className={TH}>Effectif</th>
              <th className={TH}>Statut</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-on-surface-variant">
                  Chargement…
                </td>
              </tr>
            ) : promotions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucune promotion. Créez-en une pour regrouper vos étudiants avant
                  transmission au ministère.
                </td>
              </tr>
            ) : (
              promotions.map((p) => (
                <tr key={p.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>{p.libelle}</td>
                  <td className={`${TD} text-on-surface-variant`}>{p.filiere_nom}</td>
                  <td className={TD}>{p.niveau}</td>
                  <td className={`${TD} text-on-surface-variant`}>{p.annee_libelle}</td>
                  <td className={`${TD} text-on-surface-variant`}>
                    {p.session_type ? LIBELLES_TYPE_SESSION[p.session_type] : '—'}
                  </td>
                  <td className={TD}>
                    {p.effectif_inscrit}
                    {p.effectif_prevu != null && (
                      <span className="text-on-surface-variant"> / {p.effectif_prevu}</span>
                    )}
                  </td>
                  <td className={TD}>
                    <Badge className={BADGE_STATUT_PROMOTION[p.statut]}>
                      {LIBELLES_STATUT_PROMOTION[p.statut]}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <button
                      onClick={() => ouvrirEtudiants(p)}
                      className={`${ACT} text-primary hover:bg-primary-container/10`}
                    >
                      Étudiants
                    </button>
                    {(ACTIONS_PROMOTION[p.statut] || []).map((a) => (
                      <button
                        key={a.statut}
                        onClick={() => appliquerStatut(p, a.statut)}
                        className={`${ACT} ml-1 text-emerald-700 hover:bg-emerald-50`}
                      >
                        {a.libelle}
                      </button>
                    ))}
                    {p.statut === 'brouillon' && (
                      <button
                        onClick={() => retirer(p)}
                        className={`${ACT} ml-1 text-error hover:bg-error-container/50`}
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Création d'une promotion ── */}
      <Modal ouvert={modaleOuverte} titre="Nouvelle promotion" onFermer={() => setModaleOuverte(false)}>
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurForm}
            </div>
          )}
          <Champ label="Filière *">
            <select
              required
              value={form.filiere_id}
              onChange={(e) => setForm((f) => ({ ...f, filiere_id: e.target.value }))}
              className={INPUT}
            >
              <option value="">—</option>
              {filieres.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom} ({f.duree_annees} an(s))
                </option>
              ))}
            </select>
          </Champ>
          <div className="grid grid-cols-2 gap-4">
            <Champ label="Année académique *">
              <select
                required
                value={form.annee_id}
                onChange={(e) => setForm((f) => ({ ...f, annee_id: e.target.value, session_id: '' }))}
                className={INPUT}
              >
                <option value="">—</option>
                {annees
                  .filter((a) => a.statut !== 'cloturee')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.libelle}
                    </option>
                  ))}
              </select>
            </Champ>
            <Champ label="Session">
              <select
                value={form.session_id}
                onChange={(e) => setForm((f) => ({ ...f, session_id: e.target.value }))}
                className={INPUT}
              >
                <option value="">À définir plus tard</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {LIBELLES_TYPE_SESSION[s.type]}
                    {s.libelle ? ` — ${s.libelle}` : ''}
                  </option>
                ))}
              </select>
            </Champ>
          </div>
          <Champ label="Libellé *">
            <input
              required
              placeholder="Licence 3 Génie Logiciel — 2024-2025"
              value={form.libelle}
              onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
              className={INPUT}
            />
          </Champ>
          <div className="grid grid-cols-2 gap-4">
            <Champ
              label={`Niveau *${filiereChoisie ? ` (1 à ${filiereChoisie.duree_annees})` : ''}`}
            >
              <input
                required
                type="number"
                min={1}
                max={filiereChoisie?.duree_annees || 8}
                value={form.niveau}
                onChange={(e) => setForm((f) => ({ ...f, niveau: e.target.value }))}
                className={INPUT}
              />
            </Champ>
            <Champ label="Effectif prévu">
              <input
                type="number"
                min={0}
                value={form.effectif_prevu}
                onChange={(e) => setForm((f) => ({ ...f, effectif_prevu: e.target.value }))}
                className={INPUT}
              />
            </Champ>
          </div>
          <p className="text-xs text-on-surface-variant">
            La promotion est créée en brouillon. Ouvrez-la pour y inscrire des étudiants,
            puis transmettez-la au ministère.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModaleOuverte(false)} className={BTN_GHOST}>
              Annuler
            </button>
            <button type="submit" disabled={enregistrement} className={BTN_PRIMARY}>
              {enregistrement ? 'Enregistrement…' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Étudiants de la promotion ── */}
      <Modal
        ouvert={Boolean(promotionOuverte)}
        titre={`Étudiants — ${promotionOuverte?.libelle || ''}`}
        onFermer={() => setPromotionOuverte(null)}
        largeur="max-w-3xl"
      >
        {erreurEtudiants && (
          <div className="mb-4 rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
            {erreurEtudiants}
          </div>
        )}

        {promotionFigee && (
          <div className="mb-4 rounded-lg bg-surface-container-low px-4 py-2.5 text-sm text-on-surface-variant">
            Promotion {LIBELLES_STATUT_PROMOTION[promotionOuverte.statut].toLowerCase()} : sa
            composition ne peut plus changer.
          </div>
        )}

        {inscriptions.length === 0 ? (
          <p className="mb-5 text-sm text-on-surface-variant">Aucun étudiant inscrit.</p>
        ) : (
          <div className={`${TABLE_WRAP} mb-5`}>
            <table className="w-full">
              <thead className="bg-surface-container-low/60">
                <tr>
                  <th className={TH}>N° étudiant</th>
                  <th className={TH}>Étudiant</th>
                  <th className={TH}>Statut</th>
                  <th className={TH}>Moyenne</th>
                  <th className={TH}>Mention</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inscriptions.map((i) => (
                  <tr key={i.id} className={ROW}>
                    <td className={`${TD} font-semibold`}>{i.numero_etudiant}</td>
                    <td className={TD}>
                      {i.nom} {i.prenom}
                    </td>
                    <td className={TD}>
                      <Badge className={BADGE_STATUT_INSCRIPTION[i.statut]}>
                        {LIBELLES_STATUT_INSCRIPTION[i.statut]}
                      </Badge>
                    </td>
                    <td className={`${TD} text-on-surface-variant`}>{i.moyenne ?? '—'}</td>
                    <td className={`${TD} text-on-surface-variant`}>
                      {i.mention ? LIBELLES_MENTION[i.mention] : '—'}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <button
                        onClick={() =>
                          setResultatEnCours({
                            id: i.id,
                            nom: `${i.nom} ${i.prenom}`,
                            statut: i.statut,
                            moyenne: i.moyenne ?? '',
                            mention: i.mention || '',
                          })
                        }
                        className={`${ACT} text-primary hover:bg-primary-container/10`}
                      >
                        Résultat
                      </button>
                      {!promotionFigee && (
                        <button
                          onClick={() => retirerEtudiant(i)}
                          className={`${ACT} ml-1 text-error hover:bg-error-container/50`}
                        >
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!promotionFigee && (
          <form
            onSubmit={ajouterEtudiant}
            className="flex flex-wrap items-end gap-2 border-t border-outline-variant/25 pt-5"
          >
            <div className="min-w-[16rem] flex-1">
              <Champ label="Inscrire un étudiant">
                <select
                  required
                  value={candidatAAjouter}
                  onChange={(e) => setCandidatAAjouter(e.target.value)}
                  className={INPUT}
                >
                  <option value="">—</option>
                  {candidatsDisponibles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero_etudiant} — {c.nom} {c.prenom}
                    </option>
                  ))}
                </select>
              </Champ>
            </div>
            <button type="submit" className={BTN_PRIMARY}>
              <Icon name="add" size={20} /> Inscrire
            </button>
          </form>
        )}
      </Modal>

      {/* ── Saisie d'un résultat ── */}
      <Modal
        ouvert={Boolean(resultatEnCours)}
        titre={`Résultat — ${resultatEnCours?.nom || ''}`}
        onFermer={() => setResultatEnCours(null)}
      >
        {resultatEnCours && (
          <form onSubmit={soumettreResultat} className="space-y-4">
            <Champ label="Statut *">
              <select
                value={resultatEnCours.statut}
                onChange={(e) =>
                  setResultatEnCours((r) => ({
                    ...r,
                    statut: e.target.value,
                    // Une mention n'a de sens que pour un admis.
                    mention: e.target.value === 'admis' ? r.mention : '',
                  }))
                }
                className={INPUT}
              >
                {OPTIONS_STATUT_INSCRIPTION.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Champ>
            <div className="grid grid-cols-2 gap-4">
              <Champ label="Moyenne (0 à 20)">
                <input
                  type="number"
                  min={0}
                  max={20}
                  step="0.01"
                  value={resultatEnCours.moyenne}
                  onChange={(e) => setResultatEnCours((r) => ({ ...r, moyenne: e.target.value }))}
                  className={INPUT}
                />
              </Champ>
              <Champ label="Mention">
                <select
                  disabled={resultatEnCours.statut !== 'admis'}
                  value={resultatEnCours.mention}
                  onChange={(e) => setResultatEnCours((r) => ({ ...r, mention: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">—</option>
                  {OPTIONS_MENTION.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Champ>
            </div>
            {resultatEnCours.statut !== 'admis' && (
              <p className="text-xs text-on-surface-variant">
                La mention est réservée aux étudiants admis.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setResultatEnCours(null)} className={BTN_GHOST}>
                Annuler
              </button>
              <button type="submit" className={BTN_PRIMARY}>
                Enregistrer
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
