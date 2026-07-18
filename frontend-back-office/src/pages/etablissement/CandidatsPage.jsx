// ─────────────────────────────────────────────────────────────
// Gestion des candidats de l'établissement : liste, recherche,
// création / modification (modale) et suppression.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { INPUT, BTN_PRIMARY, BTN_GHOST, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
import {
  listerCandidats,
  creerCandidat,
  modifierCandidat,
  supprimerCandidat,
} from '../../services/candidat.service.js';
import { messageErreur } from '../../utils/libelles.js';

const CANDIDAT_VIDE = {
  numero_etudiant: '',
  nom: '',
  prenom: '',
  date_naissance: '',
  lieu_naissance: '',
  sexe: '',
  telephone: '',
  email: '',
};

function Champ({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

export default function CandidatsPage() {
  const [candidats, setCandidats] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState(null);
  const [form, setForm] = useState(CANDIDAT_VIDE);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  async function charger(q = '') {
    setChargement(true);
    setErreur('');
    try {
      setCandidats(await listerCandidats({ recherche: q }));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => charger(recherche), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  function ouvrirCreation() {
    setEnEdition(null);
    setForm(CANDIDAT_VIDE);
    setErreurForm('');
    setModaleOuverte(true);
  }

  function ouvrirEdition(candidat) {
    setEnEdition(candidat.id);
    setForm({
      numero_etudiant: candidat.numero_etudiant || '',
      nom: candidat.nom || '',
      prenom: candidat.prenom || '',
      date_naissance: candidat.date_naissance ? candidat.date_naissance.slice(0, 10) : '',
      lieu_naissance: candidat.lieu_naissance || '',
      sexe: candidat.sexe || '',
      telephone: candidat.telephone || '',
      email: candidat.email || '',
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
      if (enEdition) await modifierCandidat(enEdition, form);
      else await creerCandidat(form);
      setModaleOuverte(false);
      await charger(recherche);
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer(candidat) {
    if (!window.confirm(`Supprimer le candidat ${candidat.prenom} ${candidat.nom} ?`)) return;
    try {
      await supprimerCandidat(candidat.id);
      await charger(recherche);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  return (
    <div>
      <PageHeader titre="Candidats" sous={`${candidats.length} candidat(s)`}>
        <button onClick={ouvrirCreation} className={BTN_PRIMARY}>
          <Icon name="add" size={20} /> Nouveau candidat
        </button>
      </PageHeader>

      <div className="relative mb-4 max-w-md">
        <Icon
          name="search"
          size={20}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60"
        />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher par nom, prénom ou numéro étudiant…"
          className={`${INPUT} mt-0 pl-10`}
        />
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
              <th className={TH}>N° étudiant</th>
              <th className={TH}>Nom</th>
              <th className={TH}>Prénom</th>
              <th className={TH}>Sexe</th>
              <th className={TH}>Téléphone</th>
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
            ) : candidats.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucun candidat. Cliquez sur « Nouveau candidat » pour commencer.
                </td>
              </tr>
            ) : (
              candidats.map((c) => (
                <tr key={c.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>{c.numero_etudiant}</td>
                  <td className={TD}>{c.nom}</td>
                  <td className={TD}>{c.prenom}</td>
                  <td className={`${TD} text-on-surface-variant`}>{c.sexe || '—'}</td>
                  <td className={`${TD} text-on-surface-variant`}>{c.telephone || '—'}</td>
                  <td className={`${TD} text-right`}>
                    <button
                      onClick={() => ouvrirEdition(c)}
                      className={`${ACT} text-primary hover:bg-primary-container/10`}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => supprimer(c)}
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

      <Modal
        ouvert={modaleOuverte}
        titre={enEdition ? 'Modifier le candidat' : 'Nouveau candidat'}
        onFermer={() => setModaleOuverte(false)}
      >
        <form onSubmit={soumettre} className="space-y-4">
          {erreurForm && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurForm}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Champ label="N° étudiant *">
              <input
                required
                value={form.numero_etudiant}
                onChange={(e) => majChamp('numero_etudiant', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Sexe">
              <select
                value={form.sexe}
                onChange={(e) => majChamp('sexe', e.target.value)}
                className={INPUT}
              >
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </Champ>
            <Champ label="Nom *">
              <input
                required
                value={form.nom}
                onChange={(e) => majChamp('nom', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Prénom *">
              <input
                required
                value={form.prenom}
                onChange={(e) => majChamp('prenom', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Date de naissance">
              <input
                type="date"
                value={form.date_naissance}
                onChange={(e) => majChamp('date_naissance', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Lieu de naissance">
              <input
                value={form.lieu_naissance}
                onChange={(e) => majChamp('lieu_naissance', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Téléphone">
              <input
                value={form.telephone}
                onChange={(e) => majChamp('telephone', e.target.value)}
                className={INPUT}
              />
            </Champ>
            <Champ label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => majChamp('email', e.target.value)}
                className={INPUT}
              />
            </Champ>
          </div>
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
