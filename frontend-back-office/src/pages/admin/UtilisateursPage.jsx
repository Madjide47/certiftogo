// ─────────────────────────────────────────────────────────────
// Admin système — gestion des comptes : liste, création, activation.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { INPUT, BTN_PRIMARY, BTN_GHOST, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
import {
  listerUtilisateurs,
  creerUtilisateur,
  definirActifUtilisateur,
  listerEtablissements,
} from '../../services/admin.service.js';
import { LIBELLES_ROLE, messageErreur } from '../../utils/libelles.js';

const ROLES_CREABLES = [
  { value: 'admin_systeme', label: 'Administrateur' },
  { value: 'etablissement', label: 'Établissement' },
];

const FORM_VIDE = { nom: '', prenom: '', telephone: '', role: 'admin_systeme', etablissement_id: '' };

function rattachementLibelle(u) {
  if (u.role === 'etablissement') return u.etablissement_nom || '—';
  if (u.role === 'ministere') return u.ministere_nom || '—';
  if (u.role === 'candidat') return 'Candidat';
  return '—';
}

export default function UtilisateursPage() {
  const [utilisateurs, setUtilisateurs] = useState([]);
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
      setUtilisateurs(await listerUtilisateurs());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    listerEtablissements().then(setEtablissements).catch(() => {});
  }, []);

  function ouvrirCreation() {
    setForm(FORM_VIDE);
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
      const payload = {
        nom: form.nom,
        prenom: form.prenom,
        telephone: form.telephone,
        role: form.role,
      };
      if (form.role === 'etablissement') payload.etablissement_id = form.etablissement_id;
      await creerUtilisateur(payload);
      setModaleOuverte(false);
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function basculerActif(u) {
    try {
      await definirActifUtilisateur(u.id, !u.actif);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  return (
    <div>
      <PageHeader titre="Utilisateurs" sous={`${utilisateurs.length} compte(s)`}>
        <button onClick={ouvrirCreation} className={BTN_PRIMARY}>
          <Icon name="add" size={20} /> Nouvel utilisateur
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
              <th className={TH}>Téléphone</th>
              <th className={TH}>Rôle</th>
              <th className={TH}>Rattachement</th>
              <th className={TH}>État</th>
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
            ) : (
              utilisateurs.map((u) => (
                <tr key={u.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>
                    {u.prenom} {u.nom}
                  </td>
                  <td className={`${TD} text-on-surface-variant`}>{u.telephone}</td>
                  <td className={TD}>{LIBELLES_ROLE[u.role] || u.role}</td>
                  <td className={`${TD} text-on-surface-variant`}>{rattachementLibelle(u)}</td>
                  <td className={TD}>
                    <Badge
                      className={
                        u.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }
                    >
                      {u.actif ? 'Actif' : 'Désactivé'}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right`}>
                    <button
                      onClick={() => basculerActif(u)}
                      className={`${ACT} ${
                        u.actif
                          ? 'text-secondary hover:bg-secondary-fixed/40'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {u.actif ? 'Désactiver' : 'Activer'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal ouvert={modaleOuverte} titre="Nouvel utilisateur" onFermer={() => setModaleOuverte(false)}>
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurForm}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-on-surface-variant">Prénom *</span>
              <input required value={form.prenom} onChange={(e) => majChamp('prenom', e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-on-surface-variant">Nom *</span>
              <input required value={form.nom} onChange={(e) => majChamp('nom', e.target.value)} className={INPUT} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">Téléphone *</span>
            <input required placeholder="+228…" value={form.telephone} onChange={(e) => majChamp('telephone', e.target.value)} className={INPUT} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">Rôle *</span>
            <select value={form.role} onChange={(e) => majChamp('role', e.target.value)} className={INPUT}>
              {ROLES_CREABLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {form.role === 'etablissement' && (
            <label className="block">
              <span className="text-sm font-medium text-on-surface-variant">Établissement *</span>
              <select
                required
                value={form.etablissement_id}
                onChange={(e) => majChamp('etablissement_id', e.target.value)}
                className={INPUT}
              >
                <option value="">— Sélectionner —</option>
                {etablissements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom} ({e.ville})
                  </option>
                ))}
              </select>
            </label>
          )}
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
