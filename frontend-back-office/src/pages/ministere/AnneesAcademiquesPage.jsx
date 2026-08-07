// ─────────────────────────────────────────────────────────────
// Référentiel national : années académiques et sessions.
//
// Cet écran commande tout le reste. Tant qu'aucune année n'est ouverte,
// aucun établissement du pays ne peut créer de promotion — et donc rien
// ne peut être transmis ni certifié. C'est le point d'entrée du cycle
// annuel, et l'écran le dit explicitement plutôt que de laisser les
// établissements buter sur un bouton grisé.
//
// Une seule année peut être ouverte à la fois : la base le garantit par
// un index unique partiel. L'interface annonce la conséquence — ouvrir
// une année suppose de clôturer la précédente — au lieu de laisser
// découvrir le refus après coup.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  listerAnnees,
  creerAnnee,
  changerStatutAnnee,
  supprimerAnnee,
  listerSessions,
  creerSession,
  changerStatutSession,
  supprimerSession,
} from '../../services/referentiel.service.js';
import {
  LIBELLES_STATUT_ANNEE,
  LIBELLES_TYPE_SESSION,
  OPTIONS_TYPE_SESSION,
  messageErreur,
} from '../../utils/libelles.js';
import {
  EnTetePage,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Modale,
  Bouton,
  Champ,
  Saisie,
  Liste,
  Icone,
} from '../../components/ui/index.jsx';

// Le libellé suffit : les dates de l'année ne bornaient rien et se
// déduisent du calendrier universitaire, côté serveur.
const ANNEE_VIDE = { libelle: '' };
const SESSION_VIDE = { type: 'normale', libelle: '', date_debut: '', date_fin: '' };

const TONS_ANNEE = {
  preparation: 'info',
  ouverte: 'vert',
  cloturee: 'neutre',
};

const TONS_SESSION = {
  preparation: 'info',
  ouverte: 'succes',
  cloturee: 'neutre',
};

/**
 * Transitions proposées — miroir de TRANSITIONS_ANNEE côté serveur.
 * Une année clôturée ne se rouvre pas : les diplômes qu'elle a produits
 * sont ancrés sur la blockchain, son périmètre est définitif.
 */
const ACTIONS_ANNEE = {
  preparation: [
    { statut: 'ouverte', libelle: 'Ouvrir' },
    { statut: 'cloturee', libelle: 'Clôturer' },
  ],
  ouverte: [{ statut: 'cloturee', libelle: 'Clôturer' }],
  cloturee: [],
};

const ACTIONS_SESSION = {
  preparation: [{ statut: 'ouverte', libelle: 'Ouvrir' }],
  ouverte: [{ statut: 'cloturee', libelle: 'Clôturer' }],
  cloturee: [],
};

const dateCourte = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function AnneesAcademiquesPage() {
  const [annees, setAnnees] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const [modaleAnnee, setModaleAnnee] = useState(false);
  const [formAnnee, setFormAnnee] = useState(ANNEE_VIDE);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const [anneeSessions, setAnneeSessions] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [formSession, setFormSession] = useState(SESSION_VIDE);
  const [erreurSession, setErreurSession] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setAnnees(await listerAnnees());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  /**
   * Années déjà créées — pour le dire AVANT l'envoi plutôt que de laisser
   * le serveur refuser un doublon.
   */
  const dejaCreees = useMemo(() => new Set(annees.map((a) => a.libelle)), [annees]);

  /**
   * L'agent saisit l'ANNÉE DE RENTRÉE, pas le libellé.
   *
   * Une liste déroulante bornée (l'an dernier à trois ans devant) paraissait
   * plus sûre, mais elle finit toujours par manquer : un rattrapage ouvert
   * cinq ans après, une année ancienne à régulariser, et l'écran devient un
   * mur qu'aucun agent ne peut contourner — il faudrait livrer du code.
   *
   * Un nombre n'a pas ce défaut et ne rouvre pas la porte au libellé
   * fantaisiste (« 2025 », « 2025-2027 ») : le libellé reste DÉRIVÉ, jamais
   * tapé. Le contrôle n'est pas perdu, il est déplacé au bon endroit.
   */
  const [rentree, setRentree] = useState('');
  const ANNEE_MIN = 1960; // indépendance : rien d'antérieur n'a de sens ici
  const ANNEE_MAX = new Date().getFullYear() + 20;

  /**
   * Saisir la rentrée dérive le libellé et pré-remplit les dates.
   *
   * Le calendrier universitaire togolais va de la rentrée d'octobre à la
   * fin des délibérations de juillet. Les deviner évite à l'agent de
   * saisir deux dates qu'il connaît sans les avoir sous la main — tout en
   * les laissant modifiables, parce que l'arrêté prime.
   */
  function choisirRentree(valeur) {
    setRentree(valeur);
    const premiere = Number(valeur);
    if (!/^\d{4}$/.test(valeur) || premiere < ANNEE_MIN || premiere > ANNEE_MAX) {
      setFormAnnee(ANNEE_VIDE);
      return;
    }
    setFormAnnee({ libelle: `${premiere}-${premiere + 1}` });
  }

  async function soumettreAnnee(e) {
    e.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      await creerAnnee(formAnnee);
      setModaleAnnee(false);
      setFormAnnee(ANNEE_VIDE);
      setRentree('');
      setSucces("Année créée en préparation. Ouvrez-la pour que les établissements puissent s'en servir.");
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function appliquerStatutAnnee(annee, statut) {
    if (statut === 'cloturee') {
      const ok = window.confirm(
        `Clôturer l'année « ${annee.libelle} » ?\n\n` +
          "Une année clôturée ne se rouvre pas : les diplômes qu'elle a produits sont ancrés " +
          'sur la blockchain, son périmètre devient définitif.'
      );
      if (!ok) return;
    }
    setErreur('');
    setSucces('');
    try {
      await changerStatutAnnee(annee.id, statut);
      setSucces(
        statut === 'ouverte'
          ? `Année ${annee.libelle} ouverte. Les établissements peuvent désormais y rattacher leurs promotions.`
          : `Année ${annee.libelle} clôturée.`
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function retirerAnnee(annee) {
    if (!window.confirm(`Supprimer l'année « ${annee.libelle} » ?`)) return;
    setErreur('');
    try {
      await supprimerAnnee(annee.id);
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  // ── Sessions ──────────────────────────────────────────────────
  async function ouvrirSessions(annee) {
    setAnneeSessions(annee);
    setErreurSession('');
    setFormSession(SESSION_VIDE);
    try {
      setSessions(await listerSessions(annee.id));
    } catch (err) {
      setErreurSession(messageErreur(err));
    }
  }

  async function rafraichirSessions() {
    setSessions(await listerSessions(anneeSessions.id));
  }

  async function soumettreSession(e) {
    e.preventDefault();
    setErreurSession('');
    try {
      await creerSession(anneeSessions.id, formSession);
      setFormSession(SESSION_VIDE);
      await rafraichirSessions();
    } catch (err) {
      setErreurSession(messageErreur(err));
    }
  }

  async function appliquerStatutSession(session, statut) {
    setErreurSession('');
    try {
      await changerStatutSession(session.id, statut);
      await rafraichirSessions();
    } catch (err) {
      setErreurSession(messageErreur(err));
    }
  }

  async function retirerSession(session) {
    setErreurSession('');
    try {
      await supprimerSession(session.id);
      await rafraichirSessions();
    } catch (err) {
      setErreurSession(messageErreur(err));
    }
  }

  const anneeOuverte = annees.find((a) => a.statut === 'ouverte');

  return (
    <div>
      <EnTetePage
        titre="Années académiques"
        description="Le calendrier national. Les établissements y rattachent leurs promotions."
        fil={[{ libelle: 'Référentiel' }, { libelle: 'Années académiques' }]}
      >
        <Bouton icone="add" onClick={() => setModaleAnnee(true)}>
          Nouvelle année
        </Bouton>
      </EnTetePage>

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

      {/* Le blocage le plus coûteux du système, et le plus invisible :
          sans année ouverte, tout le pays est à l'arrêt. */}
      {!anneeOuverte && (
        <div className="mb-5">
          <Encart ton="alerte" titre="Aucune année académique ouverte">
            Tant qu'aucune année n'est ouverte, <strong>aucun établissement</strong> ne peut
            créer de promotion, donc rien ne peut être transmis ni certifié. Créez une année
            puis ouvrez-la.
          </Encart>
        </div>
      )}

      {anneeOuverte && (
        <div className="mb-5">
          <Encart ton="succes" titre={`Année en cours : ${anneeOuverte.libelle}`}>
            Une seule année peut être ouverte à la fois : en ouvrir une autre suppose de
            clôturer celle-ci.
          </Encart>
        </div>
      )}

      <Tableau
        legende="Années académiques"
        chargement={chargement}
        lignes={annees}
        colonnes={[
          {
            cle: 'libelle',
            libelle: 'Année',
            rendu: (a) => <span className="font-medium">{a.libelle}</span>,
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (a) => (
              <Etiquette ton={TONS_ANNEE[a.statut] || 'neutre'}>
                {LIBELLES_STATUT_ANNEE[a.statut] || a.statut}
              </Etiquette>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (a) => (
              <span className="whitespace-nowrap">
                <Bouton variante="discret" onClick={() => ouvrirSessions(a)}>
                  Sessions
                </Bouton>
                {(ACTIONS_ANNEE[a.statut] || []).map((action) => (
                  <Bouton
                    key={action.statut}
                    variante="discret"
                    className="ml-3"
                    onClick={() => appliquerStatutAnnee(a, action.statut)}
                  >
                    {action.libelle}
                  </Bouton>
                ))}
                {a.statut === 'preparation' && (
                  <Bouton
                    variante="discret"
                    className="ml-3 text-erreur hover:text-erreur"
                    onClick={() => retirerAnnee(a)}
                  >
                    Supprimer
                  </Bouton>
                )}
              </span>
            ),
          },
        ]}
        vide={
          <EtatVide
            icone="calendar_month"
            titre="Aucune année académique"
            action={
              <Bouton icone="add" onClick={() => setModaleAnnee(true)}>
                Créer la première année
              </Bouton>
            }
          >
            L'année académique est le socle du calendrier national : tout s'y rattache.
          </EtatVide>
        }
      />

      {/* ── Création d'une année ── */}
      <Modale
        ouvert={modaleAnnee}
        titre="Nouvelle année académique"
        onFermer={() => setModaleAnnee(false)}
      >
        <form onSubmit={soumettreAnnee} className="space-y-4">
          {erreurForm && <Encart ton="erreur">{erreurForm}</Encart>}

          {/* Une année académique n'est pas une chaîne libre : elle couvre
              deux années consécutives. On saisit donc la rentrée, et le
              libellé s'en déduit — impossible d'écrire « 2025-2027 », et
              aucune année n'est hors d'atteinte. */}
          <Champ
            label="Année de rentrée"
            htmlFor="an-rentree"
            requis
            aide={`Le libellé se déduit : 2031 donne « 2031-2032 ». De ${ANNEE_MIN} à ${ANNEE_MAX}.`}
            erreur={
              formAnnee.libelle && dejaCreees.has(formAnnee.libelle)
                ? `L'année « ${formAnnee.libelle} » existe déjà.`
                : ''
            }
          >
            <Saisie
              id="an-rentree"
              type="number"
              required
              min={ANNEE_MIN}
              max={ANNEE_MAX}
              step="1"
              placeholder={String(new Date().getFullYear())}
              value={rentree}
              onChange={(e) => choisirRentree(e.target.value)}
            />
          </Champ>

          {formAnnee.libelle && (
            <p className="text-base font-medium text-gris-900">
              Année académique <span className="tabulaire">{formAnnee.libelle}</span>
            </p>
          )}

          <Encart ton="info">
            L'année est créée en préparation : les établissements ne la voient pas encore.
            Ouvrez-la quand le calendrier est arrêté.
          </Encart>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setModaleAnnee(false)}>
              Annuler
            </Bouton>
            <Bouton
              type="submit"
              enCours={enregistrement}
              disabled={!formAnnee.libelle || dejaCreees.has(formAnnee.libelle)}
            >
              Créer
            </Bouton>
          </div>
        </form>
      </Modale>

      {/* ── Sessions d'une année ── */}
      <Modale
        ouvert={Boolean(anneeSessions)}
        titre={`Sessions — ${anneeSessions?.libelle || ''}`}
        onFermer={() => setAnneeSessions(null)}
        largeur="max-w-3xl"
      >
        {erreurSession && (
          <div className="mb-4">
            <Encart ton="erreur">{erreurSession}</Encart>
          </div>
        )}

        <Tableau
          legende="Sessions de l'année"
          lignes={sessions}
          colonnes={[
            {
              cle: 'type',
              libelle: 'Type',
              rendu: (s) => (
                <span className="font-medium">{LIBELLES_TYPE_SESSION[s.type] || s.type}</span>
              ),
            },
            { cle: 'libelle', libelle: 'Libellé', rendu: (s) => s.libelle || '—' },
            {
              cle: 'periode',
              libelle: 'Période',
              tabulaire: true,
              rendu: (s) => `${dateCourte(s.date_debut)} — ${dateCourte(s.date_fin)}`,
            },
            {
              cle: 'statut',
              libelle: 'Statut',
              rendu: (s) => (
                <Etiquette ton={TONS_SESSION[s.statut] || 'neutre'}>
                  {LIBELLES_STATUT_ANNEE[s.statut] || s.statut}
                </Etiquette>
              ),
            },
            {
              cle: 'actions',
              libelle: 'Actions',
              alignement: 'droite',
              rendu: (s) => (
                <span className="whitespace-nowrap">
                  {(ACTIONS_SESSION[s.statut] || []).map((a) => (
                    <Bouton
                      key={a.statut}
                      variante="discret"
                      onClick={() => appliquerStatutSession(s, a.statut)}
                    >
                      {a.libelle}
                    </Bouton>
                  ))}
                  {s.statut === 'preparation' && (
                    <Bouton
                      variante="discret"
                      className="ml-3 text-erreur hover:text-erreur"
                      onClick={() => retirerSession(s)}
                    >
                      Supprimer
                    </Bouton>
                  )}
                </span>
              ),
            },
          ]}
          vide={
            <EtatVide icone="event" titre="Aucune session">
              Une session découpe l'année : session normale, rattrapage. Une promotion s'y
              rattache pour situer sa délibération.
            </EtatVide>
          }
        />

        {anneeSessions?.statut !== 'cloturee' && (
          <form onSubmit={soumettreSession} className="mt-5 border-t border-gris-200 pt-5">
            <h3 className="mb-3 text-base font-bold">Ajouter une session</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Type" htmlFor="se-type" requis>
                <Liste
                  id="se-type"
                  vide={null}
                  value={formSession.type}
                  onChange={(e) => setFormSession({ ...formSession, type: e.target.value })}
                  options={OPTIONS_TYPE_SESSION}
                />
              </Champ>
              <Champ label="Libellé" htmlFor="se-libelle">
                <Saisie
                  id="se-libelle"
                  placeholder="Session normale 2026"
                  value={formSession.libelle}
                  onChange={(e) => setFormSession({ ...formSession, libelle: e.target.value })}
                />
              </Champ>
              <Champ label="Date de début" htmlFor="se-debut" requis>
                <Saisie
                  id="se-debut"
                  type="date"
                  required
                  value={formSession.date_debut}
                  onChange={(e) => setFormSession({ ...formSession, date_debut: e.target.value })}
                />
              </Champ>
              <Champ label="Date de fin" htmlFor="se-fin" requis>
                <Saisie
                  id="se-fin"
                  type="date"
                  required
                  value={formSession.date_fin}
                  onChange={(e) => setFormSession({ ...formSession, date_fin: e.target.value })}
                />
              </Champ>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="flex items-start gap-1.5 text-sm text-gris-500">
                <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
                Les dates doivent tomber dans celles de l'année.
              </p>
              <Bouton type="submit" icone="add">
                Ajouter
              </Bouton>
            </div>
          </form>
        )}
      </Modale>
    </div>
  );
}
