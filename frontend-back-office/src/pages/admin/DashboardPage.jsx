// ─────────────────────────────────────────────────────────────
// Supervision de la plateforme.
//
// L'administrateur système EXPLOITE, il ne certifie jamais — c'est cette
// séparation qui empêche un exploitant de délivrer un diplôme. Son écran
// ne montre donc pas des volumes de diplômes mais l'état de la machine :
// ce qui est en panne, ce qui s'accumule, ce qui va manquer.
//
// L'ordre est celui de l'urgence. Un portefeuille blockchain vide arrête
// la certification du pays entier : cela se voit avant les compteurs.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { tableauDeBord, exporterTableauDeBord } from '../../services/tableau-bord.service.js';
import { messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Chiffre,
  Section,
  Encart,
  Bouton,
  Chargement,
  Icone,
} from '../../components/ui/index.jsx';

const nombre = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('fr-FR'));

/** Wei → POL, arrondi à quelque chose de lisible. */
function enPol(wei) {
  const n = Number(wei || 0) / 1e18;
  if (!Number.isFinite(n) || n === 0) return '0';
  return n < 0.001 ? n.toExponential(2) : n.toFixed(4);
}

/** Autonomie du portefeuille : la seule métrique qui se compte en jours. */
function AlerteSolde({ portefeuille }) {
  if (!portefeuille) return null;

  if (portefeuille.disponible === false) {
    return (
      <Encart ton="alerte" titre="Solde du portefeuille illisible">
        {portefeuille.erreur || 'Le nœud blockchain n’a pas répondu.'} Tant que le solde est
        inconnu, on ne peut pas garantir que la certification pourra continuer.
      </Encart>
    );
  }

  if (portefeuille.mock) {
    return (
      <Encart ton="info" titre="Blockchain en mode simulation">
        Aucune transaction réelle n’est émise : les diplômes certifiés ne sont pas inscrits sur la
        chaîne publique, et le solde affiché est fictif.
      </Encart>
    );
  }

  if (portefeuille.niveau === 'critique' || portefeuille.niveau === 'bas') {
    return (
      <Encart
        ton={portefeuille.niveau === 'critique' ? 'erreur' : 'alerte'}
        titre="Portefeuille de service à recharger"
      >
        {portefeuille.solde} POL, soit environ {portefeuille.jours_restants} jour(s) de
        certification au rythme des 30 derniers jours. Sans recharge, l’ancrage s’arrête et les
        diplômes s’accumulent en file d’attente.
        {portefeuille.adresse && (
          <span className="mt-1 block font-mono text-xs">{portefeuille.adresse}</span>
        )}
      </Encart>
    );
  }
  return null;
}

export default function AdminDashboardPage() {
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setDonnees(await tableauDeBord());
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function telecharger() {
    try {
      const blob = await exporterTableauDeBord();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'supervision-certiftogo.csv';
      lien.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  const sante = donnees?.sante || {};
  const api = donnees?.api || {};
  const chaine = donnees?.blockchain || {};
  const file = donnees?.file_ancrage || {};
  const portefeuille = donnees?.portefeuille;

  const abandonnes = sante.ancrages_abandonnes || 0;
  const notificationsBloquees = sante.notifications_en_attente || 0;
  const echecs = file.echouee || 0;
  const rien = abandonnes === 0 && echecs === 0 && notificationsBloquees === 0;

  return (
    <div>
      <EnTetePage
        titre="Supervision"
        description="État de la plateforme : ce qui est en panne, ce qui s’accumule, ce qui va manquer."
        fil={[{ libelle: 'Supervision' }, { libelle: 'Tableau de bord' }]}
      >
        <Bouton variante="secondaire" icone="refresh" onClick={charger}>
          Actualiser
        </Bouton>
        <Bouton variante="secondaire" icone="download" onClick={telecharger}>
          Exporter en CSV
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
          {/* ── Ce qui appelle un geste aujourd'hui ── */}
          <div className="mb-6 space-y-3">
            <AlerteSolde portefeuille={portefeuille} />

            {abandonnes > 0 && (
              <Encart ton="erreur" titre={`${abandonnes} ancrage(s) abandonné(s)`}>
                Ces diplômes ont épuisé leurs tentatives : certifiés en base, absents de la
                blockchain. La vérification publique le signale au tiers. Ils se relancent depuis
                la file d’ancrage du ministère.
              </Encart>
            )}

            {echecs > 0 && (
              <Encart ton="alerte" titre={`${echecs} ancrage(s) en échec`}>
                Ils seront réessayés avec un délai croissant. Si le nombre augmente, regardez le
                nœud RPC et le solde du portefeuille avant de relancer.
              </Encart>
            )}

            {notificationsBloquees > 0 && (
              <Encart ton="alerte" titre={`${notificationsBloquees} notification(s) non expédiée(s)`}>
                Des messages WhatsApp ou SMS attendent ou ont échoué : leurs destinataires n’ont
                pas été prévenus.
              </Encart>
            )}

            {rien && (
              <Encart ton="succes" titre="Aucun incident en cours">
                File d’ancrage saine, notifications expédiées.
              </Encart>
            )}
          </div>

          <Section titre="Activité de la plateforme">
            <div className="grid gap-3 sm:grid-cols-4">
              <Chiffre libelle="Comptes actifs" valeur={nombre(sante.comptes_actifs)} />
              <Chiffre libelle="Sessions ouvertes" valeur={nombre(sante.sessions_ouvertes)} />
              <Chiffre libelle="Établissements actifs" valeur={nombre(sante.etablissements_actifs)} />
              <Chiffre
                libelle="Base de données"
                valeur={`${sante.taille_base_mo ?? '—'} Mo`}
                precision="taille sur disque"
              />
            </div>
          </Section>

          <Section
            titre="Ancrage blockchain"
            description="La file dit ce qui reste à inscrire sur la chaîne."
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <Chiffre libelle="En attente" valeur={nombre(file.en_attente || 0)} />
              <Chiffre libelle="En cours" valeur={nombre(file.en_cours || 0)} />
              <Chiffre libelle="Confirmés" valeur={nombre(file.confirmee || 0)} ton="vert" />
              <Chiffre
                libelle="Abandonnés"
                valeur={nombre(abandonnes)}
                ton={abandonnes > 0 ? 'erreur' : 'neutre'}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Chiffre
                libelle="Taux de succès"
                valeur={
                  chaine.taux_succes_pourcent === null ? '—' : `${chaine.taux_succes_pourcent} %`
                }
                precision={`${nombre(chaine.transactions)} transaction(s)`}
                ton={chaine.taux_succes_pourcent !== null && chaine.taux_succes_pourcent < 95 ? 'alerte' : 'neutre'}
              />
              <Chiffre
                libelle="Coût cumulé"
                valeur={`${enPol(chaine.cout_wei)} POL`}
                precision="frais de gas payés"
              />
              <Chiffre
                libelle="Solde du portefeuille"
                valeur={portefeuille?.solde !== undefined ? `${portefeuille.solde} POL` : '—'}
                precision={
                  portefeuille?.jours_restants != null
                    ? `≈ ${portefeuille.jours_restants} jours d’autonomie`
                    : undefined
                }
                ton={portefeuille?.niveau === 'critique' ? 'erreur' : portefeuille?.niveau === 'bas' ? 'alerte' : 'neutre'}
              />
            </div>
          </Section>

          <Section titre="API" description="Mesures depuis le démarrage du processus.">
            <div className="grid gap-3 sm:grid-cols-4">
              <Chiffre libelle="Requêtes" valeur={nombre(api.requetes_total)} />
              <Chiffre
                libelle="Erreurs serveur"
                valeur={nombre(api.erreurs_serveur)}
                precision={api.taux_erreur_serveur !== undefined ? `${api.taux_erreur_serveur} %` : undefined}
                ton={api.erreurs_serveur > 0 ? 'erreur' : 'neutre'}
              />
              <Chiffre
                libelle="Temps de réponse médian"
                valeur={api.temps_reponse_ms?.median !== undefined ? `${api.temps_reponse_ms.median} ms` : '—'}
              />
              <Chiffre
                libelle="Temps de réponse (p95)"
                valeur={api.temps_reponse_ms?.p95 !== undefined ? `${api.temps_reponse_ms.p95} ms` : '—'}
                precision="95 % des requêtes en deçà"
              />
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
              Ces compteurs vivent en mémoire : un redémarrage les remet à zéro. Ils servent à
              repérer une dérive dans la journée, pas à faire de l’historique.
            </p>
          </Section>

          {donnees?.verifications_par_jour?.length > 0 && (
            <Section
              titre="Vérifications publiques"
              description="Consultations du registre par des tiers, sur la période."
            >
              <Histogramme series={donnees.verifications_par_jour} />
            </Section>
          )}

          <p className="flex items-start gap-1.5 text-sm text-gris-500">
            <Icone nom="gpp_good" taille={16} className="mt-0.5 shrink-0" />
            L’administration système exploite la plateforme ; elle ne certifie aucun diplôme et
            n’accède à aucune signature. Seul le ministère certifie.
          </p>
        </>
      )}
    </div>
  );
}

/** Histogramme sobre : pas de librairie pour dessiner trente barres. */
function Histogramme({ series }) {
  const max = Math.max(...series.map((j) => Number(j.total) || 0), 1);
  const total = series.reduce((t, j) => t + (Number(j.total) || 0), 0);

  return (
    <div className="overflow-x-auto border border-gris-300 bg-white p-4">
      <div className="flex min-w-[30rem] items-end gap-1" style={{ height: 120 }}>
        {series.map((j) => {
          const valeur = Number(j.total) || 0;
          return (
            <div
              key={j.jour}
              className="flex-1 bg-vert/70"
              style={{ height: `${Math.max(Math.round((valeur / max) * 100), 2)}%` }}
              title={`${new Date(j.jour).toLocaleDateString('fr-FR')} — ${valeur} vérification(s)`}
            />
          );
        })}
      </div>
      <p className="mt-2 text-sm text-gris-500">
        {series.length} jour(s) · {total.toLocaleString('fr-FR')} vérification(s) au total
      </p>
    </div>
  );
}
