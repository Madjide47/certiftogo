// ─────────────────────────────────────────────────────────────
// File d'instruction du ministère — l'écran de travail principal.
//
// L'unité de transmission est le LOT : un établissement transmet une
// promotion entière. L'unité de DÉCISION reste le dossier — d'où le
// rejet partiel, qui laisse passer les dossiers conformes.
//
// L'unité de SÉANCE, elle, n'est plus le lot. L'écran exigeait de tout
// statuer d'un coup : sur 250 dossiers — 12 000 pour l'Université de
// Lomé — cela suppose une séance ininterrompue, et le travail fait est
// perdu si l'agent doit s'arrêter. Chaque dossier porte donc sa propre
// décision : « je valide », « je renvoie », ou rien — et « rien » est un
// choix légitime qui garde le dossier en attente pour plus tard.
//
// Les contrôles automatiques restent présentés en deux familles :
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
  traiterDossiers,
  rejeterLot,
  certifierLot,
  prioriserDossierMinistere,
  ficheDuDossier,
} from '../../services/lot.service.js';
import { LIBELLES_MENTION, messageErreur } from '../../utils/libelles.js';
import PiecesInstruction from '../../components/PiecesInstruction.jsx';
import FicheEtudiant from '../../components/FicheEtudiant.jsx';
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
  Saisie,
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

const STATUTS_DOSSIER = {
  soumis: { libelle: 'En attente', ton: 'neutre' },
  en_examen: { libelle: 'En attente', ton: 'neutre' },
  valide: { libelle: 'Validé', ton: 'succes' },
  rejete: { libelle: 'Renvoyé', ton: 'erreur' },
  certifie: { libelle: 'Certifié', ton: 'vert' },
};

const ONGLETS = [
  { cle: 'transmis', libelle: 'À prendre en charge' },
  { cle: 'en_examen', libelle: 'En examen' },
  { cle: 'valide', libelle: 'À certifier' },
  { cle: '', libelle: 'Tous' },
];

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

/** Jours restants avant une échéance — négatif si elle est passée. */
function joursAvant(echeance) {
  if (!echeance) return null;
  const reste = new Date(echeance).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(reste / 86400000);
}

/**
 * L'urgence en un coup d'œil, échéance comprise. Une échéance dépassée
 * ne se signale pas comme une échéance lointaine : c'est déjà trop tard,
 * et l'agent doit le savoir avant d'ouvrir le dossier.
 */
function MarqueurUrgence({ dossier }) {
  if (dossier.priorite !== 'urgente') return null;
  const jours = joursAvant(dossier.date_echeance);

  let ton = 'alerte';
  let texte = 'Urgent';
  if (jours !== null) {
    if (jours < 0) {
      ton = 'erreur';
      texte = `Urgent — échéance dépassée de ${Math.abs(jours)} j`;
    } else if (jours <= 7) {
      ton = 'erreur';
      texte = `Urgent — ${jours} j`;
    } else {
      texte = `Urgent — ${jours} j`;
    }
  }

  return (
    <span title={dossier.motif_urgence || undefined}>
      <Etiquette ton={ton}>{texte}</Etiquette>
    </span>
  );
}

export default function LotsRecusPage() {
  const [lots, setLots] = useState([]);
  const [repartition, setRepartition] = useState({});
  const [onglet, setOnglet] = useState('transmis');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const [detail, setDetail] = useState(null);
  // dossier_id → { decision: 'valide' | 'rejete', motif }
  // Un dossier absent de cette table n'est PAS décidé : il reste en
  // attente, et c'est le sens même de l'instruction par tranches.
  const [decisions, setDecisions] = useState({});
  const [action, setAction] = useState(false);
  const [urgentsSeuls, setUrgentsSeuls] = useState(false);

  const [rejetLot, setRejetLot] = useState(null);
  const [motifLot, setMotifLot] = useState('');

  // Fiche du titulaire : instruire un dossier, c'est examiner une
  // personne — pas seulement lire une ligne de tableau.
  const [fiche, setFiche] = useState(null);
  const [urgence, setUrgence] = useState(null); // dossier en cours de priorisation
  const [declaration, setDeclaration] = useState({ motif_urgence: '', date_echeance: '' });

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

  async function ouvrir(lot, { conserverDecisions = false } = {}) {
    setDetail({ lot, dossiers: null, controles: null });
    if (!conserverDecisions) setDecisions({});
    try {
      setDetail(await detaillerLot(lot.id));
    } catch (err) {
      setErreur(messageErreur(err));
      setDetail(null);
    }
  }

  /** Action qui referme le lot (rejet global, certification). */
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

  /**
   * Action qui ROUVRE le lot sur son nouvel état : après une tranche, le
   * travail continue. Refermer la modale obligerait à retrouver le lot
   * dans la liste à chaque fois.
   */
  async function agirEtRester(fn, message, { conserverDecisions = false } = {}) {
    setAction(true);
    setErreur('');
    try {
      const resultat = await fn();
      setSucces(message(resultat));
      // Une décision appliquée est consommée ; marquer un dossier urgent
      // n'en applique aucune et ne doit pas effacer la sélection en cours.
      if (!conserverDecisions) setDecisions({});
      await charger();
      if (resultat?.lot_solde) setDetail(null);
      else await ouvrir(resultat?.lot || detail.lot, { conserverDecisions });
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  async function ouvrirFiche(dossier) {
    setFiche({ dossier, donnees: null });
    try {
      setFiche({ dossier, donnees: await ficheDuDossier(dossier.id) });
    } catch (err) {
      setErreur(messageErreur(err));
      setFiche(null);
    }
  }

  function decider(dossierId, decision) {
    setDecisions((d) => {
      const copie = { ...d };
      if (!decision || copie[dossierId]?.decision === decision) delete copie[dossierId];
      else copie[dossierId] = { decision, motif: copie[dossierId]?.motif || '' };
      return copie;
    });
  }

  const lot = detail?.lot;
  const controles = detail?.controles;
  const synthese = controles?.synthese;
  const bloquants = controles?.bloquants || [];
  const anomalies = controles?.anomalies || [];
  const progression = detail?.progression;
  const obstaclesCollectifs = detail?.obstacles_collectifs || [];

  const tousDossiers = detail?.dossiers || [];
  const dossiers = urgentsSeuls
    ? tousDossiers.filter((d) => d.priorite === 'urgente')
    : tousDossiers;

  const aValider = Object.entries(decisions)
    .filter(([, v]) => v.decision === 'valide')
    .map(([id]) => id);
  const aRejeter = Object.entries(decisions)
    .filter(([, v]) => v.decision === 'rejete')
    .map(([dossier_id, v]) => ({ dossier_id, motif: v.motif }));
  const rejetsIncomplets = aRejeter.some((r) => !r.motif.trim());
  const rienDecide = aValider.length === 0 && aRejeter.length === 0;

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
          {
            cle: 'avancement',
            libelle: 'Avancement',
            alignement: 'droite',
            tabulaire: true,
            // Un lot n'est plus « fait ou pas fait » : il avance. La file
            // doit dire où en est chacun, sinon l'agent rouvre au hasard.
            rendu: (l) => (
              <span>
                {l.dossiers_total - (l.dossiers_en_attente ?? 0)} / {l.dossiers_total}
                {l.dossiers_en_attente > 0 && (
                  <span className="block text-xs text-gris-500">
                    {l.dossiers_en_attente} en attente
                  </span>
                )}
              </span>
            ),
          },
          {
            cle: 'urgents',
            libelle: 'Urgents',
            rendu: (l) =>
              l.dossiers_urgents > 0 ? (
                <span title={
                  l.echeance_la_plus_proche
                    ? `Échéance la plus proche : ${date(l.echeance_la_plus_proche)}`
                    : undefined
                }>
                  <Etiquette ton={joursAvant(l.echeance_la_plus_proche) <= 7 ? 'erreur' : 'alerte'}>
                    {l.dossiers_urgents}
                  </Etiquette>
                </span>
              ) : (
                <span className="text-gris-500">—</span>
              ),
          },
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
        largeur="max-w-6xl"
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

            {/* Avancement : ce qui a été fait lors des séances précédentes.
                Sans lui, reprendre un lot entamé reviendrait à repartir de
                zéro sans savoir où l'on s'était arrêté. */}
            {progression && progression.total > 0 && (
              <div className="mb-4">
                <div className="mb-1 flex justify-between text-sm text-gris-700">
                  <span>
                    {progression.total - progression.en_attente} dossier(s) sur{' '}
                    {progression.total} déjà statués
                  </span>
                  <span className="tabulaire">
                    {Math.round(
                      ((progression.total - progression.en_attente) / progression.total) * 100
                    )}{' '}
                    %
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded bg-gris-200"
                  role="progressbar"
                  aria-valuenow={progression.total - progression.en_attente}
                  aria-valuemin={0}
                  aria-valuemax={progression.total}
                >
                  <div
                    className="h-full bg-vert"
                    style={{
                      width: `${
                        ((progression.total - progression.en_attente) / progression.total) * 100
                      }%`,
                    }}
                  />
                </div>
                {progression.urgents_en_attente > 0 && (
                  <p className="mt-2 text-sm font-medium text-alerte">
                    {progression.urgents_en_attente} dossier(s) urgent(s) attendent encore une
                    décision — ils sont en tête de liste.
                  </p>
                )}
              </div>
            )}

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
                  libelle="Validables maintenant"
                  valeur={progression?.validables ?? 0}
                  ton={progression?.validables > 0 ? 'vert' : 'neutre'}
                />
              </div>
            )}

            {/* Les actes collectifs bloquent TOUT : le procès-verbal fonde
                la délibération entière, aucun dossier ne tient sans lui. */}
            {obstaclesCollectifs.length > 0 && (
              <div className="mb-4">
                <Encart ton="erreur" titre="Actes collectifs à régler avant toute décision">
                  <ul className="mt-1 space-y-1 text-sm">
                    {obstaclesCollectifs.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </Encart>
              </div>
            )}

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

            {/* Les pièces AVANT la liste des dossiers : on instruit sur
                actes, la décision vient après la lecture.

                Mais PAS avant la prise en charge : ouvrir un document le
                marque « consulté » et engage l'agent. */}
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
                <PiecesInstruction
                  lotId={lot.id}
                  onChangement={() => ouvrir(lot, { conserverDecisions: true })}
                />
              </div>
            )}

            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gris-500">
                Statuez sur les dossiers que vous avez examinés. Ceux que vous laissez sans
                décision restent en attente : vous reprendrez le lot plus tard.
              </p>
              {tousDossiers.some((d) => d.priorite === 'urgente') && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={urgentsSeuls}
                    onChange={(e) => setUrgentsSeuls(e.target.checked)}
                  />
                  N'afficher que les urgents
                </label>
              )}
            </div>

            <Tableau
              legende="Dossiers du lot"
              lignes={dossiers}
              colonnes={[
                {
                  cle: 'decision',
                  libelle: 'Décision',
                  rendu: (d) =>
                    d.en_attente ? (
                      <div className="flex gap-1">
                        {/* Trois états, dont l'abstention. Une case à
                            cocher unique ne sait dire que « rejeté / pas
                            rejeté » et validerait implicitement tout le
                            reste — exactement ce qu'on veut éviter. */}
                        <button
                          type="button"
                          title={
                            d.validable
                              ? 'Valider ce dossier'
                              : d.obstacles.join(' ; ')
                          }
                          disabled={!d.validable}
                          aria-pressed={decisions[d.id]?.decision === 'valide'}
                          onClick={() => decider(d.id, 'valide')}
                          className={`rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                            decisions[d.id]?.decision === 'valide'
                              ? 'border-succes bg-succes text-white'
                              : 'border-gris-300 bg-white text-gris-700 hover:bg-gris-100'
                          }`}
                        >
                          Valider
                        </button>
                        <button
                          type="button"
                          title="Renvoyer ce dossier à l'établissement"
                          aria-pressed={decisions[d.id]?.decision === 'rejete'}
                          onClick={() => decider(d.id, 'rejete')}
                          className={`rounded border px-2 py-1 text-xs ${
                            decisions[d.id]?.decision === 'rejete'
                              ? 'border-erreur bg-erreur text-white'
                              : 'border-gris-300 bg-white text-gris-700 hover:bg-gris-100'
                          }`}
                        >
                          Renvoyer
                        </button>
                      </div>
                    ) : (
                      <Etiquette ton={STATUTS_DOSSIER[d.statut]?.ton}>
                        {STATUTS_DOSSIER[d.statut]?.libelle || d.statut}
                      </Etiquette>
                    ),
                },
                { cle: 'numero_etudiant', libelle: 'N° étudiant', tabulaire: true },
                {
                  cle: 'etudiant',
                  libelle: 'Étudiant',
                  rendu: (d) => (
                    <span className="flex flex-wrap items-center gap-2">
                      {/* Le nom ouvre la fiche : statuer sur un dossier
                          demande de voir la personne entière — parcours,
                          pièces, dossiers antérieurs — et pas seulement
                          la ligne du tableau. */}
                      <button
                        type="button"
                        className="text-left font-medium text-vert underline underline-offset-2 hover:text-vert-fonce"
                        onClick={() => ouvrirFiche(d)}
                      >
                        {d.nom} {d.prenom}
                      </button>
                      <MarqueurUrgence dossier={d} />
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
                  cle: 'obstacles',
                  libelle: 'Ce qui bloque',
                  // Imputé au dossier, pas au lot : c'est cette imputation
                  // qui permet de savoir sur quoi on peut déjà statuer.
                  rendu: (d) =>
                    d.obstacles?.length > 0 ? (
                      <span className="text-sm text-erreur">{d.obstacles.join(' ; ')}</span>
                    ) : d.en_attente ? (
                      <span className="text-sm text-succes">Prêt à statuer</span>
                    ) : (
                      <span className="text-gris-500">—</span>
                    ),
                },
                {
                  cle: 'motif',
                  libelle: 'Motif du renvoi',
                  rendu: (d) =>
                    decisions[d.id]?.decision === 'rejete' ? (
                      <input
                        className="w-full rounded border border-gris-500 px-2 py-1 text-sm"
                        placeholder="Obligatoire"
                        value={decisions[d.id].motif}
                        onChange={(e) =>
                          setDecisions((r) => ({
                            ...r,
                            [d.id]: { ...r[d.id], motif: e.target.value },
                          }))
                        }
                      />
                    ) : (
                      <span className="text-gris-500">—</span>
                    ),
                },
                {
                  cle: 'urgence',
                  libelle: 'Priorité',
                  alignement: 'droite',
                  rendu: (d) =>
                    d.en_attente ? (
                      <Bouton
                        variante="discret"
                        onClick={() => {
                          setUrgence(d);
                          setDeclaration({
                            motif_urgence: d.motif_urgence || '',
                            date_echeance: d.date_echeance ? d.date_echeance.slice(0, 10) : '',
                          });
                        }}
                      >
                        {d.priorite === 'urgente' ? 'Modifier' : 'Marquer urgent'}
                      </Bouton>
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

                  {/* Le geste nouveau : statuer sur ce qui a été examiné,
                      et seulement là-dessus. */}
                  <Bouton
                    variante="secondaire"
                    icone="done_outline"
                    enCours={action}
                    disabled={rienDecide || rejetsIncomplets}
                    title={
                      rienDecide
                        ? 'Désignez au moins un dossier à valider ou à renvoyer'
                        : rejetsIncomplets
                          ? 'Chaque dossier renvoyé doit être motivé'
                          : undefined
                    }
                    onClick={() =>
                      agirEtRester(
                        () =>
                          traiterDossiers(lot.id, {
                            dossiers_valides: aValider,
                            dossiers_rejetes: aRejeter,
                          }),
                        (r) =>
                          r.lot_solde
                            ? `Instruction du lot ${lot.reference} achevée : ${r.total_valides} validé(s), ${r.total_rejetes} renvoyé(s).`
                            : `${r.valides} validé(s), ${r.rejetes} renvoyé(s). ${r.restants} dossier(s) restent à instruire.`
                      )
                    }
                  >
                    Traiter la sélection ({aValider.length + aRejeter.length})
                  </Bouton>

                  {/* Le geste de clôture : solder d'un coup tout ce qui
                      reste, quand plus rien n'appelle de doute. */}
                  <Bouton
                    icone="check"
                    enCours={action}
                    disabled={rejetsIncomplets}
                    title={
                      rejetsIncomplets ? 'Chaque dossier renvoyé doit être motivé' : undefined
                    }
                    onClick={() =>
                      agirEtRester(
                        () => validerLot(lot.id, { dossiers_rejetes: aRejeter }),
                        (r) =>
                          `Lot ${lot.reference} soldé : ${r.total_valides} validé(s), ${r.total_rejetes} renvoyé(s).`
                      )
                    }
                  >
                    Valider tout le reste
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

      {/* ── Fiche du titulaire ── */}
      <Modale
        ouvert={Boolean(fiche)}
        titre={`Fiche — ${fiche?.dossier?.nom || ''} ${fiche?.dossier?.prenom || ''}`}
        onFermer={() => setFiche(null)}
        largeur="max-w-5xl"
      >
        {/* Lecture seule : le ministère instruit, il ne corrige pas les
            pièces d'un établissement. Les décisions sur les pièces se
            prennent dans la vue du lot, où elles s'enchaînent. */}
        <FicheEtudiant fiche={fiche?.donnees} lectureSeule />
      </Modale>

      {/* ── Priorité d'un dossier ── */}
      <Modale
        ouvert={Boolean(urgence)}
        titre={`Priorité — ${urgence?.nom || ''} ${urgence?.prenom || ''}`}
        onFermer={() => setUrgence(null)}
      >
        <div className="space-y-4">
          <Encart ton="info" titre="Faire passer ce dossier devant les autres">
            La priorité ordonne la file : le dossier remonte en tête, dans ce lot et dans la
            vue des urgences. Le motif est conservé au journal — c'est ce qui distingue un
            arbitrage d'un passe-droit.
          </Encart>

          <Champ
            label="Motif de l'urgence"
            htmlFor="motif-urgence"
            requis
            aide="Une phrase suffit : bourse, inscription à l'étranger, concours, décision de justice…"
          >
            <Zone
              id="motif-urgence"
              rows={3}
              value={declaration.motif_urgence}
              onChange={(e) =>
                setDeclaration({ ...declaration, motif_urgence: e.target.value })
              }
            />
          </Champ>

          <Champ
            label="Échéance"
            htmlFor="echeance"
            aide="Facultative. Elle ordonne les urgences entre elles : la plus proche passe d'abord."
          >
            <Saisie
              id="echeance"
              type="date"
              value={declaration.date_echeance}
              onChange={(e) =>
                setDeclaration({ ...declaration, date_echeance: e.target.value })
              }
            />
          </Champ>

          <div className="flex flex-wrap justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setUrgence(null)}>
              Annuler
            </Bouton>

            {urgence?.priorite === 'urgente' && (
              <Bouton
                variante="neutre"
                enCours={action}
                onClick={() =>
                  agirEtRester(async () => {
                    await prioriserDossierMinistere(urgence.id, { priorite: 'normale' });
                    setUrgence(null);
                    return { lot: detail.lot };
                  }, () => 'Priorité ramenée à la normale.', { conserverDecisions: true })
                }
              >
                Lever l'urgence
              </Bouton>
            )}

            <Bouton
              enCours={action}
              disabled={declaration.motif_urgence.trim().length < 10}
              title={
                declaration.motif_urgence.trim().length < 10
                  ? "Expliquez l'urgence en une phrase"
                  : undefined
              }
              onClick={() =>
                agirEtRester(async () => {
                  await prioriserDossierMinistere(urgence.id, {
                    priorite: 'urgente',
                    motif_urgence: declaration.motif_urgence,
                    date_echeance: declaration.date_echeance || undefined,
                  });
                  setUrgence(null);
                  return { lot: detail.lot };
                }, () => 'Dossier déclaré urgent : il remonte en tête de file.', {
                  conserverDecisions: true,
                })
              }
            >
              Déclarer urgent
            </Bouton>
          </div>
        </div>
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
