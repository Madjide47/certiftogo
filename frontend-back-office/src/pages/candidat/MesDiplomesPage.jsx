// ─────────────────────────────────────────────────────────────
// Candidat — portefeuille détaillé : une carte par diplôme, avec accès
// au PDF, au QR, et au lien de vérification publique.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { listerMesDiplomes } from '../../services/portefeuille.service.js';
import {
  LIBELLES_STATUT_DIPLOME,
  BADGE_STATUT_DIPLOME,
  LIBELLES_TYPE_DIPLOME,
  LIBELLES_MENTION,
  messageErreur,
} from '../../utils/libelles.js';

const URL_PUBLIC = import.meta.env.VITE_PUBLIC_URL || 'http://localhost:5174';

function Ligne({ label, valeur }) {
  if (!valeur) return null;
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="text-right text-sm font-medium text-on-surface">{valeur}</dd>
    </div>
  );
}

function CarteDiplome({ d }) {
  const revoque = d.statut === 'revoque';
  const date = d.date_certification
    ? new Date(d.date_certification).toLocaleDateString('fr-FR')
    : null;
  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-6 shadow-soft ${
        revoque ? 'border-error/30 bg-error-container/20' : 'border-outline-variant/25'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-on-surface">
            {LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome}
          </h3>
          <p className={`text-sm ${revoque ? 'text-on-surface-variant line-through' : 'text-on-surface-variant'}`}>
            {d.reference}
          </p>
        </div>
        <Badge className={BADGE_STATUT_DIPLOME[d.statut]}>
          {LIBELLES_STATUT_DIPLOME[d.statut] || d.statut}
        </Badge>
      </div>

      <dl className="mt-4 divide-y divide-outline-variant/10">
        <Ligne label="Filière" valeur={d.filiere} />
        <Ligne label="Mention" valeur={LIBELLES_MENTION[d.mention] || d.mention} />
        <Ligne label="Établissement" valeur={d.etablissement} />
        <Ligne label="Certifié le" valeur={date} />
      </dl>

      {revoque && d.motif_revocation && (
        <p className="mt-3 rounded-lg bg-error-container/60 px-3 py-2 text-xs text-on-error-container">
          Ce certificat a été révoqué — {d.motif_revocation}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {revoque ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-medium text-on-surface-variant/60">
            <Icon name="picture_as_pdf" size={16} /> PDF indisponible
          </span>
        ) : (
          <>
            {d.pdf_url && (
              <a
                href={d.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-3 py-2 text-xs font-semibold text-on-primary hover:bg-primary"
              >
                <Icon name="picture_as_pdf" size={16} /> PDF
              </a>
            )}
            {d.qr_code_url && (
              <a
                href={d.qr_code_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-low"
              >
                <Icon name="qr_code_2" size={16} /> QR
              </a>
            )}
            {d.hash && (
              <a
                href={`${URL_PUBLIC}/verifier/${d.hash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-low"
              >
                <Icon name="verified" size={16} /> Vérifier
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function MesDiplomesPage() {
  const [diplomes, setDiplomes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    listerMesDiplomes()
      .then(setDiplomes)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  return (
    <div>
      <PageHeader
        titre="Mes diplômes"
        sous="Consultez, téléchargez et partagez vos certificats enregistrés en blockchain."
      />

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      {chargement ? (
        <div className="py-16 text-center text-on-surface-variant">Chargement…</div>
      ) : diplomes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/40 bg-white p-12 text-center text-on-surface-variant">
          Aucun diplôme certifié pour l'instant.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {diplomes.map((d) => (
            <CarteDiplome key={d.id} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}
