// ─────────────────────────────────────────────────────────────
// File d'instruction du ministère — l'écran de travail principal.
//
// L'unité d'instruction est le LOT, pas le dossier isolé : un
// établissement transmet une promotion entière, l'agent l'examine
// entière. La décision, elle, reste dossier par dossier — d'où le rejet
// partiel, qui laisse passer les dossiers conformes.
//
// Les contrôles automatiques sont présentés en deux familles, et cette
// distinction est le cœur de l'écran :
//   • BLOQUANTS  — le dossier ne peut pas être certifié en l'état ;
//   • ANOMALIES  — c'est inhabituel, un humain doit regarder, mais rien
//                  n'interdit de valider.
// Confondre les deux, c'est soit bloquer à tort, soit certifier à tort.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  fileDesLots,
  detaillerLot,
  examinerLot,
  validerLot,
  rejeterLot,
  certifierLot,
} from '../../services/lot.service.js';
import { LIBELLES_MENTION, messageErreur } from '../../utils/libelles.js';
import PiecesInstruction from '../../components/PiecesInstruction.jsx';
import {
  EnTetePage,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Modale,
  Bouton,
  Champ,
  Zone,
  Chargement,
  Chiffre,
  Onglets,
  Icone,
} from '../../components/ui/index.jsx';

const STATUTS = {
  transmis: { libelle: 'Transmis', ton: 'info' },
  en_examen: { libelle: 'En examen', ton: 'alerte' },
  valide: { libelle: 'Validé', ton: 'succes' },
  partiellement_traite: { libelle: 'Partiellement traité', ton: 'alerte' },
  rejete: { libelle: 'Rejeté', ton: 'erreur' },
  certifie: { libelle: 'Certifié', ton: 'vert' },
};

const ONGLETS = [
  { cle: 'transmis', libelle: 'À prendre en charge' },
  { cle: 'en_examen', libelle: 'En examen' },
  { cle: 'valide', libelle: 'À certifier' },
  { cle: '', libelle: 'Tous' },
];

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function LotsRecusPage() {
  const [lots, setLots] = useState([]);
  const [repartition, setRepartition] = useState({});
  const [onglet, setOnglet] = useState('transmis');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const [detail, setDetail] = useState(null);
  const [rejetes, setRejetes] = useState({}); // dossier_id → motif
  const [action, setAction] = useState(false);

  const [rejetLot, setRejetLot] = useState(null);
  const [motifLot, setMotifLot] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      const data = await fileDesLots({ statut: onglet });
      setLots(data.lots);
      setRepartition(data.repartition || {});
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet]);

  async function ouvrir(lot) {
    setDetail({ lot, dossiers: null, controles: null });
    setRejetes({});
    try {
      setDetail(await detaillerLot(lot.id));
    } catch (err) {
      setErreur(messageErreur(err));
      setDetail(null);
    }
  }

  async function agir(fn, message) {
    setAction(true);
    setErreur('');
    try {
      await fn();
      setSucces(message);
      setDetail(null);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  function basculerRejet(dossierId) {
    setRejetes((r) => {
      const copie = { ...r };
      if (dossierId in copie) delete copie[dossierId];
      else copie[dossierId] = '';
      return copie;
    });
  }

  const lot = detail?.lot;
  const controles = detail?.controles;
  const synthese = controles?.synthese;
  const bloquants = controles?.bloquants || [];
  const anomalies = controles?.anomalies || [];
  const idsBloquants = new Set(bloquants.map((b) => b.dossier_id));

  const rejetsListe = Object.entries(rejetes).map(([dossier_id, motif]) => ({
    dossier_id,
    motif,
  }));
  const rejetsIncomplets = rejetsListe.some((r) => !r.motif.trim());

  return (
    <div>
      <EnTetePage
        titre="Lots reçus"
        description="Les promotions transmises par les établissements, à instruire puis à certifier."
        fil={[{ libelle: 'Instruction' }, { libelle: 'Lots reçus' }]}
      />

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}
      {succes && (
        <div className="mb-4">
          <Encart ton="succes">{succes}</Encart>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Chiffre
          libelle="À prendre en charge"
          valeur={repartition.transmis ?? 0}
          ton={repartition.transmis > 0 ? 'alerte' : 'neutre'}
        />
        <Chiffre libelle="En examen" valeur={repartition.en_examen ?? 0} />
        <Chiffre libelle="À certifier" valeur={repartition.valide ?? 0} ton="vert" />
        <Chiffre libelle="Certifiés" valeur={repartition.certifie ?? 0} ton="vert" />
      </div>

      <Onglets
        onglets={ONGLETS.map((o) => ({
          ...o,
          compteur: o.cle ? repartition[o.cle] : undefined,
        }))}
        actif={onglet}
        onChanger={setOnglet}
      />

      <Tableau
        legende="Lots reçus des établissements"
        chargement={chargement}
        lignes={lots}
        colonnes={[
          {
            cle: 'reference',
            libelle: 'Lot',
            tabulaire: true,
            rendu: (l) => (
              <span>
                <span className="font-medium">{l.reference}</span>
                <span className="block text-xs text-gris-500">{l.promotion_libelle}</span>
              </span>
            ),
          },
          { cle: 'etablissement_nom', libelle: 'Établissement' },
          { cle: 'effectif', libelle: 'Effectif', alignement: 'droite', tabulaire: true },
          {
            cle: 'date_transmission',
            libelle: 'Reçu le',
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
                Instruire
              </Bouton>
            ),
          },
        ]}
        vide={
          <EtatVide icone="inbox" titre="Aucun lot dans cette file">
            {onglet === 'transmis'
              ? 'Tout ce qui a été transmis est déjà pris en charge.'
              : 'Aucun lot ne correspond à ce filtre.'}
          </EtatVide>
        }
      />

      {/* ── Instruction d'un lot ── */}
      <Modale
        ouvert={Boolean(detail)}
        titre={`Instruction — ${lot?.reference || ''}`}
        onFermer={() => setDetail(null)}
        largeur="max-w-5xl"
      >
        {!detail?.dossiers ? (
          <Chargement libelle="Contrôles automatiques en cours…" />
        ) : (
          <>
            <dl className="mb-4 grid gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-sm text-gris-500">Établissement</dt>
                <dd className="text-base font-medium">{lot.etablissement_nom}</dd>
              </div>
              <div>
                <dt className="text-sm text-gris-500">Promotion</dt>
                <dd className="text-base font-medium">{lot.promotion_libelle}</dd>
              </div>
              <div>
                <dt className="text-sm text-gris-500">Délibération</dt>
                <dd className="tabulaire text-base font-medium">
                  {date(lot.date_deliberation)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gris-500">Statut</dt>
                <dd>
                  <Etiquette ton={STATUTS[lot.statut]?.ton}>
                    {STATUTS[lot.statut]?.libelle}
                  </Etiquette>
                </dd>
              </div>
            </dl>

            {synthese && (
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <Chiffre
                  libelle="Effectif déclaré"
                  valeur={synthese.effectif_declare}
                  precision={
                    synthese.dossiers_recus !== synthese.effectif_declare
                      ? `${synthese.dossiers_recus} reçus`
                      : undefined
                  }
                  ton={
                    synthese.dossiers_recus !== synthese.effectif_declare ? 'alerte' : 'neutre'
                  }
                />
                <Chiffre libelle="Conformes" valeur={synthese.dossiers_conformes} ton="vert" />
                <Chiffre
                  libelle="Bloquants"
                  valeur={synthese.dossiers_bloquants}
                  ton={synthese.dossiers_bloquants > 0 ? 'erreur' : 'neutre'}
                />
                <Chiffre
                  libelle="Moyenne générale"
                  valeur={synthese.moyenne_generale ?? '—'}
                  precision="sur 20"
                />
              </div>
            )}

            {/* Bloquants et anomalies ne se traitent pas pareil : les uns
                interdisent la certification, les autres appellent un
                regard. Les mélanger ferait perdre le sens des deux. */}
            {bloquants.length > 0 && (
              <div className="mb-4">
                <Encart
                  ton="erreur"
                  titre={`${bloquants.length} dossier(s) bloquants — certification impossible en l'état`}
                >
                  <ul className="mt-1 space-y-1 text-sm">
                    {bloquants.slice(0, 8).map((b) => (
                      <li key={b.dossier_id}>
                        <span className="font-medium">{b.etudiant}</span> ({b.numero_etudiant}) —{' '}
                        {b.erreurs.join(' ; ')}
                      </li>
                    ))}
                    {bloquants.length > 8 && <li>… et {bloquants.length - 8} autres.</li>}
                  </ul>
                </Encart>
              </div>
            )}

            {anomalies.length > 0 && (
              <div className="mb-4">
                <Encart ton="alerte" titre={`${anomalies.length} anomalie(s) à vérifier`}>
                  <ul className="mt-1 space-y-1 text-sm">
                    {anomalies.map((a, i) => (
                      <li key={i}>{a.message || a}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm">
                    Une anomalie n'interdit pas de valider : elle signale un cas inhabituel dont
                    vous restez juge.
                  </p>
                </Encart>
              </div>
            )}

            {bloquants.length === 0 && anomalies.length === 0 && (
              <div className="mb-4">
                <Encart ton="succes" titre="Contrôles automatiques passés">
                  Aucun blocage ni anomalie détectés sur ce lot.
                </Encart>
              </div>
            )}

            {/* Les pièces AVANT la liste des dossiers : on instruit sur
                actes, la case à cocher vient après la lecture.

                Mais PAS avant la prise en charge : ouvrir un document le
                marque « consulté » et engage l'agent. Instruire les pièces
                sur un lot encore « transmis », puis le prendre en examen,
                reviendrait à faire deux fois le même travail — et à laisser
                une trace d'instruction sur un lot dont personne n'était
                encore responsable. */}
            {lot.statut === 'transmis' ? (
              <div className="mb-5 border-t border-gris-200 pt-4">
                <h3 className="mb-3 text-lg">Pièces justificatives</h3>
                <Encart ton="info" titre="Instruction des pièces après prise en charge">
                  Prenez le lot en examen pour ouvrir les justificatifs : c'est ce geste qui
                  vous en désigne comme instructeur, et il ne se fait qu'une fois.
                </Encart>
              </div>
            ) : (
              <div className="mb-5 border-t border-gris-200 pt-4">
                <h3 className="mb-3 text-lg">Pièces justificatives</h3>
                <PiecesInstruction lotId={lot.id} onChangement={() => ouvrir(lot)} />
              </div>
            )}

            <p className="mb-2 text-sm text-gris-500">
              Cochez les dossiers à renvoyer et motivez chacun : les autres poursuivront
              l'instruction.
            </p>

            <Tableau
              legende="Dossiers du lot"
              lignes={detail.dossiers}
              colonnes={[
                {
                  cle: 'rejet',
                  libelle: 'Renvoyer',
                  rendu: (d) => (
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      aria-label={`Renvoyer le dossier de ${d.nom} ${d.prenom}`}
                      checked={d.id in rejetes}
                      onChange={() => basculerRejet(d.id)}
                    />
                  ),
                },
                { cle: 'numero_etudiant', libelle: 'N° étudiant', tabulaire: true },
                {
                  cle: 'etudiant',
                  libelle: 'Étudiant',
                  rendu: (d) => (
                    <span>
                      {d.nom} {d.prenom}
                      {idsBloquants.has(d.id) && (
                        <span className="ml-2">
                          <Etiquette ton="erreur">bloquant</Etiquette>
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  cle: 'moyenne',
                  libelle: 'Moyenne',
                  alignement: 'droite',
                  tabulaire: true,
                  rendu: (d) => d.moyenne ?? '—',
                },
                {
                  cle: 'mention',
                  libelle: 'Mention',
                  rendu: (d) => (d.mention ? LIBELLES_MENTION[d.mention] : '—'),
                },
                {
                  cle: 'motif',
                  libelle: 'Motif du renvoi',
                  rendu: (d) =>
                    d.id in rejetes ? (
                      <input
                        className="w-full rounded border border-gris-500 px-2 py-1 text-sm"
                        placeholder="Obligatoire"
                        value={rejetes[d.id]}
                        onChange={(e) =>
                          setRejetes((r) => ({ ...r, [d.id]: e.target.value }))
                        }
                      />
                    ) : (
                      <span className="text-gris-500">—</span>
                    ),
                },
              ]}
            />

            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-gris-200 pt-4">
              <Bouton variante="neutre" onClick={() => setDetail(null)}>
                Fermer
              </Bouton>

              {lot.statut === 'transmis' && (
                <Bouton
                  icone="play_arrow"
                  enCours={action}
                  onClick={() =>
                    agir(() => examinerLot(lot.id), `Lot ${lot.reference} pris en examen.`)
                  }
                >
                  Prendre en examen
                </Bouton>
              )}

              {lot.statut === 'en_examen' && (
                <>
                  <Bouton
                    variante="danger"
                    icone="block"
                    onClick={() => {
                      setRejetLot(lot);
                      setMotifLot('');
                    }}
                  >
                    Rejeter tout le lot
                  </Bouton>
                  <Bouton
                    icone="check"
                    enCours={action}
                    disabled={rejetsIncomplets}
                    title={
                      rejetsIncomplets ? 'Chaque dossier renvoyé doit être motivé' : undefined
                    }
                    onClick={() =>
                      agir(
                        () => validerLot(lot.id, { dossiers_rejetes: rejetsListe }),
                        rejetsListe.length > 0
                          ? `Lot validé : ${rejetsListe.length} dossier(s) renvoyés, les autres poursuivent.`
                          : `Lot ${lot.reference} validé intégralement.`
                      )
                    }
                  >
                    Valider {rejetsListe.length > 0 && `(${rejetsListe.length} renvoyés)`}
                  </Bouton>
                </>
              )}

              {['valide', 'partiellement_traite'].includes(lot.statut) && (
                <Bouton
                  icone="verified"
                  enCours={action}
                  onClick={() =>
                    agir(async () => {
                      const res = await certifierLot(lot.id);
                      if (res?.en_attente_validation) {
                        throw new Error(
                          'Certification soumise au contrôle à quatre yeux : un second agent doit approuver.'
                        );
                      }
                    }, `Certification du lot ${lot.reference} lancée. L'ancrage blockchain se poursuit en file.`)
                  }
                >
                  Certifier le lot
                </Bouton>
              )}
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="schedule" taille={16} className="mt-0.5 shrink-0" />
              La certification n'attend pas la blockchain : les diplômes sont émis
              immédiatement et l'ancrage on-chain se fait en file, suivi depuis l'écran
              « File d'ancrage ».
            </p>
          </>
        )}
      </Modale>

      {/* ── Rejet du lot entier ── */}
      <Modale
        ouvert={Boolean(rejetLot)}
        titre={`Rejeter le lot ${rejetLot?.reference || ''}`}
        onFermer={() => setRejetLot(null)}
      >
        <div className="space-y-4">
          <Encart ton="alerte" titre="Le lot entier repart à l'établissement">
            Si seuls quelques dossiers posent problème, préférez le renvoi partiel : les
            dossiers conformes poursuivent alors leur instruction au lieu d'attendre la
            correction des autres.
          </Encart>

          <Champ
            label="Motif du rejet"
            htmlFor="motif-lot"
            requis
            aide="Il sera lu tel quel par l'établissement : soyez précis sur ce qu'il doit corriger."
          >
            <Zone
              id="motif-lot"
              rows={4}
              value={motifLot}
              onChange={(e) => setMotifLot(e.target.value)}
            />
          </Champ>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setRejetLot(null)}>
              Annuler
            </Bouton>
            <Bouton
              variante="danger"
              disabled={!motifLot.trim()}
              enCours={action}
              onClick={() =>
                agir(async () => {
                  await rejeterLot(rejetLot.id, motifLot);
                  setRejetLot(null);
                }, `Lot ${rejetLot.reference} rejeté et renvoyé à l'établissement.`)
              }
            >
              Rejeter le lot
            </Bouton>
          </div>
        </div>
      </Modale>
    </div>
  );
}
