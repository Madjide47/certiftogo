// ─────────────────────────────────────────────────────────────
// Annuaire des établissements agréés, et leurs HABILITATIONS.
//
// L'habilitation est le cœur du contrôle automatique : elle dit quel type
// de diplôme un établissement a le droit de délivrer, et entre quelles
// dates. Un lot contenant un master alors que l'établissement n'est
// habilité que pour la licence est bloqué à l'instruction.
//
// Elle existait en base et dans les contrôles depuis le début, sans
// aucune interface : personne ne pouvait ni la consulter ni l'accorder.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { listerEtablissementsMinistere } from '../../services/ministere.service.js';
import {
  listerHabilitations,
  accorderHabilitation,
  changerStatutHabilitation,
} from '../../services/gouvernance.service.js';
import {
  LIBELLES_TYPE_ETABLISSEMENT,
  LIBELLES_STATUT_ETABLISSEMENT,
  LIBELLES_TYPE_DIPLOME,
  OPTIONS_TYPE_DIPLOME,
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
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';

const TONS_ETABLISSEMENT = {
  actif: 'succes',
  suspendu: 'alerte',
  ferme: 'erreur',
};

const TONS_HABILITATION = {
  active: 'succes',
  suspendue: 'alerte',
  expiree: 'neutre',
  retiree: 'erreur',
};

const LIBELLES_HABILITATION = {
  active: 'Active',
  suspendue: 'Suspendue',
  expiree: 'Expirée',
  retiree: 'Retirée',
};

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const HABILITATION_VIDE = {
  type_diplome: 'licence',
  reference_arrete: '',
  date_debut: aujourdhui(),
  date_fin: '',
};

export default function EtablissementsPage() {
  const [etablissements, setEtablissements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const [ouvert, setOuvert] = useState(null); // établissement sélectionné
  const [habilitations, setHabilitations] = useState(null);
  const [form, setForm] = useState(null);
  const [action, setAction] = useState(false);

  useEffect(() => {
    listerEtablissementsMinistere()
      .then(setEtablissements)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  async function ouvrirHabilitations(etablissement) {
    setOuvert(etablissement);
    setHabilitations(null);
    setForm(null);
    try {
      setHabilitations(await listerHabilitations(etablissement.id));
    } catch (err) {
      setErreur(messageErreur(err));
      setOuvert(null);
    }
  }

  async function rafraichir() {
    setHabilitations(await listerHabilitations(ouvert.id));
  }

  async function soumettre(e) {
    e.preventDefault();
    setAction(true);
    setErreur('');
    try {
      await accorderHabilitation(ouvert.id, {
        ...form,
        date_fin: form.date_fin || undefined,
      });
      setForm(null);
      setSucces(
        `${ouvert.nom} est désormais habilité à délivrer : ${LIBELLES_TYPE_DIPLOME[form.type_diplome]}.`
      );
      await rafraichir();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  async function changerStatut(habilitation, statut) {
    const verbe = statut === 'retiree' ? 'Retirer' : 'Suspendre';
    const motif = window.prompt(
      `${verbe} l'habilitation « ${LIBELLES_TYPE_DIPLOME[habilitation.type_diplome]} » ?\n\nMotif :`
    );
    if (motif === null) return;
    setErreur('');
    try {
      await changerStatutHabilitation(habilitation.id, statut, motif);
      setSucces(
        `Habilitation ${statut === 'retiree' ? 'retirée' : 'suspendue'}. ` +
          "L'établissement ne pourra plus transmettre ce type de diplôme."
      );
      await rafraichir();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  const typesDejaAccordes = new Set(
    (habilitations || []).filter((h) => h.statut === 'active').map((h) => h.type_diplome)
  );

  return (
    <div>
      <EnTetePage
        titre="Établissements"
        description="Les institutions agréées et ce qu'elles sont autorisées à délivrer."
        fil={[{ libelle: 'Référentiel' }, { libelle: 'Établissements' }]}
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

      <p className="mb-2 text-sm text-gris-500">
        {etablissements.length} établissement(s). Un nouvel établissement entre par une{' '}
        <a href="/demandes" className="text-vert underline underline-offset-2">
          demande d'intégration
        </a>
        .
      </p>

      <Tableau
        legende="Établissements agréés"
        chargement={chargement}
        lignes={etablissements}
        colonnes={[
          {
            cle: 'code',
            libelle: 'Code',
            tabulaire: true,
            rendu: (e) => <span className="font-medium">{e.code || '—'}</span>,
          },
          {
            cle: 'nom',
            libelle: 'Établissement',
            rendu: (e) => (
              <span>
                <span className="font-medium">{e.nom}</span>
                <span className="block text-xs text-gris-500">
                  {LIBELLES_TYPE_ETABLISSEMENT[e.type] || e.type} — {e.ville}
                </span>
              </span>
            ),
          },
          {
            cle: 'contact',
            libelle: 'Contact',
            rendu: (e) => e.email || e.telephone || '—',
          },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (e) => (
              <Etiquette ton={TONS_ETABLISSEMENT[e.statut] || 'neutre'}>
                {LIBELLES_STATUT_ETABLISSEMENT[e.statut] || e.statut}
              </Etiquette>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Actions',
            alignement: 'droite',
            rendu: (e) => (
              <Bouton variante="discret" onClick={() => ouvrirHabilitations(e)}>
                Habilitations
              </Bouton>
            ),
          },
        ]}
        vide={
          <EtatVide icone="account_balance" titre="Aucun établissement agréé">
            Les établissements arrivent par les demandes d'intégration déposées sur le site
            public.
          </EtatVide>
        }
      />

      {/* ── Habilitations ── */}
      <Modale
        ouvert={Boolean(ouvert)}
        titre={`Habilitations — ${ouvert?.nom || ''}`}
        onFermer={() => setOuvert(null)}
        largeur="max-w-3xl"
      >
        {habilitations === null ? (
          <Chargement />
        ) : (
          <>
            <div className="mb-4">
              <Encart ton="info">
                Un établissement ne peut transmettre que les types de diplômes pour lesquels il
                est habilité, et seulement pendant la période d'habilitation. Le contrôle est
                automatique à l'instruction du lot.
              </Encart>
            </div>

            <Tableau
              legende="Habilitations de l'établissement"
              lignes={habilitations}
              colonnes={[
                {
                  cle: 'type_diplome',
                  libelle: 'Type de diplôme',
                  rendu: (h) => (
                    <span className="font-medium">
                      {LIBELLES_TYPE_DIPLOME[h.type_diplome] || h.type_diplome}
                    </span>
                  ),
                },
                {
                  cle: 'reference_arrete',
                  libelle: 'Arrêté',
                  rendu: (h) => h.reference_arrete || '—',
                },
                {
                  cle: 'periode',
                  libelle: 'Période',
                  tabulaire: true,
                  rendu: (h) => (
                    <span>
                      du {date(h.date_debut)}
                      {h.date_fin ? ` au ${date(h.date_fin)}` : ' — sans terme'}
                    </span>
                  ),
                },
                {
                  cle: 'statut',
                  libelle: 'Statut',
                  rendu: (h) => (
                    <Etiquette ton={TONS_HABILITATION[h.statut] || 'neutre'}>
                      {LIBELLES_HABILITATION[h.statut] || h.statut}
                    </Etiquette>
                  ),
                },
                {
                  cle: 'actions',
                  libelle: 'Actions',
                  alignement: 'droite',
                  rendu: (h) =>
                    h.statut === 'active' ? (
                      <span className="whitespace-nowrap">
                        <Bouton
                          variante="discret"
                          onClick={() => changerStatut(h, 'suspendue')}
                        >
                          Suspendre
                        </Bouton>
                        <Bouton
                          variante="discret"
                          className="ml-3 text-erreur hover:text-erreur"
                          onClick={() => changerStatut(h, 'retiree')}
                        >
                          Retirer
                        </Bouton>
                      </span>
                    ) : (
                      <span className="text-gris-500">—</span>
                    ),
                },
              ]}
              vide={
                <EtatVide icone="gavel" titre="Aucune habilitation">
                  Cet établissement ne peut transmettre aucun diplôme tant qu'aucune
                  habilitation ne lui est accordée.
                </EtatVide>
              }
            />

            {form ? (
              <form onSubmit={soumettre} className="mt-5 border-t border-gris-200 pt-5">
                <h3 className="mb-3 text-base font-bold">Accorder une habilitation</h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ
                    label="Type de diplôme"
                    htmlFor="h-type"
                    requis
                    aide={
                      typesDejaAccordes.has(form.type_diplome)
                        ? 'Une habilitation active existe déjà pour ce type.'
                        : undefined
                    }
                  >
                    <Liste
                      id="h-type"
                      vide={null}
                      value={form.type_diplome}
                      onChange={(e) => setForm({ ...form, type_diplome: e.target.value })}
                      options={OPTIONS_TYPE_DIPLOME}
                    />
                  </Champ>
                  <Champ
                    label="Référence de l'arrêté"
                    htmlFor="h-arrete"
                    aide="L'acte qui fonde l'habilitation."
                  >
                    <Saisie
                      id="h-arrete"
                      placeholder="N° 2026-042/MESR"
                      value={form.reference_arrete}
                      onChange={(e) => setForm({ ...form, reference_arrete: e.target.value })}
                    />
                  </Champ>
                  <Champ label="Date de début" htmlFor="h-debut" requis>
                    <Saisie
                      id="h-debut"
                      type="date"
                      required
                      value={form.date_debut}
                      onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
                    />
                  </Champ>
                  <Champ
                    label="Date de fin"
                    htmlFor="h-fin"
                    aide="Laissez vide pour une habilitation sans terme."
                  >
                    <Saisie
                      id="h-fin"
                      type="date"
                      value={form.date_fin}
                      onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
                    />
                  </Champ>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Bouton variante="neutre" onClick={() => setForm(null)}>
                    Annuler
                  </Bouton>
                  <Bouton
                    type="submit"
                    enCours={action}
                    disabled={typesDejaAccordes.has(form.type_diplome)}
                  >
                    Accorder
                  </Bouton>
                </div>
              </form>
            ) : (
              <div className="mt-5 flex justify-between gap-2 border-t border-gris-200 pt-5">
                <p className="flex items-start gap-1.5 text-sm text-gris-500">
                  <Icone nom="gavel" taille={16} className="mt-0.5 shrink-0" />
                  Retirer une habilitation n'invalide pas les diplômes déjà certifiés : elle
                  vise l'avenir, pas le passé.
                </p>
                <Bouton icone="add" onClick={() => setForm(HABILITATION_VIDE)}>
                  Accorder
                </Bouton>
              </div>
            )}
          </>
        )}
      </Modale>
    </div>
  );
}
