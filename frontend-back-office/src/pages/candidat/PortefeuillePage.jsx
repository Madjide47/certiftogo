// ─────────────────────────────────────────────────────────────
// Portefeuille du diplômé.
//
// Le titulaire n'est pas un agent : il ne vient pas administrer, il vient
// PROUVER. L'écran répond donc d'abord à « qu'est-ce que je peux montrer,
// et à qui puis-je le faire vérifier ? », avant tout compteur.
//
// Le portefeuille est national : il agrège les diplômes de tous les
// établissements fréquentés. C'est le sens de la table `personnes` — un
// diplômé de deux universités n'a qu'un seul portefeuille.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listerMesDiplomes, statistiquesPortefeuille } from '../../services/portefeuille.service.js';
import { LIBELLES_TYPE_DIPLOME, messageErreur } from '../../utils/libelles.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  EnTetePage,
  Chiffre,
  Encart,
  EtatVide,
  Bouton,
  Etiquette,
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';

const URL_PUBLIC = import.meta.env.VITE_PUBLIC_URL || 'http://localhost:5174';

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function PortefeuillePage() {
  const { utilisateur } = useAuth();
  const naviguer = useNavigate();
  const [stats, setStats] = useState(null);
  const [diplomes, setDiplomes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    Promise.all([statistiquesPortefeuille(), listerMesDiplomes()])
      .then(([s, d]) => {
        setStats(s);
        setDiplomes(d);
      })
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  const parStatut = stats?.diplomes_par_statut || {};
  const enAttente = parStatut.en_attente_ancrage || 0;
  const revoques = parStatut.revoque || 0;
  const dernier = diplomes.find((d) => d.statut !== 'revoque') || diplomes[0];
  const etablissements = [...new Set(diplomes.map((d) => d.etablissement).filter(Boolean))];

  return (
    <div>
      <EnTetePage
        titre={`Portefeuille de ${[utilisateur?.prenom, utilisateur?.nom].filter(Boolean).join(' ')}`}
        description="Vos diplômes certifiés par le ministère, vérifiables par toute personne à qui vous en donnez le lien."
        fil={[{ libelle: 'Mon espace' }, { libelle: 'Portefeuille' }]}
      >
        <Bouton icone="school" onClick={() => naviguer('/mes-diplomes')}>
          Voir mes diplômes
        </Bouton>
      </EnTetePage>

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {chargement ? (
        <Chargement />
      ) : (
        <>
          {/* Ce qui compte d'abord : de quoi prouver, tout de suite. */}
          {dernier && dernier.statut === 'actif' && (
            <div className="mb-6 border border-gris-300 bg-white">
              <div className="border-b border-gris-200 bg-vert-clair/40 px-5 py-3">
                <p className="text-sm font-bold text-vert">Votre dernier diplôme certifié</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-xl font-bold text-gris-900">
                    {LIBELLES_TYPE_DIPLOME[dernier.type_diplome] || dernier.type_diplome}
                    {dernier.filiere && ` — ${dernier.filiere}`}
                  </p>
                  <p className="text-base text-gris-700">{dernier.etablissement}</p>
                  <p className="tabulaire mt-0.5 text-sm text-gris-500">
                    {dernier.reference} · certifié le {date(dernier.date_certification)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dernier.hash && (
                    <a
                      href={`${URL_PUBLIC}/verifier/${dernier.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 border border-vert bg-vert px-4 py-2 text-base font-medium text-white hover:bg-vert-fonce"
                    >
                      <Icone nom="verified" taille={18} />
                      Page de vérification
                    </a>
                  )}
                  {dernier.pdf_url && (
                    <a
                      href={dernier.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 border border-gris-500 bg-white px-4 py-2 text-base font-medium text-gris-900 hover:bg-gris-100"
                    >
                      <Icone nom="picture_as_pdf" taille={18} />
                      Télécharger
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <Chiffre libelle="Diplômes" valeur={stats?.total_diplomes ?? 0} />
            <Chiffre libelle="Vérifiables" valeur={parStatut.actif ?? 0} ton="vert" />
            <Chiffre
              libelle="En cours d’enregistrement"
              valeur={enAttente}
              ton={enAttente > 0 ? 'alerte' : 'neutre'}
              precision={enAttente > 0 ? 'inscription en blockchain' : undefined}
            />
            <Chiffre
              libelle="Révoqués"
              valeur={revoques}
              ton={revoques > 0 ? 'erreur' : 'neutre'}
            />
          </div>

          {enAttente > 0 && (
            <div className="mb-6">
              <Encart ton="info" titre="Enregistrement en blockchain en cours">
                {enAttente} de vos diplômes {enAttente > 1 ? 'sont' : 'est'} certifié
                {enAttente > 1 ? 's' : ''} par le ministère et en attente d’inscription définitive
                sur la blockchain. Ils sont déjà valables ; la vérification publique le signale
                simplement comme « enregistrement en cours ».
              </Encart>
            </div>
          )}

          {revoques > 0 && (
            <div className="mb-6">
              <Encart ton="alerte" titre="Un diplôme révoqué reste visible ici">
                Il n’est pas effacé : sa révocation est publique et un employeur qui vérifie
                l’ancien document le verra. Le motif figure sur la fiche du diplôme.
              </Encart>
            </div>
          )}

          {diplomes.length === 0 ? (
            <EtatVide icone="school" titre="Aucun diplôme pour l’instant">
              Votre compte a été ouvert par votre établissement. Vos diplômes y apparaîtront dès
              que le ministère les aura certifiés — vous en serez averti.
            </EtatVide>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg">Tous vos diplômes</h2>
                <Link to="/mes-diplomes" className="text-base text-vert underline underline-offset-2">
                  Fiches détaillées et partage →
                </Link>
              </div>

              <ul className="border border-gris-300 bg-white">
                {diplomes.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-3 border-b border-gris-200 px-4 py-3 last:border-0"
                  >
                    <Icone
                      nom="school"
                      taille={22}
                      className={`shrink-0 ${d.statut === 'revoque' ? 'text-erreur' : 'text-vert'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-gris-900">
                        {LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome}
                        {d.filiere && <span className="font-normal"> — {d.filiere}</span>}
                      </p>
                      <p className="text-sm text-gris-500">
                        {d.etablissement} · {d.reference} · {date(d.date_certification)}
                      </p>
                    </div>
                    <EtiquetteStatut statut={d.statut} version={d.version} />
                  </li>
                ))}
              </ul>

              {etablissements.length > 1 && (
                <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
                  <Icone nom="account_balance" taille={16} className="mt-0.5 shrink-0" />
                  Vos diplômes proviennent de {etablissements.length} établissements. Votre
                  portefeuille est national : il les réunit sous une seule identité.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function EtiquetteStatut({ statut, version }) {
  if (statut === 'revoque') return <Etiquette ton="erreur">Révoqué</Etiquette>;
  if (statut === 'en_attente_ancrage') return <Etiquette ton="alerte">Enregistrement en cours</Etiquette>;
  return (
    <span className="flex items-center gap-2">
      {version > 1 && <Etiquette ton="info">Version {version}</Etiquette>}
      <Etiquette ton="succes">Vérifiable</Etiquette>
    </span>
  );
}
