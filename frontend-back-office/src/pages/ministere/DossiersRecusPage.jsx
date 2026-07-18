// ─────────────────────────────────────────────────────────────
// Ministère — dossiers reçus : instruction du cycle soumis → en_examen →
// validé / rejeté, puis certification d'un dossier validé.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { INPUT, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
import {
  listerDossiersRecus,
  examinerDossier,
  validerDossier,
  rejeterDossier,
  certifierDossier,
} from '../../services/ministere.service.js';
import {
  LIBELLES_STATUT_DOSSIER,
  BADGE_STATUT_DOSSIER,
  LIBELLES_MENTION,
  LIBELLES_TYPE_DIPLOME,
  messageErreur,
} from '../../utils/libelles.js';

const A_INSTRUIRE = ['soumis', 'en_examen'];

export default function DossiersRecusPage() {
  const [dossiers, setDossiers] = useState([]);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [actionEnCours, setActionEnCours] = useState(null);

  const [rejetCible, setRejetCible] = useState(null);
  const [motif, setMotif] = useState('');
  const [erreurRejet, setErreurRejet] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setDossiers(await listerDossiersRecus({ statut: filtreStatut }));
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

  async function agir(id, action) {
    setActionEnCours(id);
    setErreur('');
    try {
      await action(id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setActionEnCours(null);
    }
  }

  async function certifier(d) {
    if (
      !window.confirm(
        `Certifier définitivement le dossier ${d.reference} ?\n` +
          'Un diplôme signé et ancré en blockchain sera émis. Action irréversible.'
      )
    )
      return;
    await agir(d.id, certifierDossier);
  }

  function ouvrirRejet(d) {
    setRejetCible(d);
    setMotif('');
    setErreurRejet('');
  }

  async function confirmerRejet(e) {
    e.preventDefault();
    if (!motif.trim()) {
      setErreurRejet('Le motif de rejet est requis.');
      return;
    }
    try {
      await rejeterDossier(rejetCible.id, motif.trim());
      setRejetCible(null);
      await charger();
    } catch (err) {
      setErreurRejet(messageErreur(err));
    }
  }

  return (
    <div>
      <PageHeader titre="Dossiers reçus" sous={`${dossiers.length} dossier(s) transmis`} />

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-on-surface-variant">Statut :</span>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className={`${INPUT} mt-0 w-auto py-2`}
        >
          <option value="">Tous (transmis)</option>
          {Object.entries(LIBELLES_STATUT_DOSSIER)
            .filter(([v]) => v !== 'brouillon')
            .map(([v, l]) => (
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
              <th className={TH}>Établissement</th>
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
                <td colSpan={7} className="px-5 py-10 text-center text-on-surface-variant">
                  Chargement…
                </td>
              </tr>
            ) : dossiers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucun dossier transmis.
                </td>
              </tr>
            ) : (
              dossiers.map((d) => {
                const occupe = actionEnCours === d.id;
                const instruisable = A_INSTRUIRE.includes(d.statut);
                return (
                  <tr key={d.id} className={ROW}>
                    <td className={`${TD} font-semibold`}>{d.reference}</td>
                    <td className={`${TD} text-on-surface-variant`}>{d.etablissement_nom}</td>
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
                      {instruisable ? (
                        <div className="flex justify-end gap-1">
                          {d.statut === 'soumis' && (
                            <button
                              disabled={occupe}
                              onClick={() => agir(d.id, examinerDossier)}
                              className={`${ACT} text-secondary hover:bg-secondary-fixed/40 disabled:opacity-50`}
                            >
                              Examiner
                            </button>
                          )}
                          <button
                            disabled={occupe}
                            onClick={() => agir(d.id, validerDossier)}
                            className={`${ACT} text-emerald-600 hover:bg-emerald-50 disabled:opacity-50`}
                          >
                            Valider
                          </button>
                          <button
                            disabled={occupe}
                            onClick={() => ouvrirRejet(d)}
                            className={`${ACT} text-error hover:bg-error-container/50 disabled:opacity-50`}
                          >
                            Rejeter
                          </button>
                        </div>
                      ) : d.statut === 'valide' ? (
                        <button
                          disabled={occupe}
                          onClick={() => certifier(d)}
                          className={`${BTN_PRIMARY} px-3 py-1.5 text-xs`}
                        >
                          <Icon name="workspace_premium" size={16} filled />
                          {occupe ? 'Certification…' : 'Certifier'}
                        </button>
                      ) : d.statut === 'rejete' && d.motif_rejet ? (
                        <span className="text-xs text-on-surface-variant/70" title={d.motif_rejet}>
                          Motif renseigné
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant/60">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        ouvert={!!rejetCible}
        titre={rejetCible ? `Rejeter le dossier ${rejetCible.reference}` : 'Rejeter'}
        onFermer={() => setRejetCible(null)}
      >
        <form onSubmit={confirmerRejet} className="space-y-4">
          {erreurRejet && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurRejet}
            </div>
          )}
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">Motif du rejet *</span>
            <textarea
              rows={4}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Précisez la raison du rejet (transmise à l'établissement)."
              className={INPUT}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRejetCible(null)} className={BTN_GHOST}>
              Annuler
            </button>
            <button type="submit" className={BTN_DANGER}>
              Confirmer le rejet
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
