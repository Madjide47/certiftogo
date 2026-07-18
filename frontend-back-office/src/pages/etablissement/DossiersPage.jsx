// ─────────────────────────────────────────────────────────────
// Dossiers de l'établissement : liste, filtre par statut, création /
// modification (modale), transmission au ministère, suppression.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { INPUT, BTN_PRIMARY, BTN_GHOST, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
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
  BADGE_STATUT_DOSSIER,
  LIBELLES_MENTION,
  LIBELLES_TYPE_DIPLOME,
  OPTIONS_MENTION,
  OPTIONS_TYPE_DIPLOME,
  messageErreur,
} from '../../utils/libelles.js';

const DOSSIER_VIDE = {
  candidat_id: '',
  filiere: '',
  parcours: '',
  mention: '',
  date_obtention: '',
  type_diplome: '',
  annee_academique: '',
};

function Champ({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

const estModifiable = (s) => s === 'brouillon' || s === 'rejete';

export default function DossiersPage() {
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
    listerCandidats().then(setCandidats).catch(() => {});
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

  function majChamp(nom, valeur) {
    setForm((f) => ({ ...f, [nom]: valeur }));
  }

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
    try {
      await transmettreDossier(d.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function supprimer(d) {
    if (!window.confirm(`Supprimer le dossier ${d.reference} ?`)) return;
    try {
      await supprimerDossier(d.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  return (
    <div>
      <PageHeader titre="Dossiers" sous={`${dossiers.length} dossier(s)`}>
        <button onClick={ouvrirCreation} className={BTN_PRIMARY}>
          <Icon name="add" size={20} /> Nouveau dossier
        </button>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-on-surface-variant">Statut :</span>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className={`${INPUT} mt-0 w-auto py-2`}
        >
          <option value="">Tous</option>
          {Object.entries(LIBELLES_STATUT_DOSSIER).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
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
              <th className={TH}>Référence</th>
              <th className={TH}>Candidat</th>
              <th className={TH}>Type</th>
              <th className={TH}>Mention</th>
              <th className={TH}>Statut</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                  Chargement…
                </td>
              </tr>
            ) : dossiers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucun dossier.
                </td>
              </tr>
            ) : (
              dossiers.map((d) => (
                <tr key={d.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>{d.reference}</td>
                  <td className={TD}>
                    {d.candidat_prenom} {d.candidat_nom}
                  </td>
                  <td className={`${TD} text-on-surface-variant`}>
                    {LIBELLES_TYPE_DIPLOME[d.type_diplome] || '—'}
                  </td>
                  <td className={`${TD} text-on-surface-variant`}>
                    {LIBELLES_MENTION[d.mention] || '—'}
                  </td>
                  <td className={TD}>
                    <Badge className={BADGE_STATUT_DOSSIER[d.statut]}>
                      {LIBELLES_STATUT_DOSSIER[d.statut] || d.statut}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right`}>
                    {estModifiable(d.statut) ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => ouvrirEdition(d)}
                          className={`${ACT} text-primary hover:bg-primary-container/10`}
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => transmettre(d)}
                          className={`${ACT} text-blue-600 hover:bg-blue-50`}
                        >
                          Transmettre
                        </button>
                        {d.statut === 'brouillon' && (
                          <button
                            onClick={() => supprimer(d)}
                            className={`${ACT} text-error hover:bg-error-container/50`}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-on-surface-variant/60">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        ouvert={modaleOuverte}
        titre={enEdition ? 'Modifier le dossier' : 'Nouveau dossier'}
        onFermer={() => setModaleOuverte(false)}
      >
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurForm}
            </div>
          )}

          <Champ label="Candidat *">
            <select
              required
              value={form.candidat_id}
              onChange={(e) => majChamp('candidat_id', e.target.value)}
              className={INPUT}
            >
              <option value="">— Sélectionner un candidat —</option>
              {candidats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} {c.prenom} ({c.numero_etudiant})
                </option>
              ))}
            </select>
          </Champ>

          <div className="grid grid-cols-2 gap-4">
            <Champ label="Type de diplôme">
              <select
                value={form.type_diplome}
                onChange={(e) => majChamp('type_diplome', e.target.value)}
                className={INPUT}
              >
                <option value="">—</option>
                {OPTIONS_TYPE_DIPLOME.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="Mention">
              <select
                value={form.mention}
                onChange={(e) => majChamp('mention', e.target.value)}
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
            <Champ label="Filière">
              <input
                value={form.filiere}
                onChange={(e) => majChamp('filiere', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Parcours">
              <input
                value={form.parcours}
                onChange={(e) => majChamp('parcours', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Date d'obtention">
              <input
                type="date"
                value={form.date_obtention}
                onChange={(e) => majChamp('date_obtention', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Année académique">
              <input
                placeholder="2024-2025"
                value={form.annee_academique}
                onChange={(e) => majChamp('annee_academique', e.target.value)}
                className={INPUT}
              />
            </Champ>
          </div>

          <p className="text-xs text-on-surface-variant/70">
            Type de diplôme et date d'obtention sont requis avant transmission au ministère.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModaleOuverte(false)} className={BTN_GHOST}>
              Annuler
            </button>
            <button type="submit" disabled={enregistrement} className={BTN_PRIMARY}>
              {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
