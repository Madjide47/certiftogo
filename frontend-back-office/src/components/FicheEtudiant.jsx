// ─────────────────────────────────────────────────────────────
// Fiche d'un étudiant — l'écran d'examen.
//
// L'information existait, éparpillée : l'état civil dans « Étudiants »,
// le parcours dans une modale, les résultats dans la promotion, les
// pièces dans une troisième modale, les dossiers et diplômes ailleurs.
// Un agent qui doit se prononcer sur un cas — une réclamation, un doute
// sur une mention, un dossier renvoyé — devait reconstituer de tête ce
// que le système savait déjà.
//
// Cette fiche ne montre RIEN de nouveau. Elle met côte à côte ce qui
// doit être lu ensemble, dans l'ordre où un examen se fait :
//
//   1. ce qui cloche          — les alertes, avant tout le reste ;
//   2. QUI                    — l'état civil, qui ira sur le diplôme ;
//   3. CE QU'IL A FAIT        — parcours et résultats, année par année ;
//   4. SUR QUOI ON SE FONDE   — les pièces justificatives ;
//   5. OÙ EN EST L'INSTRUCTION— dossiers, puis diplômes délivrés.
//
// Le même composant sert les deux rôles : l'établissement y corrige,
// le ministère y instruit. Ce qu'ils voient est identique — c'est même
// la condition pour qu'ils parlent du même dossier.
// ─────────────────────────────────────────────────────────────
import { LIBELLES_MENTION, LIBELLES_TYPE_DIPLOME } from '../utils/libelles.js';
import PiecesJointes from './PiecesJointes.jsx';
import { Etiquette, Encart, Tableau, Chargement, Icone, Bouton } from './ui/index.jsx';

const TONS_DOSSIER = {
  brouillon: 'neutre',
  soumis: 'info',
  en_examen: 'alerte',
  valide: 'succes',
  rejete: 'erreur',
  certifie: 'vert',
  revoque: 'erreur',
};

const LIBELLES_DOSSIER = {
  brouillon: 'Brouillon',
  soumis: 'Transmis',
  en_examen: 'En examen',
  valide: 'Validé',
  rejete: 'Renvoyé',
  certifie: 'Certifié',
  revoque: 'Révoqué',
};

const LIBELLES_INSCRIPTION = {
  inscrit: 'Inscrit',
  admis: 'Admis',
  ajourne: 'Ajourné',
  abandon: 'Abandon',
  exclu: 'Exclu',
};

const TONS_INSCRIPTION = {
  inscrit: 'neutre',
  admis: 'succes',
  ajourne: 'alerte',
  abandon: 'neutre',
  exclu: 'erreur',
};

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');
const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Une donnée d'état civil. Le manque est signalé, pas laissé vide. */
function Donnee({ libelle, valeur, manquant = false, aide }) {
  return (
    <div>
      <dt className="text-sm text-gris-500">{libelle}</dt>
      <dd
        className={`text-base ${
          valeur ? 'font-medium text-gris-900' : manquant ? 'font-medium text-erreur' : 'text-gris-500'
        }`}
      >
        {valeur || (manquant ? 'Non renseigné' : '—')}
      </dd>
      {aide && valeur && <p className="text-xs text-gris-500">{aide}</p>}
    </div>
  );
}

function Section({ titre, compteur, children, aide }) {
  return (
    <section className="mt-6 border-t border-gris-200 pt-5">
      <h3 className="mb-1 flex items-center gap-2 text-lg">
        {titre}
        {compteur !== undefined && <Etiquette ton="neutre">{compteur}</Etiquette>}
      </h3>
      {aide && <p className="mb-3 text-sm text-gris-500">{aide}</p>}
      {children}
    </section>
  );
}

export default function FicheEtudiant({ fiche, lectureSeule = false, onChangement }) {
  if (!fiche) return <Chargement libelle="Ouverture de la fiche…" />;

  const { candidat, parcours, dossiers, diplomes, autres_fiches, consultations, alertes } = fiche;
  const nomComplet = `${candidat.prenom} ${(candidat.nom || '').toUpperCase()}`.trim();

  return (
    <div>
      {/* ── 1. Ce qui cloche, avant tout le reste ── */}
      {alertes.length > 0 && (
        <div className="mb-4">
          <Encart ton="erreur" titre={`${alertes.length} point(s) à régler sur ce dossier`}>
            <ul className="mt-1 space-y-1 text-sm">
              {alertes.map((a) => (
                <li key={a.code}>{a.message}</li>
              ))}
            </ul>
          </Encart>
        </div>
      )}

      {/* ── 2. Qui — ce qui figurera sur le diplôme ── */}
      <div className="border border-gris-300 bg-white px-4 py-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-gris-900">{nomComplet || '—'}</h2>
          <span className="tabulaire text-sm text-gris-500">
            {candidat.numero_etudiant} · {candidat.etablissement_nom}
            {candidat.etablissement_code ? ` (${candidat.etablissement_code})` : ''}
          </span>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Donnee
            libelle="Date de naissance"
            valeur={candidat.date_naissance ? date(candidat.date_naissance) : null}
            manquant
            aide="Distingue deux homonymes sur le diplôme."
          />
          <Donnee libelle="Lieu de naissance" valeur={candidat.lieu_naissance} />
          <Donnee
            libelle="Sexe"
            valeur={candidat.sexe === 'M' ? 'Masculin' : candidat.sexe === 'F' ? 'Féminin' : null}
          />
          <Donnee
            libelle="Téléphone"
            valeur={candidat.telephone}
            manquant
            aide="Identifiant de connexion au portefeuille."
          />
          <Donnee libelle="Email" valeur={candidat.email} />
          <Donnee libelle="Fiche créée le" valeur={horodatage(candidat.date_creation)} />
          <Donnee
            libelle="Consultations publiques"
            valeur={
              consultations?.total > 0
                ? `${consultations.total} — dernière le ${date(consultations.derniere)}`
                : 'Aucune'
            }
            aide="Vérifications de ses diplômes par des tiers."
          />
        </dl>

        {/* Un diplômé peut avoir fréquenté plusieurs écoles : le taire
            ferait passer un parcours complet pour un parcours partiel. */}
        {autres_fiches?.length > 0 && (
          <div className="mt-4">
            <Encart ton="info" titre="Cette personne est aussi inscrite ailleurs">
              <ul className="mt-1 space-y-0.5 text-sm">
                {autres_fiches.map((f) => (
                  <li key={f.id}>
                    {f.etablissement_nom} — {f.numero_etudiant}
                  </li>
                ))}
              </ul>
              Ses diplômes ci-dessous couvrent l'ensemble de son parcours, tous établissements
              confondus.
            </Encart>
          </div>
        )}
      </div>

      {/* ── 3. Ce qu'il a fait ── */}
      <Section
        titre="Parcours académique"
        compteur={parcours.length}
        aide="Une ligne par année d'études : c'est le cumul de ces inscriptions qui fait un parcours."
      >
        <Tableau
          legende="Inscriptions successives"
          lignes={parcours}
          colonnes={[
            { cle: 'annee_libelle', libelle: 'Année' },
            {
              cle: 'promotion',
              libelle: 'Promotion',
              rendu: (i) => (
                <span>
                  {i.promotion_libelle}
                  <span className="block text-xs text-gris-500">
                    {i.filiere_nom} — niveau {i.niveau}
                  </span>
                </span>
              ),
            },
            {
              cle: 'statut',
              libelle: 'Résultat',
              rendu: (i) => (
                <span className="flex flex-wrap items-center gap-2">
                  <Etiquette ton={TONS_INSCRIPTION[i.statut]}>
                    {LIBELLES_INSCRIPTION[i.statut] || i.statut}
                  </Etiquette>
                  {i.priorite === 'urgente' && <Etiquette ton="alerte">Urgent</Etiquette>}
                </span>
              ),
            },
            {
              cle: 'moyenne',
              libelle: 'Moyenne',
              alignement: 'droite',
              tabulaire: true,
              rendu: (i) => (i.moyenne != null ? `${i.moyenne} / 20` : '—'),
            },
            {
              cle: 'mention',
              libelle: 'Mention',
              rendu: (i) => (i.mention ? LIBELLES_MENTION[i.mention] : '—'),
            },
          ]}
          vide={<p className="px-4 py-6 text-gris-500">Aucune inscription enregistrée.</p>}
        />
      </Section>

      {/* ── 4. Sur quoi on se fonde ── */}
      <Section
        titre="Pièces justificatives"
        aide={
          lectureSeule
            ? "Les actes sur lesquels l'instruction se fonde. Ouvrez-les depuis la vue du lot pour les valider ou les rejeter."
            : 'Toutes ces pièces sont obligatoires : une seule case vide et la promotion entière reste à quai.'
        }
      >
        <PiecesJointes
          portee="candidat"
          cibleId={candidat.id}
          lectureSeule={lectureSeule}
          onChangement={onChangement}
          // Le ministère lit la grille portée par la fiche : la route de
          // grille appartient à l'établissement propriétaire.
          grilleFournie={lectureSeule ? fiche.pieces : null}
        />
      </Section>

      {/* ── 5. Où en est l'instruction ── */}
      <Section titre="Dossiers" compteur={dossiers.length}>
        <Tableau
          legende="Dossiers de cet étudiant"
          lignes={dossiers}
          colonnes={[
            {
              cle: 'reference',
              libelle: 'Référence',
              tabulaire: true,
              rendu: (d) => (
                <span>
                  <span className={d.id === fiche.dossier_courant ? 'font-bold' : 'font-medium'}>
                    {d.reference}
                  </span>
                  {d.lot_reference && (
                    <span className="block text-xs text-gris-500">lot {d.lot_reference}</span>
                  )}
                </span>
              ),
            },
            {
              cle: 'diplome',
              libelle: 'Diplôme visé',
              rendu: (d) => (
                <span>
                  {LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome}
                  <span className="block text-xs text-gris-500">{d.filiere}</span>
                </span>
              ),
            },
            {
              cle: 'mention',
              libelle: 'Mention',
              rendu: (d) => (d.mention ? LIBELLES_MENTION[d.mention] : '—'),
            },
            {
              cle: 'date_obtention',
              libelle: 'Obtention',
              rendu: (d) => date(d.date_obtention),
            },
            {
              cle: 'statut',
              libelle: 'Statut',
              rendu: (d) => (
                <span className="flex flex-wrap items-center gap-2">
                  <Etiquette ton={TONS_DOSSIER[d.statut]}>
                    {LIBELLES_DOSSIER[d.statut] || d.statut}
                  </Etiquette>
                  {d.priorite === 'urgente' && (
                    <span title={d.motif_urgence || undefined}>
                      <Etiquette ton="alerte">Urgent</Etiquette>
                    </span>
                  )}
                </span>
              ),
            },
            {
              cle: 'motif',
              libelle: 'Motif du renvoi',
              // Le motif d'un rejet est la pièce la plus consultée en cas
              // de litige : il a sa place sur la fiche, pas dans un journal.
              rendu: (d) =>
                d.motif_rejet ? (
                  <span className="text-sm text-erreur">{d.motif_rejet}</span>
                ) : (
                  <span className="text-gris-500">—</span>
                ),
            },
          ]}
          vide={
            <p className="px-4 py-6 text-gris-500">
              Aucun dossier : cet étudiant n'a pas encore été transmis au ministère.
            </p>
          }
        />
      </Section>

      <Section titre="Diplômes délivrés" compteur={diplomes.length}>
        {diplomes.length === 0 ? (
          <p className="border border-gris-300 bg-white px-4 py-6 text-gris-500">
            Aucun diplôme certifié à ce jour.
          </p>
        ) : (
          <ul className="border border-gris-300 bg-white">
            {diplomes.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 border-b border-gris-200 px-4 py-3 last:border-0"
              >
                <Icone
                  nom={d.statut === 'actif' ? 'verified' : 'gpp_bad'}
                  taille={22}
                  className={`shrink-0 ${d.statut === 'actif' ? 'text-vert' : 'text-erreur'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gris-900">
                    {LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome}
                    {d.mention && ` — mention ${LIBELLES_MENTION[d.mention]}`}
                    {d.version > 1 && (
                      <span className="ml-2">
                        <Etiquette ton="info">version {d.version}</Etiquette>
                      </span>
                    )}
                  </p>
                  <p className="tabulaire text-sm text-gris-500">
                    {d.reference} · {d.etablissement_nom} · certifié le{' '}
                    {date(d.date_certification)}
                  </p>
                  {d.statut === 'revoque' && (
                    <p className="mt-1 text-sm font-medium text-erreur">
                      Révoqué le {date(d.date_revocation)} — {d.motif_revocation}
                    </p>
                  )}
                </div>
                <Etiquette ton={d.statut === 'actif' ? 'vert' : 'erreur'}>
                  {d.statut === 'actif' ? 'Valide' : 'Révoqué'}
                </Etiquette>
                {d.pdf_url && (
                  <Bouton
                    variante="discret"
                    onClick={() => window.open(d.pdf_url, '_blank', 'noopener')}
                  >
                    Diplôme PDF
                  </Bouton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
