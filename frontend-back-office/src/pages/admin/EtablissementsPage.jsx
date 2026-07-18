// ─────────────────────────────────────────────────────────────
// Admin système — gestion des établissements : liste, création,
// suspension / réactivation.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { INPUT, BTN_PRIMARY, BTN_GHOST, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
import {
  listerEtablissements,
  creerEtablissement,
  definirStatutEtablissement,
} from '../../services/admin.service.js';
import {
  LIBELLES_TYPE_ETABLISSEMENT,
  OPTIONS_TYPE_ETABLISSEMENT,
  LIBELLES_STATUT_ETABLISSEMENT,
  BADGE_STATUT_ETABLISSEMENT,
  messageErreur,
} from '../../utils/libelles.js';

const FORM_VIDE = { nom: '', type: 'institut', ville: '', email: '', telephone: '', adresse: '' };

export default function EtablissementsPage() {
  const [etablissements, setEtablissements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setEtablissements(await listerEtablissements());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  function majChamp(nom, valeur) {
    setForm((f) => ({ ...f, [nom]: valeur }));
  }

  function ouvrirCreation() {
    setForm(FORM_VIDE);
    setErreurForm('');
    setModaleOuverte(true);
  }

  async function soumettre(e) {
    e.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      await creerEtablissement(form);
      setModaleOuverte(false);
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function basculerStatut(et) {
    const cible = et.statut === 'actif' ? 'suspendu' : 'actif';
    try {
      await definirStatutEtablissement(et.id, cible);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  return (
    <div>
      <PageHeader titre="Établissements" sous={`${etablissements.length} établissement(s)`}>
        <button onClick={ouvrirCreation} className={BTN_PRIMARY}>
          <Icon name="add" size={20} /> Nouvel établissement
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
              <th className={TH}>Nom</th>
              <th className={TH}>Type</th>
              <th className={TH}>Ville</th>
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
            ) : etablissements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucun établissement.
                </td>
              </tr>
            ) : (
              etablissements.map((et) => (
                <tr key={et.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>{et.nom}</td>
                  <td className={`${TD} text-on-surface-variant`}>
                    {LIBELLES_TYPE_ETABLISSEMENT[et.type] || et.type}
                  </td>
                  <td className={`${TD} text-on-surface-variant`}>{et.ville}</td>
                  <td className={TD}>
                    <Badge className={BADGE_STATUT_ETABLISSEMENT[et.statut]}>
                      {LIBELLES_STATUT_ETABLISSEMENT[et.statut] || et.statut}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right`}>
                    {et.statut !== 'archive' && (
                      <button
                        onClick={() => basculerStatut(et)}
                        className={`${ACT} ${
                          et.statut === 'actif'
                            ? 'text-secondary hover:bg-secondary-fixed/40'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {et.statut === 'actif' ? 'Suspendre' : 'Réactiver'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal ouvert={modaleOuverte} titre="Nouvel établissement" onFermer={() => setModaleOuverte(false)}>
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurForm}
            </div>
          )}
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">Nom *</span>
            <input required value={form.nom} onChange={(e) => majChamp('nom', e.target.value)} className={INPUT} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-on-surface-variant">Type *</span>
              <select value={form.type} onChange={(e) => majChamp('type', e.target.value)} className={INPUT}>
                {OPTIONS_TYPE_ETABLISSEMENT.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-on-surface-variant">Ville *</span>
              <input required value={form.ville} onChange={(e) => majChamp('ville', e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-on-surface-variant">Email</span>
              <input type="email" value={form.email} onChange={(e) => majChamp('email', e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-on-surface-variant">Téléphone</span>
              <input value={form.telephone} onChange={(e) => majChamp('telephone', e.target.value)} className={INPUT} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">Adresse</span>
            <input value={form.adresse} onChange={(e) => majChamp('adresse', e.target.value)} className={INPUT} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModaleOuverte(false)} className={BTN_GHOST}>
              Annuler
            </button>
            <button type="submit" disabled={enregistrement} className={BTN_PRIMARY}>
              {enregistrement ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
