// ─────────────────────────────────────────────────────────────
// Ministère — établissements (lecture seule) : annuaire des institutions
// habilitées à transmettre des dossiers.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { TABLE_WRAP, TH, TD, ROW } from '../../components/ui/classes.js';
import { listerEtablissementsMinistere } from '../../services/ministere.service.js';
import {
  LIBELLES_TYPE_ETABLISSEMENT,
  LIBELLES_STATUT_ETABLISSEMENT,
  BADGE_STATUT_ETABLISSEMENT,
  messageErreur,
} from '../../utils/libelles.js';

export default function EtablissementsPage() {
  const [etablissements, setEtablissements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    listerEtablissementsMinistere()
      .then(setEtablissements)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  return (
    <div>
      <PageHeader titre="Établissements" sous={`${etablissements.length} établissement(s) habilité(s)`} />

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
              <th className={TH}>Contact</th>
              <th className={TH}>Statut</th>
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
                  <td className={`${TD} text-on-surface-variant`}>{et.email || et.telephone || '—'}</td>
                  <td className={TD}>
                    <Badge className={BADGE_STATUT_ETABLISSEMENT[et.statut]}>
                      {LIBELLES_STATUT_ETABLISSEMENT[et.statut] || et.statut}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
