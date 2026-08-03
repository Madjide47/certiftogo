// ─────────────────────────────────────────────────────────────
// Lots transmis — suivi de ce que l'établissement a envoyé au ministère.
//
// C'est l'écran de réponse à « où en est ma promotion ? ». Le détail
// s'ouvre en place plutôt que sur une autre page : l'agent compare
// plusieurs lots, il ne veut pas perdre sa liste.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { mesLots, monLot } from '../../services/lot.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Tableau,
  Etiquette,
  Encart,
  Chargement,
  EtatVide,
  Modale,
  Bouton,
  Liste,
  Champ,
  Icone,
} from '../../components/ui/index.jsx';

const STATUTS = {
  transmis: { libelle: 'Transmis', ton: 'info', aide: 'En attente de prise en charge.' },
  en_examen: { libelle: 'En examen', ton: 'alerte', aide: 'Le ministère instruit le lot.' },
  valide: { libelle: 'Validé', ton: 'succes', aide: 'Tous les dossiers ont été acceptés.' },
  partiellement_traite: {
    libelle: 'Partiellement traité',
    ton: 'alerte',
    aide: 'Une partie des dossiers a été renvoyée.',
  },
  rejete: { libelle: 'Rejeté', ton: 'erreur', aide: 'Le lot entier a été refusé.' },
  certifie: { libelle: 'Certifié', ton: 'vert', aide: 'Les diplômes sont émis.' },
};

const STATUTS_DOSSIER = {
  soumis: { libelle: 'Soumis', ton: 'info' },
  en_examen: { libelle: 'En examen', ton: 'alerte' },
  valide: { libelle: 'Validé', ton: 'succes' },
  rejete: { libelle: 'Rejeté', ton: 'erreur' },
  certifie: { libelle: 'Certifié', ton: 'vert' },
};

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function LotsPage() {
  const [lots, setLots] = useState([]);
  const [filtre, setFiltre] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [detail, setDetail] = useState(null);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setLots(await mesLots({ statut: filtre }));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre]);

  async function ouvrir(lot) {
    setDetail({ lot, dossiers: null });
    try {
      const data = await monLot(lot.id);
      setDetail(data);
    } catch (err) {
      setErreur(messageErreur(err));
      setDetail(null);
    }
  }

  const rejetes = lots.filter((l) => l.statut === 'rejete' || l.dossiers_rejetes > 0);

  return (
    <div>
      <EnTetePage
        titre="Lots transmis"
        description="Suivi des promotions envoyées au ministère et de leur instruction."
        fil={[{ libelle: 'Transmission' }, { libelle: 'Lots transmis' }]}
      />

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {rejetes.length > 0 && (
        <div className="mb-5">
          <Encart ton="alerte" titre={`${rejetes.length} lot(s) comportant des dossiers renvoyés`}>
            Ouvrez le lot pour lire le motif dossier par dossier, corrigez la promotion puis
            retransmettez-la.
          </Encart>
        </div>
      )}

      <div className="mb-4 max-w-xs">
        <Champ label="Filtrer par statut" htmlFor="filtre-statut">
          <Liste
            id="filtre-statut"
            vide="Tous les statuts"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            options={Object.entries(STATUTS).map(([value, s]) => ({
              value,
              label: s.libelle,
            }))}
          />
        </Champ>
      </div>

      <Tableau
        legende="Lots transmis au ministère"
        chargement={chargement}
        lignes={lots}
        colonnes={[
          {
            cle: 'reference',
            libelle: 'Référence',
            rendu: (l) => <span className="font-medium">{l.reference}</span>,
          },
          { cle: 'promotion_libelle', libelle: 'Promotion' },
          {
            cle: 'effectif',
            libelle: 'Effectif',
            alignement: 'droite',
            tabulaire: true,
          },
          {
            cle: 'traitement',
            libelle: 'Instruction',
            tabulaire: true,
            rendu: (l) =>
              l.dossiers_total ? (
                <span className="text-sm">
                  <span className="text-succes">{l.dossiers_valides} validé(s)</span>
                  {l.dossiers_rejetes > 0 && (
                    <>
                      {' · '}
                      <span className="text-erreur">{l.dossiers_rejetes} rejeté(s)</span>
                    </>
                  )}
                  {l.dossiers_certifies > 0 && (
                    <>
                      {' · '}
                      <span className="text-vert">{l.dossiers_certifies} certifié(s)</span>
                    </>
                  )}
                </span>
              ) : (
                '—'
              ),
          },
          {
            cle: 'date_transmission',
            libelle: 'Transmis le',
            rendu: (l) => date(l.date_transmission),
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (l) => (
              <Etiquette ton={STATUTS[l.statut]?.ton}>
                {STATUTS[l.statut]?.libelle || l.statut}
              </Etiquette>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (l) => (
              <Bouton variante="discret" onClick={() => ouvrir(l)}>
                Détail
              </Bouton>
            ),
          },
        ]}
        vide={
          <EtatVide icone="outbox" titre="Aucun lot transmis">
            Un lot est créé lorsque vous transmettez une promotion au ministère depuis l'écran
            Promotions.
          </EtatVide>
        }
      />

      <Modale
        ouvert={Boolean(detail)}
        titre={`Lot ${detail?.lot?.reference || ''}`}
        onFermer={() => setDetail(null)}
        largeur="max-w-4xl"
      >
        {detail?.lot && (
          <>
            <dl className="mb-4 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-gris-500">Promotion</dt>
                <dd className="text-base font-medium">{detail.lot.promotion_libelle}</dd>
              </div>
              <div>
                <dt className="text-sm text-gris-500">Transmis par</dt>
                <dd className="text-base font-medium">
                  {detail.lot.agent_nom
                    ? `${detail.lot.agent_nom} ${detail.lot.agent_prenom || ''}`.trim()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gris-500">Statut</dt>
                <dd>
                  <Etiquette ton={STATUTS[detail.lot.statut]?.ton}>
                    {STATUTS[detail.lot.statut]?.libelle}
                  </Etiquette>
                </dd>
              </div>
            </dl>

            {STATUTS[detail.lot.statut]?.aide && (
              <div className="mb-4">
                <Encart ton={detail.lot.statut === 'rejete' ? 'erreur' : 'info'}>
                  {STATUTS[detail.lot.statut].aide}
                  {detail.lot.motif_rejet && (
                    <>
                      {' '}
                      <strong>Motif :</strong> {detail.lot.motif_rejet}
                    </>
                  )}
                </Encart>
              </div>
            )}

            {detail.dossiers === null ? (
              <Chargement libelle="Chargement des dossiers…" />
            ) : (
              <Tableau
                legende="Dossiers du lot"
                lignes={detail.dossiers}
                colonnes={[
                  { cle: 'numero_etudiant', libelle: 'N° étudiant' },
                  {
                    cle: 'etudiant',
                    libelle: 'Étudiant',
                    rendu: (d) => `${d.nom} ${d.prenom}`,
                  },
                  { cle: 'mention', libelle: 'Mention', rendu: (d) => d.mention || '—' },
                  {
                    cle: 'statut',
                    libelle: 'Statut',
                    rendu: (d) => (
                      <Etiquette ton={STATUTS_DOSSIER[d.statut]?.ton}>
                        {STATUTS_DOSSIER[d.statut]?.libelle || d.statut}
                      </Etiquette>
                    ),
                  },
                  {
                    cle: 'motif_rejet',
                    libelle: 'Motif de rejet',
                    rendu: (d) =>
                      d.motif_rejet ? (
                        <span className="text-erreur">{d.motif_rejet}</span>
                      ) : (
                        <span className="text-gris-500">—</span>
                      ),
                  },
                ]}
              />
            )}

            <p className="mt-4 flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
              Un dossier rejeté n'annule pas les autres : le lot avance avec les dossiers
              conformes.
            </p>
          </>
        )}
      </Modale>
    </div>
  );
}
