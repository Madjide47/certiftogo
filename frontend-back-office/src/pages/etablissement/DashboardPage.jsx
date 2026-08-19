// ─────────────────────────────────────────────────────────────
// Tableau de bord établissement.
//
// Structuré autour d'UNE question : « qu'est-ce qui m'attend ? ».
// Les lots en instruction et les motifs de rejet passent avant les
// volumes — un compteur de dossiers n'appelle aucune action, un lot
// rejeté si.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tableauDeBord } from '../../services/tableau-bord.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Section,
  Chiffre,
  Encart,
  Chargement,
  Tableau,
  Etiquette,
  EtatVide,
  Bouton,
  Icone,
} from '../../components/ui/index.jsx';

const LIBELLES_LOT = {
  transmis: 'Transmis',
  en_examen: 'En examen',
  valide: 'Validé',
  partiellement_traite: 'Partiellement traité',
  rejete: 'Rejeté',
  certifie: 'Certifié',
};

const TONS_LOT = {
  transmis: 'info',
  en_examen: 'alerte',
  valide: 'succes',
  partiellement_traite: 'alerte',
  rejete: 'erreur',
  certifie: 'vert',
};

export default function DashboardPage() {
  const { utilisateur } = useAuth();
  const [tableau, setTableau] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    tableauDeBord()
      .then(setTableau)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  if (chargement) return <Chargement />;

  const lots = tableau?.lots || {};
  const parStatut = lots.par_statut || {};
  const delai = tableau?.delai_certification || {};
  const motifs = tableau?.motifs_rejet || [];

  return (
    <div>
      <EnTetePage
        titre={`Bonjour ${utilisateur?.prenom || ''}`.trim()}
        description="Vue d'ensemble de votre établissement."
      />

      {erreur && (
        <div className="mb-5">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {/* Ce qui appelle une action passe en premier. */}
      {lots.rejetes > 0 && (
        <div className="mb-5">
          <Encart ton="alerte" titre={`${lots.rejetes} lot(s) rejeté(s) par le ministère`}>
            Consultez les motifs, corrigez les promotions concernées puis retransmettez-les.{' '}
            <Link to="/lots" className="underline underline-offset-2">
              Voir les lots
            </Link>
          </Encart>
        </div>
      )}

      <Section titre="Transmissions">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Chiffre
            libelle="En attente au ministère"
            valeur={lots.en_attente ?? 0}
            precision="transmis ou en cours d'examen"
            ton={lots.en_attente > 0 ? 'alerte' : 'neutre'}
          />
          <Chiffre libelle="Validés" valeur={parStatut.valide ?? 0} ton="vert" />
          <Chiffre libelle="Certifiés" valeur={parStatut.certifie ?? 0} ton="vert" />
          <Chiffre
            libelle="Rejetés"
            valeur={lots.rejetes ?? 0}
            ton={lots.rejetes > 0 ? 'erreur' : 'neutre'}
          />
        </div>
      </Section>

      <Section
        titre="Délai de certification"
        description="Temps écoulé entre la transmission d'un dossier et sa certification par le ministère."
      >
        {delai.echantillon > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Chiffre libelle="Délai moyen" valeur={`${delai.jours_moyen ?? '—'} j`} />
            <Chiffre libelle="Le plus rapide" valeur={`${delai.jours_min ?? '—'} j`} />
            <Chiffre
              libelle="Le plus long"
              valeur={`${delai.jours_max ?? '—'} j`}
              precision={`sur ${delai.echantillon} diplôme(s)`}
            />
          </div>
        ) : (
          <EtatVide
            icone="schedule"
            titre="Aucun diplôme certifié pour l'instant"
          >
            Le délai apparaîtra dès qu'un premier dossier aura été certifié par le ministère.
          </EtatVide>
        )}
      </Section>

      <Section
        titre="Motifs de rejet les plus fréquents"
        description="Ce que le ministère vous renvoie le plus souvent — donc ce qu'il faut corriger en priorité."
      >
        <Tableau
          legende="Motifs de rejet agrégés"
          colonnes={[
            { cle: 'motif', libelle: 'Motif' },
            {
              cle: 'occurrences',
              libelle: 'Occurrences',
              alignement: 'droite',
              tabulaire: true,
            },
          ]}
          lignes={motifs}
          cle={(l, i) => `${i}`}
          vide={
            <EtatVide icone="thumb_up" titre="Aucun dossier rejeté">
              Vos transmissions passent l'instruction sans renvoi.
            </EtatVide>
          }
        />
      </Section>

      <Section titre="Promotions par statut">
        <div className="flex flex-wrap gap-2">
          {Object.entries(tableau?.promotions || {}).map(([statut, total]) => (
            <span key={statut} className="border border-gris-300 bg-white px-3 py-2 text-sm">
              <span className="text-gris-500">{statut.replace('_', ' ')}</span>{' '}
              <span className="tabulaire font-bold">{total}</span>
            </span>
          ))}
          {Object.keys(tableau?.promotions || {}).length === 0 && (
            <EtatVide
              icone="groups"
              titre="Aucune promotion"
              action={
                <Link to="/promotions">
                  <Bouton icone="add">Créer une promotion</Bouton>
                </Link>
              }
            >
              Créez une promotion pour regrouper vos étudiants avant de les transmettre.
            </EtatVide>
          )}
        </div>
      </Section>

      <Section titre="Répartition des lots">
        <div className="flex flex-wrap gap-2">
          {Object.entries(parStatut).map(([statut, total]) => (
            <Etiquette key={statut} ton={TONS_LOT[statut] || 'neutre'}>
              {LIBELLES_LOT[statut] || statut} — {total}
            </Etiquette>
          ))}
          {Object.keys(parStatut).length === 0 && (
            <p className="flex items-center gap-1.5 text-base text-gris-500">
              <Icone nom="info" taille={18} /> Aucun lot transmis pour l'instant.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
