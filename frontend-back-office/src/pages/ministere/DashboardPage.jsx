// ─────────────────────────────────────────────────────────────
// Tableau de bord du ministère.
//
// Le ministère ne pilote pas un volume, il pilote une file d'attente et
// une qualité. L'écran suit donc cet ordre : ce qui attend une décision
// d'abord, ce qui a été produit ensuite, et enfin ce qui alerte —
// délais, taux de rejet, coût blockchain.
//
// Le taux de rejet n'est pas un indicateur de performance du ministère :
// c'est un indicateur de qualité des établissements. On le présente comme
// tel, sinon il pousse à valider pour faire baisser le chiffre.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tableauDeBord } from '../../services/tableau-bord.service.js';
import { fileDesLots } from '../../services/lot.service.js';
import { LIBELLES_TYPE_DIPLOME, messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Section,
  Chiffre,
  Encart,
  Chargement,
  Tableau,
  EtatVide,
  Bouton,
  Icone,
} from '../../components/ui/index.jsx';

const horodatage = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

/** Le coût on-chain est stocké en wei ; l'unité lisible est le POL. */
function enPol(wei) {
  const n = Number(wei || 0) / 1e18;
  return n === 0 ? '—' : `${n.toFixed(4)} POL`;
}

export default function DashboardPage() {
  const { utilisateur } = useAuth();
  const [tableau, setTableau] = useState(null);
  const [lots, setLots] = useState({});
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    Promise.all([tableauDeBord(), fileDesLots().catch(() => ({ repartition: {} }))])
      .then(([tb, file]) => {
        setTableau(tb);
        setLots(file.repartition || {});
      })
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  if (chargement) return <Chargement />;

  const cert = tableau?.certifications || {};
  const delai = tableau?.delai_certification || {};
  const rejet = tableau?.rejet || {};
  const top = tableau?.top_etablissements || [];
  const repartition = tableau?.repartition || [];
  const cout = tableau?.cout_blockchain || {};

  const aInstruire = (lots.transmis || 0) + (lots.en_examen || 0);
  const aCertifier = (lots.valide || 0) + (lots.partiellement_traite || 0);

  return (
    <div>
      <EnTetePage
        titre={`Bonjour ${utilisateur?.prenom || ''}`.trim()}
        description="Instruction et certification des diplômes de tous les établissements."
      />

      {erreur && (
        <div className="mb-5">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {/* Ce qui attend une décision passe avant tout compteur de volume. */}
      {(aInstruire > 0 || aCertifier > 0) && (
        <div className="mb-5">
          <Encart ton="alerte" titre="Des lots attendent une décision">
            {aInstruire > 0 && (
              <>
                {aInstruire} lot(s) à instruire
                {aCertifier > 0 && ', '}
              </>
            )}
            {aCertifier > 0 && <>{aCertifier} lot(s) validés prêts à certifier</>}.{' '}
            <Link to="/lots-recus" className="underline underline-offset-2">
              Ouvrir la file
            </Link>
          </Encart>
        </div>
      )}

      {cert.en_attente_ancrage > 0 && (
        <div className="mb-5">
          <Encart ton="alerte" titre={`${cert.en_attente_ancrage} diplôme(s) en attente d'ancrage`}>
            Ils sont certifiés en base mais pas encore inscrits sur la blockchain : leur
            vérification publique indiquera « non ancré ».{' '}
            <Link to="/ancrage" className="underline underline-offset-2">
              Voir la file d'ancrage
            </Link>
          </Encart>
        </div>
      )}

      <Section titre="File d'instruction">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Chiffre
            libelle="À prendre en charge"
            valeur={lots.transmis ?? 0}
            ton={lots.transmis > 0 ? 'alerte' : 'neutre'}
          />
          <Chiffre libelle="En examen" valeur={lots.en_examen ?? 0} />
          <Chiffre
            libelle="À certifier"
            valeur={aCertifier}
            ton={aCertifier > 0 ? 'vert' : 'neutre'}
          />
          <Chiffre libelle="Rejetés" valeur={lots.rejete ?? 0} ton="neutre" />
        </div>
      </Section>

      <Section titre="Diplômes certifiés">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Chiffre libelle="En vigueur" valeur={cert.total_actifs ?? 0} ton="vert" />
          <Chiffre
            libelle="Révoqués"
            valeur={cert.total_revoques ?? 0}
            ton={cert.total_revoques > 0 ? 'erreur' : 'neutre'}
          />
          <Chiffre libelle="Ce mois" valeur={cert.ce_mois ?? 0} />
          <Chiffre libelle="Total émis" valeur={cert.total ?? 0} />
        </div>
      </Section>

      <Section
        titre="Délai d'instruction"
        description="Temps entre la transmission d'un dossier par l'établissement et sa certification."
      >
        {delai.echantillon > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Chiffre libelle="Délai moyen" valeur={`${delai.jours_moyen ?? '—'} j`} />
            <Chiffre libelle="Le plus rapide" valeur={`${delai.jours_min ?? '—'} j`} />
            <Chiffre
              libelle="Le plus long"
              valeur={`${delai.jours_max ?? '—'} j`}
              precision={`sur ${delai.echantillon} diplôme(s)`}
              ton={Number(delai.jours_max) > 30 ? 'alerte' : 'neutre'}
            />
          </div>
        ) : (
          <EtatVide icone="schedule" titre="Aucun délai mesurable">
            Le délai apparaîtra dès la première certification.
          </EtatVide>
        )}
      </Section>

      <Section
        titre="Qualité des transmissions"
        description="Le taux de rejet mesure la qualité des dossiers reçus, pas la sévérité de l'instruction."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Chiffre
            libelle="Taux de rejet"
            valeur={rejet.taux != null ? `${rejet.taux} %` : '—'}
            ton={Number(rejet.taux) > 15 ? 'alerte' : 'neutre'}
          />
          <Chiffre libelle="Dossiers rejetés" valeur={rejet.rejetes ?? 0} />
          <Chiffre libelle="Dossiers instruits" valeur={rejet.total ?? 0} />
        </div>
      </Section>

      <Section
        titre="Établissements les plus actifs"
        description="Classés par nombre de diplômes certifiés."
      >
        <Tableau
          legende="Établissements par volume de certification"
          lignes={top}
          cle={(e) => e.code}
          colonnes={[
            { cle: 'code', libelle: 'Code', tabulaire: true },
            { cle: 'nom', libelle: 'Établissement' },
            {
              cle: 'diplomes',
              libelle: 'Diplômes',
              alignement: 'droite',
              tabulaire: true,
            },
            {
              cle: 'revoques',
              libelle: 'Révoqués',
              alignement: 'droite',
              tabulaire: true,
              // Un établissement dont on révoque beaucoup mérite un œil.
              rendu: (e) =>
                e.revoques > 0 ? (
                  <span className="font-bold text-erreur">{e.revoques}</span>
                ) : (
                  <span className="text-gris-500">0</span>
                ),
            },
            {
              cle: 'derniere_certification',
              libelle: 'Dernière',
              rendu: (e) => horodatage(e.derniere_certification),
            },
          ]}
          vide={
            <EtatVide icone="account_balance" titre="Aucune certification">
              Aucun établissement n'a encore de diplôme certifié.
            </EtatVide>
          }
        />
      </Section>

      <Section titre="Répartition par type de diplôme">
        <div className="flex flex-wrap gap-2">
          {repartition.length > 0 ? (
            repartition.map((r) => (
              <span
                key={r.type_diplome}
                className="border border-gris-300 bg-white px-3 py-2 text-sm"
              >
                <span className="text-gris-500">
                  {LIBELLES_TYPE_DIPLOME[r.type_diplome] || r.type_diplome}
                </span>{' '}
                <span className="tabulaire font-bold">{r.total}</span>
              </span>
            ))
          ) : (
            <p className="flex items-center gap-1.5 text-base text-gris-500">
              <Icone nom="info" taille={18} /> Aucun diplôme certifié pour l'instant.
            </p>
          )}
        </div>
      </Section>

      <Section
        titre="Coût blockchain"
        description="Ce que la certification a consommé sur Polygon. En mode « mock », aucune écriture réelle n'est faite."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Chiffre libelle="Transactions" valeur={cout.transactions ?? 0} />
          <Chiffre libelle="Coût cumulé" valeur={enPol(cout.cout_wei)} />
          <Chiffre
            libelle="Coût moyen"
            valeur={
              cout.transactions > 0
                ? enPol(Number(cout.cout_wei || 0) / cout.transactions)
                : '—'
            }
            precision="par opération"
          />
        </div>
        <div className="mt-3">
          <Link to="/ancrage">
            <Bouton variante="secondaire" icone="link">
              Détail par établissement
            </Bouton>
          </Link>
        </div>
      </Section>
    </div>
  );
}
