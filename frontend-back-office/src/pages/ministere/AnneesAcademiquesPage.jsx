// ─────────────────────────────────────────────────────────────
// Référentiel national (ministère) : années académiques et sessions.
// Une seule année peut être ouverte à la fois — le serveur le garantit,
// l'écran se contente d'expliquer le refus.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { INPUT, BTN_PRIMARY, BTN_GHOST, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
import {
  listerAnnees,
  creerAnnee,
  changerStatutAnnee,
  supprimerAnnee,
  listerSessions,
  creerSession,
  changerStatutSession,
  supprimerSession,
} from '../../services/referentiel.service.js';
import {
  LIBELLES_STATUT_ANNEE,
  BADGE_STATUT_ANNEE,
  LIBELLES_TYPE_SESSION,
  OPTIONS_TYPE_SESSION,
  messageErreur,
} from '../../utils/libelles.js';

const ANNEE_VIDE = { libelle: '', date_debut: '', date_fin: '' };
const SESSION_VIDE = { type: 'normale', libelle: '', date_debut: '', date_fin: '' };

function Champ({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

const dateCourte = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function AnneesAcademiquesPage() {
  const [annees, setAnnees] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const [modaleAnnee, setModaleAnnee] = useState(false);
  const [formAnnee, setFormAnnee] = useState(ANNEE_VIDE);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  // Panneau des sessions de l'année sélectionnée.
  const [anneeSessions, setAnneeSessions] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [formSession, setFormSession] = useState(SESSION_VIDE);
  const [erreurSession, setErreurSession] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setAnnees(await listerAnnees());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function soumettreAnnee(e) {
    e.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      await creerAnnee(formAnnee);
      setModaleAnnee(false);
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function basculerStatut(annee, statut) {
    setErreur('');
    try {
      await changerStatutAnnee(annee.id, statut);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function retirerAnnee(annee) {
    if (!window.confirm(`Supprimer l'année ${annee.libelle} ?`)) return;
    setErreur('');
    try {
      await supprimerAnnee(annee.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function ouvrirSessions(annee) {
    setAnneeSessions(annee);
    setFormSession(SESSION_VIDE);
    setErreurSession('');
    setSessions([]);
    try {
      setSessions(await listerSessions(annee.id));
    } catch (err) {
      setErreurSession(messageErreur(err));
    }
  }

  async function ajouterSession(e) {
    e.preventDefault();
    setErreurSession('');
    try {
      await creerSession(anneeSessions.id, formSession);
      setFormSession(SESSION_VIDE);
      setSessions(await listerSessions(anneeSessions.id));
    } catch (err) {
      setErreurSession(messageErreur(err));
    }
  }

  async function actionSession(session, action) {
    setErreurSession('');
    try {
      if (action === 'supprimer') await supprimerSession(session.id);
      else await changerStatutSession(session.id, action);
      setSessions(await listerSessions(anneeSessions.id));
    } catch (err) {
      setErreurSession(messageErreur(err));
    }
  }

  return (
    <div>
      <PageHeader
        titre="Années académiques"
        sous="Référentiel national — une seule année peut être ouverte à la fois"
      >
        <button
          onClick={() => {
            setFormAnnee(ANNEE_VIDE);
            setErreurForm('');
            setModaleAnnee(true);
          }}
          className={BTN_PRIMARY}
        >
          <Icon name="add" size={20} /> Nouvelle année
        </button>
      </PageHeader>

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      <div className={TABLE_WRAP}>
        <table className="w-full">
          <thead className="bg-surface-container-low/60">
            <tr>
              <th className={TH}>Année</th>
              <th className={TH}>Début</th>
              <th className={TH}>Fin</th>
              <th className={TH}>Statut</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                  Chargement…
                </td>
              </tr>
            ) : annees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucune année académique. Créez-en une pour permettre aux établissements
                  d'y rattacher leurs promotions.
                </td>
              </tr>
            ) : (
              annees.map((a) => (
                <tr key={a.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>{a.libelle}</td>
                  <td className={`${TD} text-on-surface-variant`}>{dateCourte(a.date_debut)}</td>
                  <td className={`${TD} text-on-surface-variant`}>{dateCourte(a.date_fin)}</td>
                  <td className={TD}>
                    <Badge className={BADGE_STATUT_ANNEE[a.statut]}>
                      {LIBELLES_STATUT_ANNEE[a.statut]}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <button
                      onClick={() => ouvrirSessions(a)}
                      className={`${ACT} text-primary hover:bg-primary-container/10`}
                    >
                      Sessions
                    </button>
                    {a.statut === 'preparation' && (
                      <button
                        onClick={() => basculerStatut(a, 'ouverte')}
                        className={`${ACT} ml-1 text-emerald-700 hover:bg-emerald-50`}
                      >
                        Ouvrir
                      </button>
                    )}
                    {a.statut === 'ouverte' && (
                      <button
                        onClick={() => basculerStatut(a, 'cloturee')}
                        className={`${ACT} ml-1 text-amber-700 hover:bg-amber-50`}
                      >
                        Clôturer
                      </button>
                    )}
                    <button
                      onClick={() => retirerAnnee(a)}
                      className={`${ACT} ml-1 text-error hover:bg-error-container/50`}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Création d'une année ── */}
      <Modal ouvert={modaleAnnee} titre="Nouvelle année académique" onFermer={() => setModaleAnnee(false)}>
        <form onSubmit={soumettreAnnee} className="space-y-4">
          {erreurForm && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurForm}
            </div>
          )}
          <Champ label="Libellé * (format AAAA-AAAA)">
            <input
              required
              placeholder="2025-2026"
              value={formAnnee.libelle}
              onChange={(e) => setFormAnnee((f) => ({ ...f, libelle: e.target.value }))}
              className={INPUT}
            />
          </Champ>
          <div className="grid grid-cols-2 gap-4">
            <Champ label="Date de début *">
              <input
                required
                type="date"
                value={formAnnee.date_debut}
                onChange={(e) => setFormAnnee((f) => ({ ...f, date_debut: e.target.value }))}
                className={INPUT}
              />
            </Champ>
            <Champ label="Date de fin *">
              <input
                required
                type="date"
                value={formAnnee.date_fin}
                onChange={(e) => setFormAnnee((f) => ({ ...f, date_fin: e.target.value }))}
                className={INPUT}
              />
            </Champ>
          </div>
          <p className="text-xs text-on-surface-variant">
            L'année est créée « en préparation ». Ouvrez-la ensuite pour que les établissements
            puissent y rattacher leurs promotions.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModaleAnnee(false)} className={BTN_GHOST}>
              Annuler
            </button>
            <button type="submit" disabled={enregistrement} className={BTN_PRIMARY}>
              {enregistrement ? 'Enregistrement…' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Sessions de l'année ── */}
      <Modal
        ouvert={Boolean(anneeSessions)}
        titre={`Sessions — ${anneeSessions?.libelle || ''}`}
        onFermer={() => setAnneeSessions(null)}
        largeur="max-w-2xl"
      >
        {erreurSession && (
          <div className="mb-4 rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
            {erreurSession}
          </div>
        )}

        {sessions.length === 0 ? (
          <p className="mb-5 text-sm text-on-surface-variant">Aucune session pour cette année.</p>
        ) : (
          <ul className="mb-5 space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-outline-variant/25 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {LIBELLES_TYPE_SESSION[s.type]}
                    {s.libelle ? ` — ${s.libelle}` : ''}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {dateCourte(s.date_debut)} → {dateCourte(s.date_fin)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge className={BADGE_STATUT_ANNEE[s.statut]}>
                    {LIBELLES_STATUT_ANNEE[s.statut]}
                  </Badge>
                  {s.statut === 'preparation' && (
                    <button
                      onClick={() => actionSession(s, 'ouverte')}
                      className={`${ACT} text-emerald-700 hover:bg-emerald-50`}
                    >
                      Ouvrir
                    </button>
                  )}
                  {s.statut === 'ouverte' && (
                    <button
                      onClick={() => actionSession(s, 'cloturee')}
                      className={`${ACT} text-amber-700 hover:bg-amber-50`}
                    >
                      Clôturer
                    </button>
                  )}
                  <button
                    onClick={() => actionSession(s, 'supprimer')}
                    className={`${ACT} text-error hover:bg-error-container/50`}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={ajouterSession} className="space-y-4 border-t border-outline-variant/25 pt-5">
          <div className="grid grid-cols-2 gap-4">
            <Champ label="Type *">
              <select
                value={formSession.type}
                onChange={(e) => setFormSession((f) => ({ ...f, type: e.target.value }))}
                className={INPUT}
              >
                {OPTIONS_TYPE_SESSION.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="Libellé">
              <input
                value={formSession.libelle}
                onChange={(e) => setFormSession((f) => ({ ...f, libelle: e.target.value }))}
                className={INPUT}
              />
            </Champ>
            <Champ label="Début">
              <input
                type="date"
                value={formSession.date_debut}
                onChange={(e) => setFormSession((f) => ({ ...f, date_debut: e.target.value }))}
                className={INPUT}
              />
            </Champ>
            <Champ label="Fin">
              <input
                type="date"
                value={formSession.date_fin}
                onChange={(e) => setFormSession((f) => ({ ...f, date_fin: e.target.value }))}
                className={INPUT}
              />
            </Champ>
          </div>
          <div className="flex justify-end">
            <button type="submit" className={BTN_PRIMARY}>
              <Icon name="add" size={20} /> Ajouter la session
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
