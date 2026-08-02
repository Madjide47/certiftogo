# CertifTOGO — Inventaire exhaustif des éléments à implémenter

Extrait de l'intégralité des documents transmis. Chaque ligne est vérifiable
et numérotée pour que tu puisses valider, refuser ou réordonner.

**Légende** — ✅ fait et testé · 🔨 partiel ou en cours · ⬜ à faire

Dernière mise à jour : 2 août 2026.

---

## A. Création des comptes et gouvernance des accès

| # | Élément | Statut |
|---|---|---|
| A-01 | Aucune inscription libre, pour aucun rôle | ✅ *aucune route d'inscription n'existe* |
| A-02 | Comptes ministère créés par l'administrateur système | ✅ |
| A-03 | Connexion par téléphone + OTP pour les 4 rôles | ✅ |
| A-04 | UUID interne stable, téléphone comme identifiant mutable | ✅ |
| A-05 | **Établissement créé par le ministère** (aujourd'hui : admin système) | ✅ |
| A-06 | **Code établissement officiel** (`IAI001`, `UL002`) distinct des comptes agents | ✅ |
| A-07 | **Création du premier agent par le ministère**, en même temps que l'établissement | ✅ |
| A-08 | **Demande d'intégration** d'un établissement : formulaire, instruction, acceptation/refus | ✅ |
| A-09 | **Vérification d'habilitation** : types de diplômes qu'un établissement peut délivrer | ✅ |
| A-10 | **Un agent principal peut créer d'autres agents** de son établissement | ✅ |
| A-11 | Message de bienvenue à la création d'un compte (WhatsApp/SMS) | ⬜ |
| A-12 | Compte candidat créé à la saisie, activé à la certification | ✅ |
| A-13 | Identité nationale : une personne, plusieurs fiches établissement | ✅ |
| A-14 | **Changement de numéro volontaire** : OTP ancien numéro puis nouveau | ⬜ |
| A-15 | **Récupération après perte du téléphone** : procédure médiée par un agent | ⬜ |
| A-16 | **Normalisation du téléphone à la saisie** (sinon le regroupement d'identité fuit) | ✅ |
| A-17 | **Téléphone obligatoire** pour un candidat (option A) avec statut « en attente de numéro » | ⬜ |
| A-18 | **Désactivation immédiate** d'un agent qui quitte son établissement | ✅ |
| A-19 | **Révocation des sessions actives** à la désactivation | ✅ |
| A-20 | **Transfert des dossiers en cours** d'un agent partant vers un autre | ⬜ |

## B. Rôles internes à un établissement

| # | Élément | Statut |
|---|---|---|
| B-01 | Sous-rôle **agent de saisie** | ⬜ |
| B-02 | Sous-rôle **chef de scolarité** (contrôle qualité, correction) | ⬜ |
| B-03 | Sous-rôle **directeur** (autorise la transmission) | ⬜ |
| B-04 | Workflow interne : brouillon → contrôle interne → validé interne → soumis | ⬜ |
| B-05 | Matrice permissions × actions par sous-rôle | ⬜ |
| B-06 | **Mode simple** : établissement sans hiérarchie, sous-rôle configurable | ⬜ |
| B-07 | Remplacer les 4 rôles figés par un vrai modèle rôles/permissions | ⬜ |
| B-08 | Séparation nette **ministère (certifie) / admin (exploite)** — l'admin ne certifie jamais | ✅ |

## C. Structure académique et promotions

| # | Élément | Statut |
|---|---|---|
| C-01 | Années académiques, une seule ouverte à la fois | ✅ |
| C-02 | Sessions : normale, rattrapage, exceptionnelle | ✅ |
| C-03 | Facultés | ✅ |
| C-04 | Filières avec type de diplôme et durée | ✅ |
| C-05 | Promotions (filière, niveau, année, session) | ✅ |
| C-06 | Inscriptions historisées → parcours pluriannuel | ✅ |
| C-07 | Cycle de vie de la promotion (brouillon → … → clôturée) | ✅ |
| C-08 | **Date de délibération** sur la promotion | ✅ |
| C-09 | Saisie manuelle d'un étudiant | ✅ |
| C-10 | **Import Excel d'une promotion entière** | ✅ |
| C-11 | **Rapport d'import ligne à ligne** avec erreurs localisées | ✅ |
| C-12 | **Simulation avant import** (dry run) | ✅ |
| C-13 | **Détection des doublons** dans le fichier et avec l'existant | ✅ |
| C-14 | **Modèle de fichier Excel téléchargeable** | ✅ |
| C-15 | Validation interne avant transmission | ⬜ *voir B-04* |
| C-16 | Effectifs prévus / inscrits et réconciliation | 🔨 *compteurs affichés* |

## D. Transmission par lot

| # | Élément | Statut |
|---|---|---|
| D-01 | **Table `lots_transmission`** : horodatage, agent émetteur, établissement, promotion | ✅ |
| D-02 | **Transmission d'une promotion entière en un clic** | ✅ |
| D-03 | **Génération automatique des dossiers** à la transmission | ✅ |
| D-04 | **Écran de confirmation** « transmettre 250 étudiants ? » | ⬜ |
| D-05 | Transmission de **données structurées**, jamais de PDF | ✅ |
| D-06 | **File d'attente du ministère par lot** (et non dossier par dossier) | ✅ |
| D-07 | **Rejet partiel** : le lot avance, les dossiers fautifs reviennent | ✅ |
| D-08 | Statut `partiellement_traite` sur un lot | ✅ |

## E. Contrôles à la réception (ministère)

| # | Élément | Statut |
|---|---|---|
| E-01 | Contrôle auto : champs obligatoires | ✅ |
| E-02 | Contrôle auto : doublons | ✅ |
| E-03 | Contrôle auto : cohérence des dates | ✅ |
| E-04 | Contrôle auto : établissement habilité | ✅ |
| E-05 | Contrôle auto : diplôme autorisé pour cet établissement | ✅ |
| E-06 | Contrôle auto : format du téléphone | ✅ |
| E-07 | Contrôle auto : cohérence de la promotion | ✅ |
| E-08 | Contrôle auto : format du matricule | ✅ |
| E-09 | **Détection d'anomalies statistiques** (ex. 250 étudiants nés la même année) | ✅ |
| E-10 | Tableau de synthèse d'un lot avant validation humaine | ✅ |
| E-11 | Validation officielle du lot | ✅ |

## F. Certification et diplôme

| # | Élément | Statut |
|---|---|---|
| F-01 | Distinction préparation (établissement) / création officielle (ministère) | ✅ |
| F-02 | Chaîne hash → signature → blockchain → PDF → QR → portefeuille | ✅ |
| F-03 | **Certification de masse d'un lot** | ✅ |
| F-04 | **Versionnement d'un diplôme** (v1 → v2, chaînage) | ✅ |
| F-05 | **Révocation puis réémission** avec conservation de la trace | ✅ |
| F-06 | **Changement de nom après mariage / décision de justice** | ✅ |
| F-07 | **Recalcul du hash** sur nouvelle version | ✅ |
| F-08 | Détection de la **double certification** d'un même dossier | ✅ |
| F-09 | Le contrat ne connaît pas le remplacement — décision d'évolution | ✅ *limite documentée : révocation + certification, lien hors chaîne* |

## G. Traitement asynchrone et passage à l'échelle

| # | Élément | Statut |
|---|---|---|
| G-01 | **File d'attente d'ancrage** (table + worker) | ✅ |
| G-02 | Statut intermédiaire « en attente d'ancrage » | ✅ |
| G-03 | **Retry exponentiel** et dead letter queue | ✅ |
| G-04 | **Idempotence** et reprise après incident | ✅ |
| G-05 | Indicateur de progression « 8 245 / 12 000 ancrés » | ✅ |
| G-06 | Comportement du candidat pendant l'ancrage | ✅ |
| G-07 | Réponse de la vérification publique pendant l'ancrage | ✅ |
| G-08 | Notification admin en cas d'échec de transaction | ⬜ |

## H. Coûts blockchain

| # | Élément | Statut |
|---|---|---|
| H-01 | **`gas_used` remonté** dans `transactions_blockchain` (aujourd'hui toujours NULL) | ✅ |
| H-02 | Coût cumulé par établissement et par période | ✅ |
| H-03 | **Wallet de service** : solde, seuil d'alerte bas, procédure de recharge | ⬜ |
| H-04 | **Batching** de plusieurs certifications | ⬜ |
| H-05 | **Arbre de Merkle** : une racine par promotion + preuves individuelles | ⬜ |
| H-06 | Ancre individuelle à la révocation (le Merkle seul l'empêche) | ⬜ |

## I. Notifications

| # | Élément | Statut |
|---|---|---|
| I-01 | Envoi OTP (WhatsApp mock + Cloud API) | ✅ |
| I-02 | **Catalogue événement × destinataire × canal × priorité × modèle** | ✅ |
| I-03 | Compte créé | ✅ |
| I-04 | Dossier / lot reçu par le ministère | ✅ |
| I-05 | Dossier examiné | ✅ |
| I-06 | Dossier validé | ✅ |
| I-07 | Dossier rejeté avec motif | ✅ |
| I-08 | **Diplôme certifié** (« connectez-vous à CertifTOGO ») | ✅ |
| I-09 | Diplôme révoqué | ✅ |
| I-10 | QR consulté par un tiers (option candidat) | 🔨 *modèle prêt, déclencheur à brancher* |
| I-11 | Tentative de connexion échouée | ✅ |
| I-12 | Session suspecte | ✅ |
| I-13 | Établissement suspendu | ✅ |
| I-14 | Agent désactivé | ✅ |
| I-15 | Transaction blockchain échouée | ✅ |
| I-16 | Retry blockchain réussi | ✅ |
| I-17 | **Centre de notifications in-app** | ✅ |
| I-18 | Préférences et désabonnement | ✅ |
| I-19 | Reprise sur échec d'envoi | ✅ |
| I-20 | Canal **SMS** de secours (aujourd'hui WhatsApp seul) | 🔨 *canal tracé, opérateur non raccordé* |
| I-21 | Canal **email** | 🔨 *canal tracé, SMTP non raccordé* |

## J. Journalisation et audit

| # | Élément | Statut |
|---|---|---|
| J-01 | Table `journal_audit` | ✅ |
| J-02 | **Alimentation effective** — aujourd'hui aucune écriture dans le code | ✅ |
| J-03 | Format complet : horodatage, utilisateur, rôle, action, entité, **avant/après**, IP, user-agent, résultat | ✅ |
| J-04 | **Corrélation avec la transaction blockchain** | ✅ |
| J-05 | Catalogue des **30 à 40 actions obligatoires** | ✅ |
| J-06 | Durée de conservation et purge | ✅ |
| J-07 | Droits de consultation par rôle | ✅ |
| J-08 | Export du journal | ✅ |
| J-09 | Écran « Qui a fait quoi » | ⬜ *API prête, écran à venir avec la refonte* |
| J-10 | **Corbeille et restauration** (suppression réversible) | ✅ |

## K. Statistiques et tableaux de bord

| # | Élément | Statut |
|---|---|---|
| K-01 | Ministère : total certifiés, aujourd'hui / semaine / mois | ✅ |
| K-02 | Ministère : **top 10 des établissements les plus actifs** | ✅ |
| K-03 | Ministère : **délai moyen soumission → certification** | ✅ |
| K-04 | Ministère : taux de rejet | ✅ |
| K-05 | Ministère : répartition par filière et type de diplôme | ✅ |
| K-06 | Ministère : **coût gas cumulé** | ✅ |
| K-07 | Ministère : vérifications publiques par jour | ✅ |
| K-08 | Établissement : promotions transmises / en attente / rejetées | ✅ |
| K-09 | Établissement : délai moyen avant certification | ✅ |
| K-10 | Établissement : **motifs de rejet agrégés** | ✅ |
| K-11 | Candidat : nombre de vérifications de ses diplômes | ✅ |
| K-12 | Candidat : **alertes de consultation** | 🔨 *compteur exposé, alerte à brancher* |
| K-13 | Admin : santé système, taux de succès blockchain, taille de file, temps de réponse, charge base | ✅ |
| K-14 | Exports et rapports planifiés | ✅ |

## L. Sécurité

| # | Élément | Statut |
|---|---|---|
| L-01 | Requêtes SQL paramétrées | ✅ |
| L-02 | Secrets hors du code, refus de démarrer sans secret en production | ✅ |
| L-03 | Isolation par établissement | ✅ |
| L-04 | **Rate limiting** : vérification publique, envoi d'OTP, tentatives de connexion | ✅ |
| L-05 | **Anti-brute force OTP** (nombre d'essais) | ✅ |
| L-06 | **Anti-énumération de comptes** | ✅ |
| L-07 | **Gestion de session** : refresh token, révocation, sessions concurrentes | ✅ |
| L-08 | **Double validation à quatre yeux** pour les actions critiques | 🔨 *table et contrainte à quatre yeux posées, activation à brancher* |
| L-09 | **Clé privée du ministère hors serveur applicatif** (KMS / HSM) | ⬜ |
| L-10 | Audit de chaque signature | ⬜ |
| L-11 | **Rotation de clés** et procédure de compromission | ⬜ |
| L-12 | Sort des diplômes signés avec l'ancienne clé | ⬜ |
| L-13 | Protection CSRF | ✅ *sans objet : auth par en-tête Bearer, aucun cookie de session* |
| L-14 | Dépendances vulnérables (`tar` critique, `body-parser`, `brace-expansion`) | ⬜ |

## M. Cas exceptionnels

| # | Élément | Statut |
|---|---|---|
| M-01 | ERR-001 changement de nom | ✅ |
| M-02 | ERR-002 erreur après certification → révocation + réémission | ✅ |
| M-03 | ERR-003 perte du téléphone | ⬜ |
| M-04 | ERR-004 départ d'un agent | ⬜ |
| M-05 | ERR-005 établissement suspendu ou fermé — effets sur dossiers, diplômes, agents | ⬜ |
| M-06 | ERR-006 compromission de la clé privée | ⬜ |
| M-07 | ERR-007 échec de transaction blockchain | ⬜ |
| M-08 | ERR-008 double certification | ✅ |
| M-09 | ERR-009 consultation d'un diplôme révoqué | ✅ |
| M-10 | **Transmission gelée** pour un établissement suspendu | ⬜ |

## N. Architecture et intégration

| # | Élément | Statut |
|---|---|---|
| N-01 | Base PostgreSQL centralisée | ✅ |
| N-02 | Stockage hybride off-chain / on-chain | ✅ |
| N-03 | Services applicatifs découplés (auth, blockchain, PDF, notifications, stats) | 🔨 |
| N-04 | **API d'intégration** pour les logiciels des universités | ⬜ |
| N-05 | **Clés d'API, quotas, webhooks** | ⬜ |
| N-06 | Versionnement de l'API | ⬜ |
| N-07 | Migrations incrémentales | ✅ |
| N-08 | Traduction des erreurs SQL en erreurs métier | ✅ |

## O. Documentation et soutenance

| # | Élément | Statut |
|---|---|---|
| O-01 | Table des matières du CDC V2 | ✅ |
| O-02 | Rédaction des 37 chapitres | ⬜ |
| O-03 | **12 ADR** au format Nygard | ⬜ |
| O-04 | Argumentaire jury : détention de la clé privée | ⬜ |
| O-05 | Argumentaire jury : blockchain vs base de données, en 4 points | ⬜ |
| O-06 | DDL PostgreSQL complet commenté (`COMMENT ON`) | 🔨 |
| O-07 | Tableau « ce qui a changé entre V1 et V2 » | ⬜ |
| O-08 | Priorisation `[MVP]` / `[V1]` / `[VISION]` de chaque exigence | ⬜ |

## P. Éléments issus du CDC-V2 absents des quatre messages

Recoupement des 37 chapitres de `docs/CDC-V2.md` avec les sections A à O
ci-dessus : voici ce que seul le CDC mentionne.

| # | Élément | Chapitre | Statut |
|---|---|---|---|
| P-00 | **Refonte complète du frontend** — l'UI actuelle ne fait pas « plateforme gouvernementale ». Décidé le 2 août 2026, à mener une fois le backend terminé. Jusque-là, écrans fonctionnels et minimaux. | 26 | ⬜ |
| P-01 | **Description écran par écran** : composition, actions, états vides, états d'erreur | 26.4 | ⬜ |
| P-02 | **Accessibilité et affichage mobile** | 26.5 | ⬜ |
| P-03 | **Tests de charge** : promotion de 12 000 diplômés | 31.4 | ⬜ |
| P-04 | **Tests de sécurité** | 31.5 | ⬜ |
| P-05 | Glossaire métier (français) et technique (anglais) | 1.3 | ⬜ |
| P-06 | Frontières de confiance et zones de sécurité | 4.3 | ⬜ |
| P-07 | Matrice acteurs × cas d'usage | 6.2 | ⬜ |
| P-08 | Cycle de vie de chaque acteur | 6.3 | ⬜ |
| P-09 | Critères d'acceptation du MVP | 3.4 | ⬜ |
| P-10 | Environnements : dev, test, démo, production | 5.5 | ⬜ |
| P-11 | **Nomenclatures en base** : `types_diplome`, `mentions` (aujourd'hui des `CHECK` figés) | 24.3.4 | ⬜ |
| P-12 | **Table `historique_statuts_dossier`** | 24.3.6 | ✅ |
| P-13 | **Table `cles_publiques_ministere`** | 24.3.9 | ⬜ |
| P-14 | **Table `sessions`** (jetons, révocation) | ✅ | ✅ |
| P-15 | Diagramme entité-association d'ensemble | 24.4 | ⬜ |
| P-16 | Stratégie de migration depuis le schéma actuel | 24.6 | 🔨 |
| P-17 | Passage en mainnet | 32.1 | ⬜ |
| P-18 | Interopérabilité internationale | 32.2 | ⬜ |
| P-19 | Reconnaissance optique et reprise de l'existant papier | 32.3 | ⬜ |
| P-20 | Ouverture à d'autres ministères | 32.4 | ⬜ |
| P-21 | Objections probables et réponses préparées (jury) | 36.3 | ⬜ |
| P-22 | Limites assumées du dispositif | 36.4 | ⬜ |
| P-23 | Critères déclenchant une extraction en micro-service | 37.7 | ⬜ |
| P-24 | Ce qui ne doit **pas** être découplé, et pourquoi | 37.8 | ⬜ |
| P-25 | Taxonomie des erreurs et contrat d'erreur de l'API | 28.1-28.2 | 🔨 |
| P-26 | Restitution des erreurs à l'écran : message, action corrective, recours | 28.3 | 🔨 |
| P-27 | Erreurs silencieuses et détection | 28.4 | ⬜ |
| P-28 | Jalons de soutenance | 30.4 | ⬜ |

---

## Récapitulatif

| Statut | Nombre |
|---|---|
| ✅ fait et testé | 128 |
| 🔨 partiel ou en cours | 17 |
| ⬜ à faire | 29 |
| **Total** | **174** |

## Ordre d'implémentation proposé

Les dépendances imposent un ordre ; le voici, du plus contraignant au plus libre.

| Rang | Lot | Contenu | Débloque |
|---|---|---|---|
| 1 | **Import Excel** | C-10 → C-14, A-16 | la saisie de masse, prérequis de tout le reste |
| 2 | **Gouvernance** | A-05 → A-10, A-06 | les habilitations, donc les contrôles E-04/E-05 |
| 3 | **Lots de transmission** | D-01 → D-08 | la file ministère et le rejet partiel |
| 4 | **Contrôles automatiques** | E-01 → E-11 | la validation humaine assistée |
| 5 | **Audit** | J-01 → J-09 | la traçabilité, exigée partout ailleurs |
| 6 | **File d'ancrage** | G-01 → G-08, H-01 | le passage à l'échelle |
| 7 | **Notifications** | I-02 → I-21 | l'expérience utilisateur |
| 8 | **Sécurité** | L-04 → L-08 | la crédibilité en soutenance |
| 9 | **Sous-rôles** | B-01 → B-07 | le workflow interne |
| 10 | **Statistiques** | K-01 → K-14 | les tableaux de bord |
| 11 | **Cas exceptionnels** | M-01 → M-10 | la robustesse |
| 12 | **Documentation** | O-02 → O-08 | la soutenance |
