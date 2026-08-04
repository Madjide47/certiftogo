// ─────────────────────────────────────────────────────────────
// Diplômes certifiés — consultation, correction, révocation.
//
// Deux actions se ressemblent et ne doivent surtout pas être confondues :
//
//   RÉVOQUER  — le diplôme est retiré à son titulaire. Fraude, annulation
//               administrative. Il devient invalide à la vérification.
//   CORRIGER  — le diplôme reste dû, une donnée était fausse. On ne
//               modifie pas le diplôme : son hash est ancré on-chain et
//               ne peut pas changer. On révoque l'ancien et on en émet un
//               NOUVEAU, chaîné au précédent.
//
// L'écran nomme cette différence, parce que se tromper de bouton retire
// un diplôme à quelqu'un qui y a droit.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  listerDiplomes,
  revoquerDiplome,
  corrigerDiplome,
  versionsDiplome,
  controlerSignature,
} from '../../services/ministere.service.js';
import {
  LIBELLES_STATUT_DIPLOME,
  LIBELLES_TYPE_DIPLOME,
  OPTIONS_TYPE_DIPLOME,
  OPTIONS_MENTION,
  LIBELLES_MENTION,
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
  Zone,
  Chargement,
  Onglets,
  Icone,
} from '../../components/ui/index.jsx';

const TONS = {
  actif: 'vert',
  revoque: 'erreur',
  remplace: 'neutre',
};

const ONGLETS = [
  { cle: '', libelle: 'Tous' },
  { cle: 'actif', libelle: 'En vigueur' },
  { cle: 'revoque', libelle: 'Révoqués' },
  { cle: 'remplace', libelle: 'Remplacés' },
];

const TYPES_CORRECTION = [
  {
    value: 'erreur_donnees',
    label: 'Erreur de saisie',
    aide: "Une donnée est fausse depuis l'origine : orthographe, mention, date.",
  },
  {
    value: 'changement_nom',
    label: 'Changement de nom',
    aide: 'Mariage, décision de justice, rectification d’état civil.',
  },
  { value: 'autre', label: 'Autre', aide: 'Précisez la raison dans le motif.' },
];

const CHAMPS = [
  { cle: 'nom', label: 'Nom' },
  { cle: 'prenom', label: 'Prénom' },
  { cle: 'date_naissance', label: 'Date de naissance', type: 'date' },
  { cle: 'lieu_naissance', label: 'Lieu de naissance' },
  { cle: 'filiere', label: 'Filière' },
  { cle: 'parcours', label: 'Parcours' },
  { cle: 'mention', label: 'Mention', options: OPTIONS_MENTION },
  { cle: 'type_diplome', label: 'Type de diplôme', options: OPTIONS_TYPE_DIPLOME },
  { cle: 'date_obtention', label: "Date d'obtention", type: 'date' },
];

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function DiplomesPage() {
  const [diplomes, setDiplomes] = useState([]);
  const [onglet, setOnglet] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [action, setAction] = useState(false);

  const [revocCible, setRevocCible] = useState(null);
  const [motif, setMotif] = useState('');

  const [correction, setCorrection] = useState(null);
  const [formCorr, setFormCorr] = useState(null);

  const [historique, setHistorique] = useState(null);
  const [signature, setSignature] = useState(null);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setDiplomes(await listerDiplomes({ statut: onglet }));
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

  async function confirmerRevoc(e) {
    e.preventDefault();
    setAction(true);
    setErreur('');
    try {
      const res = await revoquerDiplome(revocCible.id, motif.trim());
      setRevocCible(null);
      setMotif('');
      setSucces(
        res?.en_attente_validation
          ? 'Révocation soumise au contrôle à quatre yeux : un second agent doit approuver.'
          : 'Diplôme révoqué. La vérification publique le signale désormais comme invalide.'
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  function ouvrirCorrection(d) {
    setCorrection(d);
    setFormCorr({ type: 'erreur_donnees', motif: '', corrections: {} });
  }

  function majCorrection(cle, valeur) {
    setFormCorr((f) => {
      const corrections = { ...f.corrections };
      if (valeur === '') delete corrections[cle];
      else corrections[cle] = valeur;
      return { ...f, corrections };
    });
  }

  async function confirmerCorrection(e) {
    e.preventDefault();
    setAction(true);
    setErreur('');
    try {
      const res = await corrigerDiplome(correction.id, formCorr);
      setCorrection(null);
      setSucces(
        `Nouveau diplôme ${res.diplome?.reference || ''} émis en version ${res.diplome?.version || 2}. ` +
          "L'ancien est marqué « remplacé » et son hash révoqué on-chain."
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setAction(false);
    }
  }

  async function ouvrirHistorique(d) {
    setHistorique({ diplome: d, data: null });
    try {
      setHistorique({ diplome: d, data: await versionsDiplome(d.id) });
    } catch (err) {
      setErreur(messageErreur(err));
      setHistorique(null);
    }
  }

  /**
   * Contrôle de signature (L-10). La réponse est volontairement à trois
   * états : conforme, non conforme, ou incontrôlable parce que la clé
   * signataire n'est plus celle en vigueur — ce dernier cas n'est PAS
   * une alerte de fraude.
   */
  async function verifierSignature(d) {
    setSignature({ diplome: d, data: null });
    try {
      setSignature({ diplome: d, data: await controlerSignature(d.id) });
    } catch (err) {
      setErreur(messageErreur(err));
      setSignature(null);
    }
  }

  const nbCorrections = Object.keys(formCorr?.corrections || {}).length;

  return (
    <div>
      <EnTetePage
        titre="Diplômes"
        description="Les diplômes émis par le ministère et leur état actuel."
        fil={[{ libelle: 'Certification' }, { libelle: 'Diplômes' }]}
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

      <Onglets onglets={ONGLETS} actif={onglet} onChanger={setOnglet} />

      <Tableau
        legende="Diplômes certifiés"
        chargement={chargement}
        lignes={diplomes}
        colonnes={[
          {
            cle: 'reference',
            libelle: 'Référence',
            tabulaire: true,
            rendu: (d) => (
              <span>
                <span className="font-medium">{d.reference}</span>
                {d.version > 1 && (
                  <span className="block text-xs text-gris-500">version {d.version}</span>
                )}
              </span>
            ),
          },
          {
            cle: 'titulaire',
            libelle: 'Titulaire',
            rendu: (d) => (
              <span>
                <span className="font-medium">{d.candidat_nom}</span> {d.candidat_prenom}
                {d.mention && (
                  <span className="block text-xs text-gris-500">
                    mention {LIBELLES_MENTION[d.mention]}
                  </span>
                )}
              </span>
            ),
          },
          {
            cle: 'type_diplome',
            libelle: 'Diplôme',
            rendu: (d) => LIBELLES_TYPE_DIPLOME[d.type_diplome] || '—',
          },
          { cle: 'etablissement_nom', libelle: 'Établissement' },
          {
            cle: 'statut',
            libelle: 'Statut',
            rendu: (d) => (
              <span>
                <Etiquette ton={TONS[d.statut] || 'neutre'}>
                  {LIBELLES_STATUT_DIPLOME[d.statut] || d.statut}
                </Etiquette>
                {d.motif_revocation && (
                  <span className="block max-w-xs text-xs text-erreur">
                    {d.motif_revocation}
                  </span>
                )}
              </span>
            ),
          },
          {
            cle: 'actions',
            libelle: 'Documents et actions',
            alignement: 'droite',
            rendu: (d) => (
              <span className="whitespace-nowrap">
                {d.pdf_url && (
                  <a
                    href={d.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-vert underline underline-offset-2 hover:text-vert-fonce"
                  >
                    PDF
                  </a>
                )}
                {d.qr_code_url && (
                  <a
                    href={d.qr_code_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-3 text-vert underline underline-offset-2 hover:text-vert-fonce"
                  >
                    QR
                  </a>
                )}
                {(d.version > 1 || d.statut === 'remplace') && (
                  <Bouton
                    variante="discret"
                    className="ml-3"
                    onClick={() => ouvrirHistorique(d)}
                  >
                    Versions
                  </Bouton>
                )}
                <Bouton variante="discret" className="ml-3" onClick={() => verifierSignature(d)}>
                  Signature
                </Bouton>
                {d.statut === 'actif' && (
                  <>
                    <Bouton
                      variante="discret"
                      className="ml-3"
                      onClick={() => ouvrirCorrection(d)}
                    >
                      Corriger
                    </Bouton>
                    <Bouton
                      variante="discret"
                      className="ml-3 text-erreur hover:text-erreur"
                      onClick={() => {
                        setRevocCible(d);
                        setMotif('');
                      }}
                    >
                      Révoquer
                    </Bouton>
                  </>
                )}
              </span>
            ),
          },
        ]}
        vide={
          <EtatVide icone="school" titre="Aucun diplôme">
            Les diplômes apparaissent ici une fois un lot certifié depuis « Lots reçus ».
          </EtatVide>
        }
      />

      {/* ── Révocation ── */}
      <Modale
        ouvert={Boolean(revocCible)}
        titre={`Révoquer ${revocCible?.reference || ''}`}
        onFermer={() => setRevocCible(null)}
      >
        <form onSubmit={confirmerRevoc} className="space-y-4">
          <Encart ton="erreur" titre="Le diplôme est retiré à son titulaire">
            La révocation est inscrite sur la blockchain et rend le diplôme invalide à la
            vérification publique. Elle ne s'annule pas.
            <p className="mt-2">
              Si le diplôme reste dû et qu'il s'agit seulement d'une donnée fausse, utilisez{' '}
              <strong>Corriger</strong> : une nouvelle version sera émise.
            </p>
          </Encart>

          <Champ
            label="Motif de révocation"
            htmlFor="motif-revoc"
            requis
            aide="Conservé au journal et opposable en cas de contestation."
          >
            <Zone
              id="motif-revoc"
              rows={4}
              required
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </Champ>

          <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
            <Bouton variante="neutre" onClick={() => setRevocCible(null)}>
              Annuler
            </Bouton>
            <Bouton type="submit" variante="danger" enCours={action} disabled={!motif.trim()}>
              Révoquer définitivement
            </Bouton>
          </div>
        </form>
      </Modale>

      {/* ── Correction ── */}
      <Modale
        ouvert={Boolean(correction)}
        titre={`Corriger ${correction?.reference || ''}`}
        onFermer={() => setCorrection(null)}
        largeur="max-w-3xl"
      >
        {formCorr && (
          <form onSubmit={confirmerCorrection} className="space-y-4">
            <Encart ton="info" titre="Une correction émet un nouveau diplôme">
              Le hash de ce diplôme est ancré sur la blockchain : il ne peut pas être modifié.
              Le ministère révoque donc l'ancien et en émet un nouveau, lié au précédent. Le
              titulaire conserve la trace des deux.
            </Encart>

            <Champ
              label="Nature de la correction"
              htmlFor="c-type"
              requis
              aide={TYPES_CORRECTION.find((t) => t.value === formCorr.type)?.aide}
            >
              <Liste
                id="c-type"
                vide={null}
                value={formCorr.type}
                onChange={(e) => setFormCorr({ ...formCorr, type: e.target.value })}
                options={TYPES_CORRECTION}
              />
            </Champ>

            <fieldset>
              <legend className="text-base font-medium text-gris-900">Champs à corriger</legend>
              <p className="mt-0.5 mb-2 text-sm text-gris-500">
                Ne remplissez que ce qui change. Les champs laissés vides sont repris à
                l'identique.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {CHAMPS.map((c) => (
                  <Champ
                    key={c.cle}
                    label={c.label}
                    htmlFor={`c-${c.cle}`}
                    aide={
                      correction[c.cle] || correction[`candidat_${c.cle}`]
                        ? `Actuel : ${correction[c.cle] || correction[`candidat_${c.cle}`]}`
                        : undefined
                    }
                  >
                    {c.options ? (
                      <Liste
                        id={`c-${c.cle}`}
                        vide="Inchangé"
                        value={formCorr.corrections[c.cle] || ''}
                        onChange={(e) => majCorrection(c.cle, e.target.value)}
                        options={c.options}
                      />
                    ) : (
                      <Saisie
                        id={`c-${c.cle}`}
                        type={c.type}
                        placeholder="Inchangé"
                        value={formCorr.corrections[c.cle] || ''}
                        onChange={(e) => majCorrection(c.cle, e.target.value)}
                      />
                    )}
                  </Champ>
                ))}
              </div>
            </fieldset>

            <Champ
              label="Motif"
              htmlFor="c-motif"
              requis
              aide="C'est lui qui justifiera le remplacement en cas de contestation."
            >
              <Zone
                id="c-motif"
                rows={3}
                required
                value={formCorr.motif}
                onChange={(e) => setFormCorr({ ...formCorr, motif: e.target.value })}
              />
            </Champ>

            <div className="flex justify-end gap-2 border-t border-gris-200 pt-4">
              <Bouton variante="neutre" onClick={() => setCorrection(null)}>
                Annuler
              </Bouton>
              <Bouton
                type="submit"
                enCours={action}
                disabled={nbCorrections === 0 || !formCorr.motif.trim()}
                title={nbCorrections === 0 ? 'Renseignez au moins un champ' : undefined}
              >
                Émettre la nouvelle version
              </Bouton>
            </div>
          </form>
        )}
      </Modale>

      {/* ── Contrôle de signature ── */}
      <Modale
        ouvert={Boolean(signature)}
        titre={`Signature — ${signature?.diplome?.reference || ''}`}
        onFermer={() => setSignature(null)}
        largeur="max-w-2xl"
      >
        {!signature?.data ? (
          <Chargement libelle="Contrôle en cours…" />
        ) : (
          <>
            {signature.data.signature_conforme === true && (
              <Encart ton="succes" titre="Signature conforme">
                L’empreinte du diplôme, recalculée avec la clé en vigueur, correspond à la
                signature enregistrée. Le document n’a pas été altéré en base.
              </Encart>
            )}
            {signature.data.signature_conforme === false && (
              <Encart ton="erreur" titre="Signature non conforme">
                La signature enregistrée ne correspond pas à l’empreinte du diplôme. Signalez-le
                immédiatement à l’administration système : une donnée a été modifiée hors des
                circuits de l’application.
              </Encart>
            )}
            {signature.data.signature_conforme === null && (
              <Encart ton="info" titre="Signature non recontrôlable">
                {signature.data.message}
              </Encart>
            )}

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-gris-500">Empreinte du diplôme</dt>
                <dd className="break-all font-mono text-xs">{signature.data.hash}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gris-500">Clé signataire</dt>
                <dd className="break-all font-mono text-xs">
                  {signature.data.cle_signature?.empreinte || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gris-500">État de la clé</dt>
                <dd>
                  {signature.data.cle_signature ? (
                    <Etiquette
                      ton={signature.data.cle_signature.en_vigueur ? 'succes' : 'neutre'}
                    >
                      {signature.data.cle_signature.en_vigueur ? 'En vigueur' : 'Retirée'}
                    </Etiquette>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>

            <p className="mt-4 flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="link" taille={16} className="mt-0.5 shrink-0" />
              La validité d’un diplôme repose sur son ancrage blockchain. La signature atteste que
              la copie conservée en base n’a pas bougé depuis l’émission.
            </p>
          </>
        )}
      </Modale>

      {/* ── Historique des versions ── */}
      <Modale
        ouvert={Boolean(historique)}
        titre={`Versions — ${historique?.diplome?.reference || ''}`}
        onFermer={() => setHistorique(null)}
        largeur="max-w-4xl"
      >
        {!historique?.data ? (
          <Chargement />
        ) : (
          <>
            <Tableau
              legende="Chaîne des versions"
              lignes={historique.data.versions || []}
              colonnes={[
                {
                  cle: 'version',
                  libelle: 'Version',
                  tabulaire: true,
                  rendu: (v) => <span className="font-medium">v{v.version}</span>,
                },
                { cle: 'reference', libelle: 'Référence', tabulaire: true },
                {
                  cle: 'statut',
                  libelle: 'Statut',
                  rendu: (v) => (
                    <Etiquette ton={TONS[v.statut] || 'neutre'}>
                      {LIBELLES_STATUT_DIPLOME[v.statut] || v.statut}
                    </Etiquette>
                  ),
                },
                {
                  cle: 'hash_sha256',
                  libelle: 'Empreinte',
                  rendu: (v) => (
                    <code className="font-mono text-xs">{v.hash_sha256?.slice(0, 16)}…</code>
                  ),
                },
                {
                  cle: 'date_certification',
                  libelle: 'Émis le',
                  rendu: (v) => horodatage(v.date_certification),
                },
              ]}
            />

            {(historique.data.corrections || []).length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-base font-bold">Corrections appliquées</h3>
                {historique.data.corrections.map((c) => (
                  <div key={c.id} className="mb-3 border border-gris-300 bg-white p-3">
                    <p className="text-sm">
                      <span className="font-medium">
                        {TYPES_CORRECTION.find((t) => t.value === c.type)?.label || c.type}
                      </span>{' '}
                      — {horodatage(c.date_correction)}
                    </p>
                    <p className="mt-1 text-sm text-gris-700">{c.motif}</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-bold text-gris-500">Avant</p>
                        <pre className="overflow-x-auto border border-gris-200 bg-gris-50 p-2 font-mono text-xs">
                          {JSON.stringify(c.valeurs_avant, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gris-500">Après</p>
                        <pre className="overflow-x-auto border border-gris-200 bg-gris-50 p-2 font-mono text-xs">
                          {JSON.stringify(c.valeurs_apres, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="link" taille={16} className="mt-0.5 shrink-0" />
              Le contrat blockchain ne connaît pas la notion de remplacement : chaque version y
              existe comme un hash distinct, l'ancien révoqué, le nouveau valide. Le lien entre
              les deux est conservé ici.
            </p>
          </>
        )}
      </Modale>
    </div>
  );
}
