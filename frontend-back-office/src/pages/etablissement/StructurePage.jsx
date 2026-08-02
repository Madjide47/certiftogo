// ─────────────────────────────────────────────────────────────
// Structure de l'établissement : facultés et filières.
// C'est le socle des promotions — sans filière, aucune cohorte
// ne peut être créée.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { INPUT, BTN_PRIMARY, BTN_GHOST, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
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
  BADGE_STATUT_STRUCTURE,
  messageErreur,
} from '../../utils/libelles.js';

const FACULTE_VIDE = { nom: '', code: '', statut: 'active' };
const FILIERE_VIDE = {
  faculte_id: '',
  nom: '',
  code: '',
  type_diplome: 'licence',
  duree_annees: 3,
  statut: 'active',
};

function Champ({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

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
      faculte
        ? { nom: faculte.nom, code: faculte.code, statut: faculte.statut }
        : FACULTE_VIDE
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

  return (
    <div>
      <PageHeader
        titre="Structure"
        sous={`${facultes.length} faculté(s) · ${filieres.length} filière(s)`}
      />

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      {/* ── Facultés ── */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-on-surface">Facultés</h2>
        <button onClick={() => ouvrirFaculte()} className={BTN_PRIMARY}>
          <Icon name="add" size={20} /> Nouvelle faculté
        </button>
      </div>

      <div className={`${TABLE_WRAP} mb-10`}>
        <table className="w-full">
          <thead className="bg-surface-container-low/60">
            <tr>
              <th className={TH}>Code</th>
              <th className={TH}>Nom</th>
              <th className={TH}>Statut</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-on-surface-variant">
                  Chargement…
                </td>
              </tr>
            ) : facultes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucune faculté. Commencez par en créer une, puis ajoutez-y des filières.
                </td>
              </tr>
            ) : (
              facultes.map((f) => (
                <tr key={f.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>{f.code}</td>
                  <td className={TD}>{f.nom}</td>
                  <td className={TD}>
                    <Badge className={BADGE_STATUT_STRUCTURE[f.statut]}>
                      {LIBELLES_STATUT_STRUCTURE[f.statut]}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right`}>
                    <button
                      onClick={() => ouvrirFaculte(f)}
                      className={`${ACT} text-primary hover:bg-primary-container/10`}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => retirerFaculte(f)}
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

      {/* ── Filières ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-on-surface">Filières</h2>
        <div className="flex items-center gap-2">
          <select
            value={filtreFaculte}
            onChange={(e) => setFiltreFaculte(e.target.value)}
            className={`${INPUT} mt-0 w-auto`}
          >
            <option value="">Toutes les facultés</option>
            {facultes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
          <button
            onClick={() => ouvrirFiliere()}
            disabled={facultes.length === 0}
            className={BTN_PRIMARY}
            title={facultes.length === 0 ? 'Créez d\'abord une faculté' : undefined}
          >
            <Icon name="add" size={20} /> Nouvelle filière
          </button>
        </div>
      </div>

      <div className={TABLE_WRAP}>
        <table className="w-full">
          <thead className="bg-surface-container-low/60">
            <tr>
              <th className={TH}>Code</th>
              <th className={TH}>Nom</th>
              <th className={TH}>Faculté</th>
              <th className={TH}>Diplôme</th>
              <th className={TH}>Durée</th>
              <th className={TH}>Statut</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-on-surface-variant">
                  Chargement…
                </td>
              </tr>
            ) : filieres.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucune filière.
                </td>
              </tr>
            ) : (
              filieres.map((f) => (
                <tr key={f.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>{f.code}</td>
                  <td className={TD}>{f.nom}</td>
                  <td className={`${TD} text-on-surface-variant`}>{f.faculte_nom}</td>
                  <td className={TD}>{LIBELLES_TYPE_DIPLOME[f.type_diplome]}</td>
                  <td className={`${TD} text-on-surface-variant`}>{f.duree_annees} an(s)</td>
                  <td className={TD}>
                    <Badge className={BADGE_STATUT_STRUCTURE[f.statut]}>
                      {LIBELLES_STATUT_STRUCTURE[f.statut]}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right`}>
                    <button
                      onClick={() => ouvrirFiliere(f)}
                      className={`${ACT} text-primary hover:bg-primary-container/10`}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => retirerFiliere(f)}
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

      {/* ── Modale faculté ── */}
      <Modal
        ouvert={modaleFaculte}
        titre={faculteEnEdition ? 'Modifier la faculté' : 'Nouvelle faculté'}
        onFermer={() => setModaleFaculte(false)}
      >
        <form onSubmit={soumettreFaculte} className="space-y-4">
          {erreurForm && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurForm}
            </div>
          )}
          <Champ label="Nom *">
            <input
              required
              value={formFaculte.nom}
              onChange={(e) => setFormFaculte((f) => ({ ...f, nom: e.target.value }))}
              className={INPUT}
            />
          </Champ>
          <div className="grid grid-cols-2 gap-4">
            <Champ label="Code * (20 caractères max)">
              <input
                required
                maxLength={20}
                placeholder="FST"
                value={formFaculte.code}
                onChange={(e) => setFormFaculte((f) => ({ ...f, code: e.target.value }))}
                className={INPUT}
              />
            </Champ>
            <Champ label="Statut">
              <select
                value={formFaculte.statut}
                onChange={(e) => setFormFaculte((f) => ({ ...f, statut: e.target.value }))}
                className={INPUT}
              >
                <option value="active">Active</option>
                <option value="archivee">Archivée</option>
              </select>
            </Champ>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModaleFaculte(false)} className={BTN_GHOST}>
              Annuler
            </button>
            <button type="submit" disabled={enregistrement} className={BTN_PRIMARY}>
              {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modale filière ── */}
      <Modal
        ouvert={modaleFiliere}
        titre={filiereEnEdition ? 'Modifier la filière' : 'Nouvelle filière'}
        onFermer={() => setModaleFiliere(false)}
      >
        <form onSubmit={soumettreFiliere} className="space-y-4">
          {erreurForm && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurForm}
            </div>
          )}
          <Champ label="Faculté *">
            <select
              required
              disabled={Boolean(filiereEnEdition)}
              value={formFiliere.faculte_id}
              onChange={(e) => setFormFiliere((f) => ({ ...f, faculte_id: e.target.value }))}
              className={INPUT}
            >
              <option value="">—</option>
              {facultes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Nom *">
            <input
              required
              value={formFiliere.nom}
              onChange={(e) => setFormFiliere((f) => ({ ...f, nom: e.target.value }))}
              className={INPUT}
            />
          </Champ>
          <div className="grid grid-cols-2 gap-4">
            <Champ label="Code *">
              <input
                required
                maxLength={20}
                placeholder="GL"
                value={formFiliere.code}
                onChange={(e) => setFormFiliere((f) => ({ ...f, code: e.target.value }))}
                className={INPUT}
              />
            </Champ>
            <Champ label="Type de diplôme *">
              <select
                value={formFiliere.type_diplome}
                onChange={(e) => setFormFiliere((f) => ({ ...f, type_diplome: e.target.value }))}
                className={INPUT}
              >
                {OPTIONS_TYPE_DIPLOME.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="Durée (1 à 8 ans) *">
              <input
                required
                type="number"
                min={1}
                max={8}
                value={formFiliere.duree_annees}
                onChange={(e) => setFormFiliere((f) => ({ ...f, duree_annees: e.target.value }))}
                className={INPUT}
              />
            </Champ>
            <Champ label="Statut">
              <select
                value={formFiliere.statut}
                onChange={(e) => setFormFiliere((f) => ({ ...f, statut: e.target.value }))}
                className={INPUT}
              >
                <option value="active">Active</option>
                <option value="archivee">Archivée</option>
              </select>
            </Champ>
          </div>
          <p className="text-xs text-on-surface-variant">
            La durée borne le niveau des promotions : une licence de 3 ans n'accepte pas
            de promotion de niveau 4.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModaleFiliere(false)} className={BTN_GHOST}>
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
