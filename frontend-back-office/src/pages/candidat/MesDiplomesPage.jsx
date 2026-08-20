// ─────────────────────────────────────────────────────────────
// Fiches détaillées des diplômes du titulaire.
//
// L'écran est construit autour d'un geste unique : PARTAGER LA PREUVE.
// Un diplômé ne montre pas un PDF — n'importe qui peut en fabriquer un —
// il donne un lien que le tiers vérifie lui-même. Le lien de vérification
// est donc l'action principale, le PDF vient après.
//
// Un diplôme révoqué reste affiché, motif visible. L'effacer rendrait
// service à personne : le tiers qui scanne l'ancien QR verra la
// révocation de toute façon, et mieux vaut que le titulaire l'apprenne
// ici que devant un employeur.
// ─────────────────────────────────────────────────────────────
import { adressePublique, urlFichier } from '../../services/adresse-api.js';
import { useEffect, useState } from 'react';
import { listerMesDiplomes } from '../../services/portefeuille.service.js';
import {
  LIBELLES_TYPE_DIPLOME,
  LIBELLES_MENTION,
  messageErreur,
} from '../../utils/libelles.js';
import { EtiquetteStatut } from './PortefeuillePage.jsx';

import {
  EnTetePage,
  Encart,
  EtatVide,
  Bouton,
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';

const URL_PUBLIC = adressePublique();

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

function Ligne({ label, valeur }) {
  if (!valeur) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-gris-200 py-2 last:border-0">
      <dt className="text-sm text-gris-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-gris-900">{valeur}</dd>
    </div>
  );
}

function CarteDiplome({ d, onCopie }) {
  const revoque = d.statut === 'revoque';
  const enAttente = d.statut === 'en_attente_ancrage';
  const lien = d.hash ? `${URL_PUBLIC}/verifier/${d.hash}` : null;

  return (
    <article
      className={`border bg-white ${revoque ? 'border-erreur/40' : 'border-gris-300'}`}
    >
      {revoque && (
        <p className="bg-erreur px-4 py-1.5 text-sm font-bold text-white">DIPLÔME RÉVOQUÉ</p>
      )}

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">
              {LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome}
            </h2>
            <p className="text-base text-gris-700">{d.filiere || '—'}</p>
            <p className="tabulaire mt-0.5 text-sm text-gris-500">{d.reference}</p>
          </div>
          <EtiquetteStatut statut={d.statut} version={d.version} />
        </div>

        <dl className="mt-4">
          <Ligne label="Établissement" valeur={d.etablissement} />
          <Ligne label="Mention" valeur={LIBELLES_MENTION[d.mention] || d.mention} />
          <Ligne label="Certifié le" valeur={date(d.date_certification)} />
          {d.version > 1 && (
            <Ligne
              label="Remplace"
              valeur={d.remplace_reference ? `${d.remplace_reference} — ${d.motif_version || 'correction'}` : d.motif_version}
            />
          )}
        </dl>

        {revoque && (
          <div className="mt-4">
            <Encart ton="erreur" titre="Ce diplôme n’est plus valable">
              {d.motif_revocation || 'Motif non précisé.'} Rapprochez-vous de votre établissement :
              une réémission corrigée est possible.
            </Encart>
          </div>
        )}

        {enAttente && (
          <div className="mt-4">
            <Encart ton="info" titre="Enregistrement en blockchain en cours">
              Votre diplôme est certifié et valable. Son inscription définitive sur la blockchain
              est en file d’attente ; la page de vérification l’indique au tiers qui la consulte.
            </Encart>
          </div>
        )}

        {d.consultations > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
            <Icone nom="visibility" taille={16} className="mt-0.5 shrink-0" />
            Vérifié {d.consultations} fois par des tiers
            {d.derniere_consultation && ` — dernière fois le ${date(d.derniere_consultation)}`}.
            L’identité de ceux qui vérifient n’est pas conservée.
          </p>
        )}

        {!revoque && lien && (
          <div className="mt-5 border-t border-gris-200 pt-4">
            <p className="mb-2 text-sm font-bold text-gris-700">
              Faire vérifier ce diplôme
            </p>
            <p className="mb-3 text-sm text-gris-500">
              Transmettez ce lien — ou le QR code — à un employeur ou à une administration. Il
              n’a besoin d’aucun compte pour contrôler l’authenticité.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <code className="tabulaire max-w-full flex-1 overflow-x-auto whitespace-nowrap border border-gris-300 bg-gris-50 px-3 py-2 font-mono text-xs text-gris-700">
                {lien}
              </code>
              <Bouton variante="secondaire" icone="content_copy" onClick={() => onCopie(lien, d.id)}>
                Copier
              </Bouton>
            </div>

            {/* Le QR était un LIEN, pas une image : il fallait l'ouvrir dans
                un onglet pour espérer le scanner. Or c'est l'objet même que
                l'on tend à un employeur — il doit être lisible à l'écran, par
                un téléphone tenu devant. */}
            {d.qr_code_url && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <img
                  src={urlFichier(d.qr_code_url)}
                  alt={`QR code de vérification du diplôme ${d.reference}`}
                  className="h-40 w-40 shrink-0 border border-gris-300 bg-white p-2"
                />
                <p className="min-w-48 flex-1 text-sm text-gris-500">
                  Ce QR code mène à la page publique de vérification. Un employeur le scanne
                  avec l’appareil photo de son téléphone : ni compte, ni application.
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={lien}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-vert bg-vert px-4 py-2 text-base font-medium text-white hover:bg-vert-fonce"
              >
                <Icone nom="verified" taille={18} />
                Ouvrir la page publique
              </a>
              {d.pdf_url && (
                <a
                  href={urlFichier(d.pdf_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 border border-gris-500 bg-white px-4 py-2 text-base font-medium text-gris-900 hover:bg-gris-100"
                >
                  <Icone nom="picture_as_pdf" taille={18} />
                  Diplôme PDF
                </a>
              )}
              {d.qr_code_url && (
                <a
                  href={urlFichier(d.qr_code_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 border border-gris-500 bg-white px-4 py-2 text-base font-medium text-gris-900 hover:bg-gris-100"
                >
                  <Icone nom="qr_code_2" taille={18} />
                  Télécharger le QR
                </a>
              )}
            </div>
          </div>
        )}

        {revoque && (
          <p className="mt-4 flex items-start gap-1.5 text-sm text-gris-500">
            <Icone nom="block" taille={16} className="mt-0.5 shrink-0" />
            Le PDF et le lien de vérification ne sont plus proposés : ce document ne prouve plus
            rien.
          </p>
        )}
      </div>
    </article>
  );
}

export default function MesDiplomesPage() {
  const [diplomes, setDiplomes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [copie, setCopie] = useState(null);

  useEffect(() => {
    listerMesDiplomes()
      .then(setDiplomes)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  async function copier(lien, id) {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(id);
      setTimeout(() => setCopie(null), 3000);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : on le
      // dit plutôt que de laisser croire à une copie silencieuse.
      setErreur('Copie impossible depuis ce navigateur. Sélectionnez le lien à la main.');
    }
  }

  return (
    <div>
      <EnTetePage
        titre="Mes diplômes"
        description="Chaque diplôme dispose d’un lien de vérification publique : c’est lui qui fait preuve, pas le document imprimé."
        fil={[{ libelle: 'Mon espace' }, { libelle: 'Mes diplômes' }]}
      />

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {copie && (
        <div className="mb-4">
          <Encart ton="succes">Lien copié. Vous pouvez le coller dans un message ou un courriel.</Encart>
        </div>
      )}

      {chargement ? (
        <Chargement />
      ) : diplomes.length === 0 ? (
        <EtatVide icone="school" titre="Aucun diplôme certifié">
          Vos diplômes apparaîtront ici dès que le ministère les aura certifiés.
        </EtatVide>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {diplomes.map((d) => (
            <CarteDiplome key={d.id} d={d} onCopie={copier} />
          ))}
        </div>
      )}
    </div>
  );
}
