// ─────────────────────────────────────────────────────────────
// Ministère — diplômes certifiés : consultation, accès PDF / QR, révocation.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { INPUT, BTN_GHOST, BTN_DANGER, TABLE_WRAP, TH, TD, ROW, ACT } from '../../components/ui/classes.js';
import { listerDiplomes, revoquerDiplome } from '../../services/ministere.service.js';
import {
  LIBELLES_STATUT_DIPLOME,
  BADGE_STATUT_DIPLOME,
  LIBELLES_TYPE_DIPLOME,
  messageErreur,
} from '../../utils/libelles.js';

export default function DiplomesPage() {
  const [diplomes, setDiplomes] = useState([]);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const [revocCible, setRevocCible] = useState(null);
  const [motif, setMotif] = useState('');
  const [erreurRevoc, setErreurRevoc] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setDiplomes(await listerDiplomes({ statut: filtreStatut }));
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

  function ouvrirRevoc(d) {
    setRevocCible(d);
    setMotif('');
    setErreurRevoc('');
  }

  async function confirmerRevoc(e) {
    e.preventDefault();
    if (!motif.trim()) {
      setErreurRevoc('Le motif de révocation est requis.');
      return;
    }
    try {
      await revoquerDiplome(revocCible.id, motif.trim());
      setRevocCible(null);
      await charger();
    } catch (err) {
      setErreurRevoc(messageErreur(err));
    }
  }

  return (
    <div>
      <PageHeader titre="Diplômes certifiés" sous={`${diplomes.length} diplôme(s)`} />

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-on-surface-variant">Statut :</span>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className={`${INPUT} mt-0 w-auto py-2`}
        >
          <option value="">Tous</option>
          {Object.entries(LIBELLES_STATUT_DIPLOME).map(([v, l]) => (
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
              <th className={TH}>Titulaire</th>
              <th className={TH}>Type</th>
              <th className={TH}>Établissement</th>
              <th className={TH}>Statut</th>
              <th className={`${TH} text-right`}>Documents / Actions</th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                  Chargement…
                </td>
              </tr>
            ) : diplomes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                  Aucun diplôme certifié.
                </td>
              </tr>
            ) : (
              diplomes.map((d) => (
                <tr key={d.id} className={ROW}>
                  <td className={`${TD} font-semibold`}>{d.reference}</td>
                  <td className={TD}>
                    {d.candidat_prenom} {d.candidat_nom}
                  </td>
                  <td className={`${TD} text-on-surface-variant`}>
                    {LIBELLES_TYPE_DIPLOME[d.type_diplome] || '—'}
                  </td>
                  <td className={`${TD} text-on-surface-variant`}>{d.etablissement_nom}</td>
                  <td className={TD}>
                    <Badge className={BADGE_STATUT_DIPLOME[d.statut]}>
                      {LIBELLES_STATUT_DIPLOME[d.statut] || d.statut}
                    </Badge>
                  </td>
                  <td className={`${TD} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      {d.pdf_url && (
                        <a href={d.pdf_url} target="_blank" rel="noreferrer" className={`${ACT} text-blue-600 hover:bg-blue-50`}>
                          PDF
                        </a>
                      )}
                      {d.qr_code_url && (
                        <a href={d.qr_code_url} target="_blank" rel="noreferrer" className={`${ACT} text-on-surface-variant hover:bg-surface-container`}>
                          QR
                        </a>
                      )}
                      {d.statut === 'actif' && (
                        <button onClick={() => ouvrirRevoc(d)} className={`${ACT} text-error hover:bg-error-container/50`}>
                          Révoquer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        ouvert={!!revocCible}
        titre={revocCible ? `Révoquer le diplôme ${revocCible.reference}` : 'Révoquer'}
        onFermer={() => setRevocCible(null)}
      >
        <form onSubmit={confirmerRevoc} className="space-y-4">
          {erreurRevoc && (
            <div className="rounded-lg bg-error-container px-4 py-2.5 text-sm text-on-error-container">
              {erreurRevoc}
            </div>
          )}
          <p className="text-sm text-on-surface-variant">
            La révocation est enregistrée en blockchain et rend le diplôme invalide à la
            vérification. Cette action est irréversible.
          </p>
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">Motif de révocation *</span>
            <textarea
              rows={4}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Précisez la raison de la révocation."
              className={INPUT}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRevocCible(null)} className={BTN_GHOST}>
              Annuler
            </button>
            <button type="submit" className={BTN_DANGER}>
              Confirmer la révocation
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
