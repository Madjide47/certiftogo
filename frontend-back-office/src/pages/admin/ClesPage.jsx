// ─────────────────────────────────────────────────────────────
// Registre des clés de signature (ERR-006).
//
// La clé n'apparaît jamais ici — seulement son EMPREINTE, qui suffit à
// vérifier qu'on parle de la même sans rien révéler. C'est aussi la
// réponse à l'objection du jury : « qui détient la clé du ministère ? »
// La plateforme sait laquelle a signé quoi ; elle ne la montre pas.
//
// Déclarer une compromission ne répare rien et ne prétend pas le faire :
// la nouvelle clé s'installe hors application. La procédure fige le
// constat — combien de diplômes sont à re-signer — et alerte.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  etatCles,
  enregistrerCleCourante,
  declarerCompromission,
} from '../../services/cles.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Bouton,
  Champ,
  Zone,
  Modale,
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';

const TONS = { active: 'succes', retiree: 'neutre', compromise: 'erreur' };
const LIBELLES = { active: 'Active', retiree: 'Retirée', compromise: 'Compromise' };

const EMPLACEMENTS = {
  variable_environnement: 'Variable d’environnement du serveur',
  kms: 'Service de gestion de clés (KMS)',
  hsm: 'Module matériel (HSM)',
};

const horodatage = (v) =>
  v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const courte = (empreinte) => (empreinte ? `${empreinte.slice(0, 16)}…` : '—');

export default function ClesPage() {
  const [etat, setEtat] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [compromission, setCompromission] = useState(null);
  const [motif, setMotif] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setEtat(await etatCles());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function enregistrer() {
    setEnCours(true);
    setErreur('');
    setMessage('');
    try {
      await enregistrerCleCourante();
      setMessage('La clé en vigueur est désormais inscrite au registre.');
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  async function declarer() {
    setEnCours(true);
    setErreur('');
    try {
      const resultat = await declarerCompromission({
        empreinte: compromission.empreinte,
        motif: motif.trim(),
      });
      setCompromission(null);
      setMotif('');
      setMessage(
        `Compromission enregistrée. ${resultat?.diplomes ?? 0} diplôme(s) ont été signés avec cette clé et doivent être re-signés après installation de la nouvelle.`
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  const cles = etat?.cles || [];
  const courante = etat?.empreinte_courante;
  const inscrite = cles.some((c) => c.empreinte === courante);

  return (
    <div>
      <EnTetePage
        titre="Clés de signature"
        description="Registre des clés qui ont signé des diplômes. Les clés elles-mêmes ne sont jamais exposées."
        fil={[{ libelle: 'Système' }, { libelle: 'Clés de signature' }]}
      >
        <Bouton variante="secondaire" icone="refresh" onClick={charger}>
          Actualiser
        </Bouton>
      </EnTetePage>

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Encart ton="succes">{message}</Encart>
        </div>
      )}

      {chargement ? (
        <Chargement />
      ) : (
        <>
          <div className="mb-5 border border-gris-300 bg-white">
            <div className="border-b border-gris-200 bg-gris-100 px-5 py-2.5">
              <p className="text-sm font-bold text-gris-700">Clé en vigueur</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="break-all font-mono text-sm text-gris-900">{courante || '—'}</p>
                <p className="mt-1 text-sm text-gris-500">
                  Conservée dans :{' '}
                  {EMPLACEMENTS[etat?.emplacement_configure] || etat?.emplacement_configure}
                </p>
              </div>
              {!inscrite && courante && (
                <Bouton icone="add" onClick={enregistrer} enCours={enCours}>
                  Inscrire au registre
                </Bouton>
              )}
            </div>
          </div>

          {etat?.emplacement_configure === 'variable_environnement' && (
            <div className="mb-5">
              <Encart ton="alerte" titre="Clé hébergée par le serveur applicatif">
                Le secret vit dans une variable d’environnement : quiconque accède au serveur
                accède à la capacité de signer. Le cheminement prévu est un KMS ou un HSM, où la
                clé signe sans jamais sortir. Limite assumée à ce stade, et déclarée comme telle.
              </Encart>
            </div>
          )}

          <Tableau
            legende="Registre des clés"
            lignes={cles}
            colonnes={[
              {
                cle: 'empreinte',
                libelle: 'Empreinte',
                tabulaire: true,
                rendu: (c) => (
                  <span>
                    <span className="font-mono text-xs">{courte(c.empreinte)}</span>
                    {c.empreinte === courante && (
                      <span className="block text-xs text-vert">clé en vigueur</span>
                    )}
                  </span>
                ),
              },
              { cle: 'algorithme', libelle: 'Algorithme' },
              {
                cle: 'emplacement',
                libelle: 'Conservation',
                rendu: (c) => EMPLACEMENTS[c.emplacement] || c.emplacement,
              },
              {
                cle: 'diplomes',
                libelle: 'Diplômes signés',
                alignement: 'droite',
                tabulaire: true,
              },
              {
                cle: 'date_activation',
                libelle: 'Active depuis',
                tabulaire: true,
                rendu: (c) => horodatage(c.date_activation),
              },
              {
                cle: 'statut',
                libelle: 'Statut',
                rendu: (c) => (
                  <span>
                    <Etiquette ton={TONS[c.statut] || 'neutre'}>
                      {LIBELLES[c.statut] || c.statut}
                    </Etiquette>
                    {c.motif_retrait && (
                      <span className="mt-0.5 block text-xs text-gris-500">{c.motif_retrait}</span>
                    )}
                  </span>
                ),
              },
              {
                cle: 'actions',
                libelle: '',
                alignement: 'droite',
                rendu: (c) =>
                  c.statut === 'active' ? (
                    <Bouton
                      variante="discret"
                      className="text-erreur hover:text-erreur"
                      onClick={() => setCompromission(c)}
                    >
                      Déclarer compromise
                    </Bouton>
                  ) : null,
              },
            ]}
            vide={
              <EtatVide icone="key" titre="Aucune clé enregistrée">
                Inscrivez la clé en vigueur pour commencer le registre : sans lui, on ne saura pas
                quels diplômes re-signer en cas de compromission.
              </EtatVide>
            }
          />

          <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
            <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
            Un diplôme signé avec une clé retirée reste valable : c’est son hash ancré sur la
            blockchain qui fait foi, pas la disponibilité de la clé.
          </p>
        </>
      )}

      <Modale
        ouvert={Boolean(compromission)}
        titre="Déclarer une clé compromise"
        onFermer={() => setCompromission(null)}
        largeur="max-w-xl"
      >
        <Encart ton="alerte" titre="Cette déclaration ne répare rien">
          Elle fige le constat et alerte. La nouvelle clé doit être installée hors application ;
          les {compromission?.diplomes ?? 0} diplôme(s) signés avec celle-ci devront ensuite être
          re-signés. Aucune signature n’est refaite automatiquement.
        </Encart>

        <div className="mt-4">
          <Champ
            label="Circonstances"
            htmlFor="motif-cle"
            requis
            aide="Ce texte reste au journal : il documentera l’incident bien après."
          >
            <Zone id="motif-cle" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </Champ>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={() => setCompromission(null)}>
            Annuler
          </Bouton>
          <Bouton
            variante="danger"
            icone="gpp_bad"
            enCours={enCours}
            disabled={!motif.trim()}
            onClick={declarer}
          >
            Déclarer la compromission
          </Bouton>
        </div>
      </Modale>
    </div>
  );
}
