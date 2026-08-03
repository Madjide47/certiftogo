# CertifTOGO — Cahier des charges et architecture logicielle
## Version 2 — Table des matières

| | |
|---|---|
| **Projet** | CertifTOGO — plateforme nationale de certification et de traçabilité des diplômes sur blockchain |
| **Version du document** | 2.0 (structure — chapitres à rédiger) |
| **Date** | 2 août 2026 |
| **Statut** | ✅ **Rédaction complète** — 37 chapitres, 16 ADR |
| **Périmètre technique** | Node.js/Express, PostgreSQL, React/Vite, Solidity/Hardhat, Polygon Amoy (MVP) |
| **Public visé** | équipe de développement, jury de soutenance, futurs mainteneurs |

---

## Chapitres rédigés

Le document est découpé en fichiers dans `docs/cdc/` : 120 pages dans un seul
fichier seraient illisibles en revue et impossibles à relire par diff.

| Chapitre | Fichier | État |
|---|---|---|
| 1 à 7 — Fondations (introduction, vision, objectifs, architecture, acteurs, authentification) | [`cdc/01-07-fondations.md`](cdc/01-07-fondations.md) | ✅ rédigé |
| 8 à 19 — Domaines métier et cœur de la certification | [`cdc/08-19-domaines-metier.md`](cdc/08-19-domaines-metier.md) | ✅ rédigé |
| 20 à 32 — Exploitation, fondations techniques, robustesse | [`cdc/20-32-exploitation-robustesse.md`](cdc/20-32-exploitation-robustesse.md) | ✅ rédigé |
| 24 — Modèle de données | [`cdc/24-modele-donnees.md`](cdc/24-modele-donnees.md) | ✅ rédigé |
| 33 — Performances et traitement asynchrone | [`cdc/33-performances-asynchrone.md`](cdc/33-performances-asynchrone.md) | ✅ rédigé |
| 34 — Coûts blockchain et gestion du gas | [`cdc/34-couts-blockchain.md`](cdc/34-couts-blockchain.md) | ✅ rédigé |
| 35 — Décisions d'architecture (16 ADR) | [`cdc/35-decisions-architecture.md`](cdc/35-decisions-architecture.md) | ✅ rédigé |
| 36 — Argumentaire pour le jury | [`cdc/36-argumentaire-jury.md`](cdc/36-argumentaire-jury.md) | ✅ rédigé |
| 37 — Évolutivité et découplage | [`cdc/37-evolutivite-decouplage.md`](cdc/37-evolutivite-decouplage.md) | ✅ rédigé |

> Les ADR ont été rédigées en premier parce qu'elles gouvernent la lecture de
> tout le reste : chaque chapitre suivant peut s'y référer au lieu de
> re-justifier les mêmes choix. Quatre d'entre elles (ADR-013 à ADR-016) ne
> figuraient pas au cadrage initial — elles ont été imposées par des problèmes
> rencontrés en construisant le système.

---

## Note méthodologique — à lire avant validation

Trois points appellent une décision de ta part avant que je rédige les chapitres.

### 1. La V1 n'existe pas sous forme de document

Le dépôt ne contient aucun cahier des charges antérieur (`docs/` ne comporte que
`DEPLOIEMENT.md`, `WHATSAPP.md` et `stitch-ui-prompts.md`). La « V1 » existe
comme **structure en 32 chapitres** et comme **code déjà écrit**, pas comme texte
rédigé.

Conséquence : ce document n'est pas un additif à un texte existant, c'est **le
document complet**. Les 32 chapitres de la V1 y figurent et restent à rédiger ;
les apports V2 viennent s'y insérer. Rien de la V1 n'est retiré.

**Numérotation** : n'ayant aucune numérotation V1 à poursuivre, les exigences
partent de `FR-100`, `BR-100`, `NFR-100`, `ADR-001` — conformément à ta consigne
de repli.

### 2. Les apports V2 ne forment pas un bloc à la suite

Ta consigne contient deux règles qui se contredisent partiellement :

> « Ajoute au CDC les sections suivantes (numérote-les à la suite de la V1) »

> « Si un point de la V1 est incomplet, tu le complètes en gardant sa
> numérotation d'origine et en ajoutant des sous-sections. »

Sept de tes douze blocs V2 approfondissent un chapitre V1 existant : les
notifications sont le chapitre 20, l'audit le chapitre 21, la sécurité le 23, le
modèle de données le 24, les tableaux de bord le 27, les cas d'erreur le 28-29,
les rôles internes le 9 et le 22. Les reléguer en fin de document créerait deux
chapitres concurrents sur le même sujet.

**Arbitrage retenu** : le contenu qui approfondit un chapitre existant y est
intégré comme sous-sections (règle 2) ; le contenu réellement nouveau devient
les chapitres 33 à 37 (règle 1). Le tableau de correspondance en §Annexe A
montre où atterrit chacun de tes douze blocs — aucun n'est perdu.

Si tu préfères un bloc V2 strictement séquentiel en fin de document, dis-le et je
réorganise avant rédaction.

### 3. Le document décrit une cible, pas l'état actuel

Une part importante de la V2 n'est **pas encore codée**. J'ai vérifié dans le
dépôt plutôt que de supposer :

| Constat vérifié | Conséquence pour le CDC |
|---|---|
| La table `journal_audit` existe mais **aucun code ne l'alimente** (0 écriture dans `backend/src/`) | Le chapitre 21 spécifie un système à construire, pas à documenter |
| **Aucun rate limiting** (pas de middleware, pas de dépendance) | NFR à créer intégralement (§23.4) |
| **Aucune gestion de session** : JWT 24 h sans refresh token ni révocation | §23.3 est un chantier neuf |
| WhatsApp n'envoie **que l'OTP** | Le catalogue de notifications (§20) est à 95 % à construire |
| Le référentiel académique (facultés, filières, années, sessions, promotions, inscriptions) **vient d'être livré** en base | §24 documente l'existant pour ces 6 tables |

Chaque chapitre porte donc un marqueur d'implémentation. Sans lui, le document
laisserait croire que la plateforme fait déjà ce qu'elle décrit — l'erreur la
plus coûteuse en soutenance.

**Légende** — ✅ implémenté et testé · 🔨 partiel · ⬜ à construire · 📄 documentaire

---

## Conventions de numérotation

| Préfixe | Objet | Plage V2 |
|---|---|---|
| `FR-xxx` | Exigence fonctionnelle | FR-100 → FR-499 |
| `BR-xxx` | Règle métier | BR-100 → BR-299 |
| `NFR-xxx` | Exigence non fonctionnelle | NFR-100 → NFR-199 |
| `ADR-xxx` | Décision d'architecture (format Nygard) | ADR-001 → ADR-012 |
| `ERR-xxx` | Cas d'erreur ou cas exceptionnel catalogué | ERR-001 → ERR-099 |

Chaque exigence est atomique, testable, et référencée depuis le chapitre qui la
met en œuvre.

---

# Table des matières

## Partie I — Fondations

**1. [Introduction](#1-introduction)** 📄
- 1.1 Objet et portée du document
- 1.2 Public visé et modes de lecture
- 1.3 Glossaire métier (français) et technique (anglais)
- 1.4 Références normatives et documents liés
- 1.5 Historique des versions

**2. [Vision du projet](#2-vision-du-projet)** 📄
- 2.1 Le problème : la fraude aux diplômes au Togo
- 2.2 Le modèle administratif togolais comme référence
- 2.3 Positionnement : infrastructure publique, pas produit commercial
- 2.4 Ce que la plateforme ne fait pas (hors périmètre explicite)

**3. [Objectifs](#3-objectifs)** 📄
- 3.1 Objectifs métier et indicateurs de succès
- 3.2 Objectifs techniques
- 3.3 Contraintes : budget, délai, contexte de stage
- 3.4 Critères d'acceptation du MVP

**4. [Architecture globale](#4-architecture-globale)** ✅
- 4.1 Vue d'ensemble : back-office, front-office, API, blockchain
- 4.2 Flux principal de bout en bout
- 4.3 Frontières de confiance et zones de sécurité
- 4.4 Stockage hybride off-chain / on-chain → renvoi [ADR-012](#adr-012)

**5. [Architecture technique](#5-architecture-technique)** ✅
- 5.1 Stack et justification de chaque choix
- 5.2 Architecture backend en couches : Route → Middleware → Controller → Service → Model
- 5.3 Découpage en services applicatifs → détaillé au [chapitre 37](#37-évolutivité-et-découplage)
- 5.4 Conventions de code et format de réponse API
- 5.5 Environnements : développement, test, démonstration, production

**6. [Les acteurs](#6-les-acteurs)** ✅
- 6.1 Établissement, Ministère, Candidat, Admin système, Vérificateur public
- 6.2 Matrice acteurs × cas d'usage
- 6.3 Cycle de vie de chaque acteur

**7. [Authentification](#7-authentification)** 🔨
- 7.1 Choix de l'OTP → renvoi [ADR-009](#adr-009)
- 7.2 Parcours en deux étapes : demande puis vérification
- 7.3 Canaux : WhatsApp Cloud API, SMS de secours, mode mock
- 7.4 Cycle de vie du code OTP : génération, durée, usage unique, purge
- 7.5 Émission du JWT et contenu du token
- 7.6 **[V2]** Sessions, refresh token et révocation → [§23.3](#233-sessions-et-jetons) ⬜
- 7.7 **[V2]** Récupération de compte en cas de perte du téléphone → [ERR-003](#err-003) ⬜

## Partie II — Domaines métier

**8. [Gestion des établissements](#8-gestion-des-établissements)** ✅
- 8.1 Création par le ministère → renvoi [ADR-003](#adr-003)
- 8.2 Cycle de vie : actif, suspendu, archivé
- 8.3 Fiche établissement et données de rattachement
- 8.4 **[V2]** Structure interne : facultés et filières ✅ *(schéma livré)*
- 8.5 **[V2]** Suspension et fermeture : effets en cascade → [ERR-005](#err-005) ⬜

**9. [Gestion des agents](#9-gestion-des-agents)** 🔨
- 9.1 Notion d'agent et rattachement à une entité
- 9.2 **[V2]** Hiérarchie interne à un établissement ⬜
  - 9.2.1 Agent de saisie
  - 9.2.2 Chef de scolarité
  - 9.2.3 Directeur ou responsable désigné
  - 9.2.4 Workflow interne : brouillon → contrôle interne → validé interne → soumis
  - 9.2.5 Matrice sous-rôles × actions
  - 9.2.6 Mode simple : établissement sans hiérarchie (sous-rôle configurable)
- 9.3 **[V2]** Agents du ministère et séparation des fonctions ⬜
- 9.4 **[V2]** Départ d'un agent : désactivation, révocation de session, transfert des dossiers → [ERR-004](#err-004) ⬜

**10. [Gestion des promotions](#10-gestion-des-promotions)** 🔨
- 10.1 Définition : cohorte (filière, niveau, année académique) ✅ *(schéma livré)*
- 10.2 Années académiques et sessions (normale, rattrapage, exceptionnelle) ✅ *(schéma livré)*
- 10.3 Cycle de vie d'une promotion : brouillon → ouverte → transmise → certifiée → clôturée ⬜
- 10.4 Transmission par promotion → renvoi [ADR-004](#adr-004)
- 10.5 Import Excel : format attendu, validation ligne à ligne, rapport d'erreurs ⬜
- 10.6 Effectifs, écarts et réconciliation ⬜

**11. [Gestion des étudiants](#11-gestion-des-étudiants)** 🔨
- 11.1 Fiche étudiant et identité ✅
- 11.2 Terminologie : `candidat` en base, « étudiant » à l'écran
- 11.3 Le candidat ne s'inscrit pas lui-même → renvoi [ADR-002](#adr-002)
- 11.4 **[V2]** Inscriptions et parcours pluriannuel ✅ *(schéma livré)*
- 11.5 **[V2]** Historique complet : L1 → L2 → L3, redoublements, abandons 🔨
- 11.6 **[V2]** Changement de nom (mariage, décision de justice) → [ERR-001](#err-001) ⬜

## Partie III — Cœur de la certification

**12. [Workflow de certification](#12-workflow-de-certification)** ✅
- 12.1 Machine à états du dossier et transitions autorisées
- 12.2 Instruction côté ministère : examen, validation, rejet motivé
- 12.3 Passage à `certifié` : opération atomique
- 12.4 Révocation et motif
- 12.5 **[V2]** Historique des changements de statut (table dédiée) ⬜
- 12.6 **[V2]** Certification massive d'une promotion → [chapitre 33](#33-performances-et-traitement-asynchrone) ⬜
- 12.7 **[V2]** Double certification accidentelle → [ERR-008](#err-008) ⬜

**13. [Génération du diplôme](#13-génération-du-diplôme)** ✅
- 13.1 Données canoniques et calcul du hash SHA-256
- 13.2 Signature du ministère
- 13.3 Composition du PDF
- 13.4 Stockage des fichiers et exposition
- 13.5 **[V2]** Versionnement d'un diplôme : v1, v2, chaînage, recalcul du hash ⬜
- 13.6 **[V2]** Révocation et réémission → [ERR-002](#err-002) ⬜

**14. [Wallet numérique](#14-wallet-numérique)** ✅
- 14.1 Portefeuille du candidat
- 14.2 Consultation, téléchargement, partage
- 14.3 **[V2]** Comportement pendant l'ancrage blockchain → [§33.5](#335-expérience-utilisateur-pendant-lancrage) ⬜
- 14.4 **[V2]** Alerte de consultation de ses diplômes par un tiers ⬜

**15. [Vérification publique](#15-vérification-publique)** ✅
- 15.1 Vérification sans compte : par hash ou par référence
- 15.2 Vue publique et données volontairement masquées
- 15.3 Journalisation des vérifications
- 15.4 **[V2]** Affichage d'un diplôme révoqué → [ERR-009](#err-009) ⬜
- 15.5 **[V2]** Affichage d'un diplôme en attente d'ancrage ⬜
- 15.6 **[V2]** Rate limiting et anti-énumération → [§23.4](#234-rate-limiting) ⬜

**16. [Blockchain](#16-blockchain)** ✅
- 16.1 Rôle exact de la chaîne dans le dispositif
- 16.2 Modes `mock` et `onchain`
- 16.3 Déploiement Polygon Amoy : adresse, réseau, propriétaire
- 16.4 Réconciliation base ↔ chaîne
- 16.5 **[V2]** Échec de transaction et file d'attente → [ERR-007](#err-007) ⬜
- 16.6 **[V2]** Données mixtes : diplômes de démonstration non ancrés 📄

**17. [Smart Contract](#17-smart-contract)** ✅
- 17.1 `RegistreDiplomes` : interface et contrôle d'accès
- 17.2 Structures stockées on-chain
- 17.3 Événements émis
- 17.4 Couverture de tests (16 tests)
- 17.5 **[V2]** Limite connue : le contrat ignore la notion de remplacement ⚠️
- 17.6 **[V2]** Évolution du contrat : redéploiement, migration, adresse historique ⬜

**18. [QR Code](#18-qr-code)** ✅
- 18.1 Contenu : une URL de vérification, pas le diplôme → renvoi [ADR-005](#adr-005)
- 18.2 Génération, format, stockage
- 18.3 Résistance à la copie et limites assumées

## Partie IV — Exploitation de la plateforme

**19. [Gestion des comptes](#19-gestion-des-comptes)** ✅
- 19.1 Création, cohérence rôle ↔ rattachement, activation
- 19.2 **[V2]** Désactivation et effets immédiats ⬜

**20. [Notifications](#20-notifications)** 🔨
- 20.1 Architecture du service et canaux (WhatsApp, SMS, email, in-app)
- 20.2 **[V2]** Catalogue exhaustif : événement × destinataire × canal × priorité × modèle ⬜
- 20.3 **[V2]** Les 15 événements obligatoires ⬜
- 20.4 **[V2]** Centre de notifications in-app ⬜
- 20.5 **[V2]** Préférences, désabonnement, silence ⬜
- 20.6 **[V2]** Reprise sur échec d'envoi ⬜

**21. [Journalisation et audit](#21-journalisation-et-audit)** ⬜
- 21.1 **[V2]** Format d'une entrée : horodatage, utilisateur, rôle, action, entité, valeurs avant/après, IP, user-agent, résultat, corrélation blockchain
- 21.2 **[V2]** Catalogue des 30 à 40 actions à journaliser obligatoirement
- 21.3 **[V2]** Durée de conservation et purge
- 21.4 **[V2]** Droits de consultation par rôle
- 21.5 **[V2]** Export et intégrité du journal
- 21.6 **[V2]** Corbeille et restauration (suppression réversible)

> ⚠️ La table `journal_audit` existe depuis la Phase 1 mais **aucun code ne
> l'alimente**. Ce chapitre spécifie un système à construire.

**22. [Permissions](#22-permissions)** 🔨
- 22.1 État actuel : quatre rôles figés par contrainte `CHECK`
- 22.2 **[V2]** Modèle cible : rôles, permissions, rattachements ⬜
- 22.3 **[V2]** Matrice complète permissions × actions × rôles ⬜
- 22.4 **[V2]** Isolation par établissement : règle transverse
- 22.5 **[V2]** Élévation de privilège et double validation → [§23.2](#232-double-validation) ⬜

**23. [Sécurité](#23-sécurité)** 🔨
- 23.1 **[V2]** Clé privée du ministère — section critique ⬜
  - 23.1.1 Où elle est stockée : options classées par niveau (KMS, HSM logiciel, HSM matériel, cold wallet multisig)
  - 23.1.2 Qui peut l'utiliser : jamais un humain, signature via API contrôlée et auditée
  - 23.1.3 Protection : chiffrement au repos, contrôle d'accès, séparation des privilèges, rotation
  - 23.1.4 Compromission : procédure de rotation, sort des diplômes déjà signés, communication publique → [ERR-006](#err-006)
- 23.2 **[V2]** Double validation pour les actions critiques ⬜
- 23.3 **[V2]** Sessions et jetons : durée, refresh, révocation, sessions concurrentes ⬜
- 23.4 **[V2]** Rate limiting : vérification publique, envoi d'OTP, tentatives de connexion ⬜
- 23.5 **[V2]** Attaques classiques : injection SQL, XSS, CSRF, brute force OTP, énumération de comptes 🔨
- 23.6 Secrets et configuration : `.env`, absence de valeur de repli ✅

## Partie V — Fondations techniques

**24. [Base de données](#24-base-de-données)** 🔨
- 24.1 Principes : SQL brut, requêtes paramétrées, énumérations par `CHECK`
- 24.2 Mécanisme de migration incrémentale (`schema_migrations`) ✅
- 24.3 **Schéma complet, table par table** — colonnes, types, contraintes, clés étrangères avec `ON DELETE`, index, `CHECK` métier, `COMMENT ON`
  - 24.3.1 Identité et accès — `utilisateurs`, `roles`, `permissions`, `sessions`, `codes_otp` 🔨
  - 24.3.2 Institutions — `ministeres`, `etablissements`, `agents_etablissement`, `agents_ministere` 🔨
  - 24.3.3 Structure académique — `facultes`, `filieres`, `annees_academiques`, `sessions_academiques`, `promotions`, `inscriptions` ✅
  - 24.3.4 Nomenclatures — `types_diplome`, `mentions` ⬜
  - 24.3.5 Population — `candidats` ✅
  - 24.3.6 Instruction — `dossiers`, `historique_statuts_dossier` 🔨
  - 24.3.7 Certification — `diplomes`, `versions_diplome`, `certifications` 🔨
  - 24.3.8 Ancrage — `transactions_blockchain`, `file_attente_ancrage` 🔨
  - 24.3.9 Cryptographie — `cles_publiques_ministere` ⬜
  - 24.3.10 Exploitation — `verifications`, `notifications`, `journal_audit` 🔨
- 24.4 Diagramme entité-association d'ensemble
- 24.5 DDL PostgreSQL exécutable, commenté
- 24.6 Stratégie de migration depuis le schéma actuel

**25. [API Backend](#25-api-backend)** ✅
- 25.1 Conventions REST et format de réponse homogène
- 25.2 Catalogue des endpoints par module
- 25.3 Codes d'erreur applicatifs
- 25.4 **[V2]** Versionnement de l'API ⬜
- 25.5 **[V2]** API d'intégration pour les logiciels des universités : clés, quotas, webhooks ⬜

**26. [Frontend](#26-frontend)** ✅
- 26.1 Deux applications, deux publics
- 26.2 Design system Material 3 (vert Togo et jaune), Manrope/Inter
- 26.3 Routage, contexte d'authentification, routes protégées
- 26.4 **Description écran par écran** : composition, actions, états vides, états d'erreur
- 26.5 Accessibilité et affichage mobile

**27. [Tableau de bord](#27-tableau-de-bord)** 🔨
- 27.1 **[V2]** KPI du ministère : volumes, top 10 établissements, délai moyen, taux de rejet, répartitions, coût gas cumulé, vérifications par jour ⬜
- 27.2 **[V2]** KPI de l'établissement : promotions transmises/en attente/rejetées, délai moyen, motifs de rejet agrégés ⬜
- 27.3 **[V2]** KPI du candidat : diplômes, vérifications subies, alertes ⬜
- 27.4 **[V2]** KPI de l'admin : santé système, succès des transactions, taille de file, temps de réponse API, charge base ⬜
- 27.5 **[V2]** Exports et rapports planifiés ⬜

## Partie VI — Robustesse

**28. [Cas d'erreur](#28-cas-derreur)** ⬜
- 28.1 **[V2]** Taxonomie : erreur utilisateur, erreur métier, erreur technique
- 28.2 **[V2]** Contrat d'erreur de l'API et correspondance HTTP
- 28.3 **[V2]** Restitution à l'écran : message, action corrective, recours
- 28.4 **[V2]** Erreurs silencieuses et détection

**29. [Cas exceptionnels](#29-cas-exceptionnels)** ⬜

Pour chaque cas : déclencheur · acteurs · workflow pas à pas · impact base ·
impact blockchain · traces d'audit · notifications émises.

| Réf. | Cas |
|---|---|
| <a id="err-001"></a>ERR-001 | Changement de nom d'un candidat (mariage, décision de justice) |
| <a id="err-002"></a>ERR-002 | Erreur détectée après certification — révocation et réémission |
| <a id="err-003"></a>ERR-003 | Candidat ayant perdu son téléphone — récupération de compte |
| <a id="err-004"></a>ERR-004 | Départ d'un agent — désactivation et transfert des dossiers |
| <a id="err-005"></a>ERR-005 | Établissement suspendu ou fermé |
| <a id="err-006"></a>ERR-006 | Compromission suspectée de la clé privée du ministère |
| <a id="err-007"></a>ERR-007 | Échec d'une transaction blockchain — file, retry, notification |
| <a id="err-008"></a>ERR-008 | Double certification accidentelle d'un même dossier |
| <a id="err-009"></a>ERR-009 | Consultation publique d'un diplôme révoqué |

**30. [Roadmap](#30-roadmap)** 📄
- 30.1 Phases 1 à 8 livrées
- 30.2 Chantiers V2 ordonnés par dépendance
- 30.3 Découpage MVP / V1 / Vision et priorisation des exigences
- 30.4 Jalons de soutenance

**31. [Tests](#31-tests)** 🔨
- 31.1 Stratégie et pyramide de tests
- 31.2 Tests d'intégration backend sur base dédiée ✅
- 31.3 Tests du smart contract ✅
- 31.4 **[V2]** Tests de charge : promotion de 12 000 diplômés ⬜
- 31.5 **[V2]** Tests de sécurité ⬜
- 31.6 Intégration continue et critères de blocage

**32. [Améliorations futures](#32-améliorations-futures)** 📄
- 32.1 Passage en mainnet
- 32.2 Interopérabilité internationale
- 32.3 Reconnaissance optique et reprise de l'existant papier
- 32.4 Ouverture à d'autres ministères

## Partie VII — Extensions V2

**33. [Performances et traitement asynchrone](#33-performances-et-traitement-asynchrone)** ⬜
- 33.1 Cas d'usage de référence : 12 000 diplômés en une soumission
- 33.2 Pourquoi le modèle synchrone est rejeté (démonstration chiffrée)
- 33.3 Modèle par file d'attente : producteur, worker, priorité, retry exponentiel, dead letter queue → renvoi [ADR-007](#adr-007)
- 33.4 États intermédiaires : « en attente d'ancrage » puis « certifié »
- 33.5 <a id="335-expérience-utilisateur-pendant-lancrage"></a>Expérience utilisateur pendant l'ancrage
  - 33.5.1 Progression côté ministère : « 8 245 / 12 000 ancrés »
  - 33.5.2 Côté candidat : visibilité, téléchargement, partage
  - 33.5.3 Côté vérificateur public : que répond l'API
- 33.6 Reprise après incident et idempotence
- 33.7 Dimensionnement et exigences chiffrées (NFR)

**34. [Coûts blockchain et gestion du gas](#34-coûts-blockchain-et-gestion-du-gas)** ⬜
- 34.1 Coût mesuré sur Amoy (≈ 0,0075 POL par opération) et projection mainnet
- 34.2 Wallet de service : alimentation, seuil d'alerte bas, procédure de recharge
- 34.3 Optimisation par lots (batching)
- 34.4 Optimisation par arbre de Merkle : une racine par promotion, preuves individuelles
- 34.5 Planification hors heures de pointe
- 34.6 Compromis lisibilité on-chain contre coût — tableau comparatif

**35. [Décisions d'architecture (ADR)](#35-décisions-darchitecture-adr)** 📄

Format Michael Nygard : Contexte · Décision · Statut · Conséquences positives et
négatives.

| Réf. | Décision |
|---|---|
| <a id="adr-001"></a>ADR-001 | PostgreSQL centralisée plutôt que distribuée |
| <a id="adr-002"></a>ADR-002 | Le candidat ne s'inscrit pas lui-même |
| <a id="adr-003"></a>ADR-003 | Le ministère crée les établissements |
| <a id="adr-004"></a>ADR-004 | Transmission par promotion et non diplômé par diplômé |
| <a id="adr-005"></a>ADR-005 | Le QR code porte une URL de vérification, pas le diplôme |
| <a id="adr-006"></a>ADR-006 | La blockchain ne stocke que le hash |
| <a id="adr-007"></a>ADR-007 | File d'attente pour les transactions blockchain |
| <a id="adr-008"></a>ADR-008 | Polygon plutôt qu'Ethereum, Hyperledger Fabric ou Indy |
| <a id="adr-009"></a>ADR-009 | OTP WhatsApp/SMS plutôt que mot de passe |
| <a id="adr-010"></a>ADR-010 | Architecture en services découplés |
| <a id="adr-011"></a>ADR-011 | Back-office et front-office séparés |
| <a id="adr-012"></a>ADR-012 | Stockage hybride off-chain / on-chain |

**36. [Argumentaire pour le jury](#36-argumentaire-pour-le-jury)** 📄
- 36.1 Qui détient la clé privée du ministère et comment elle est protégée — résumé exécutif de [§23.1](#23-sécurité)
- 36.2 Pourquoi une blockchain plutôt qu'une simple base de données
  - 36.2.1 Intégrité vérifiable par un tiers sans faire confiance au serveur
  - 36.2.2 Non-répudiation
  - 36.2.3 Résistance à la falsification interne
  - 36.2.4 Interopérabilité internationale
- 36.3 Objections probables et réponses préparées
- 36.4 Limites assumées du dispositif

**37. [Évolutivité et découplage](#37-évolutivité-et-découplage)** 🔨
- 37.1 Principe : services applicatifs indépendants dans un monolithe modulaire
- 37.2 Service d'authentification — responsabilités, interface, extraction possible
- 37.3 Service blockchain
- 37.4 Service de génération documentaire (PDF, QR)
- 37.5 Service de notifications
- 37.6 Service de statistiques
- 37.7 Critères déclenchant une extraction en micro-service
- 37.8 Ce qui ne doit pas être découplé et pourquoi

## Annexes

**Annexe A — [Correspondance demande V2 → chapitres](#annexe-a)**
**Annexe B — Index des exigences (FR, BR, NFR)**
**Annexe C — Index des décisions d'architecture**
**Annexe D — Glossaire**
**Annexe E — [Ce qui a changé entre V1 et V2](#annexe-e)**

---

<a id="annexe-a"></a>
## Annexe A — Correspondance : ta demande V2 → chapitres du document

Vérification que rien n'est perdu par l'arbitrage exposé en note méthodologique.

| Bloc demandé | Destination | Nature |
|---|---|---|
| 1. Cas exceptionnels et gestion des erreurs | Ch. 28 et 29 (ERR-001 → ERR-009) | Approfondit la V1 |
| 2. Rôles internes à un établissement | §9.2, §9.3, §9.4 et §22.3 | Approfondit la V1 |
| 3. Système complet de notifications | §20.2 → §20.6 | Approfondit la V1 |
| 4. Journalisation et audit | Ch. 21 intégral | Approfondit la V1 |
| 5. Statistiques et tableaux de bord | Ch. 27 intégral | Approfondit la V1 |
| 6. Performances et traitement asynchrone | **Ch. 33** | Chapitre neuf |
| 7. Coûts blockchain et gestion du gas | **Ch. 34** | Chapitre neuf |
| 8. Sécurité renforcée | §23.1 → §23.5 | Approfondit la V1 |
| 9. Modèle de données complet | §24.3 (10 sous-sections) + DDL §24.5 | Approfondit la V1 |
| 10. Décisions d'architecture | **Ch. 35** (ADR-001 → ADR-012) | Chapitre neuf |
| 11. Argumentaire jury | **Ch. 36** | Chapitre neuf |
| 12. Évolutivité et découplage | **Ch. 37** | Chapitre neuf |

---

<a id="annexe-e"></a>
## Annexe E — Ce qui a changé entre V1 et V2

| Domaine | V1 | V2 | Impact code |
|---|---|---|---|
| **Identité** | un compte lié à UNE fiche étudiant | table `personnes` : une personne, N fiches | migration 004, portefeuille national possible |
| **Structure académique** | aucune | facultés, filières, années, sessions, promotions, inscriptions | migration 002, 6 tables |
| **Peuplement** | saisie un par un | + import Excel/CSV, rapport ligne à ligne, simulation | `import.service.js`, ExcelJS |
| **Transmission** | dossier par dossier | **par lot**, avec rejet partiel | migration 006, `lot.service.js` |
| **Instruction** | manuelle intégrale | contrôles automatiques + anomalies statistiques | `controle.service.js` |
| **Gouvernance** | admin crée les établissements | **ministère agrée** : code officiel, habilitations, agent principal | migration 005, route admin supprimée |
| **Entrée d'un établissement** | aucune procédure | demande d'intégration publique, instruite | table `demandes_integration` |
| **Rôles internes** | établissement = acteur unique | 3 sous-rôles + mode simple/hiérarchique | migration 012 |
| **Certification de masse** | synchrone | **file d'ancrage**, worker, retry, DLQ | migration 008, `ancrage.service.js` |
| **Statut du diplôme** | actif / révoqué | + `en_attente_ancrage`, + **`remplace`** | migrations 008, 011 |
| **Correction** | impossible | **versionnement** : v1 remplacée par v2, chaîne consultable | migration 011 |
| **Coût blockchain** | invisible (`gas_used` NULL) | mesuré, stocké, ventilé par établissement | `blockchain.service.js` |
| **Audit** | table vide, aucune écriture | **43 actions**, avant/après, IP, corrélation blockchain | migration 007, `AsyncLocalStorage` |
| **Suppression** | définitive | **corbeille** avec restauration à l'identifiant d'origine | table `corbeille` |
| **Notifications** | OTP seulement | **20 événements**, centre in-app, préférences | migration 009 |
| **Sessions** | JWT 24 h non révocable | sessions en base, refresh, révocation immédiate | migration 010 |
| **Anti-force brute** | aucun | 5 essais, code brûlé | `codes_otp.tentatives` |
| **Énumération de comptes** | 404 / 403 révélateurs | **réponse identique** dans tous les cas | `auth.service.js` |
| **Limitation de débit** | aucune | 5 surfaces protégées | `rate-limit.middleware.js` |
| **Second facteur** | aucun | **contrôle à quatre yeux** (seconde personne) | migration 010, ADR-015 |
| **Cas exceptionnels** | non traités | ERR-001 à ERR-009 implémentés et testés | migrations 011, 013 |
| **Clé de signature** | valeur de repli codée en dur | registre d'empreintes, procédure de compromission | migration 013 |
| **Tableaux de bord** | statistiques partielles | 4 vues par rôle + métriques d'API | `tableau-bord.service.js` |
| **Migrations** | fichier unique destructif | **13 migrations incrémentales** suivies | `run-migrations.js` |
| **Tests** | 41 | **186** | — |
| **Documentation** | aucune | 37 chapitres, 16 ADR | `docs/cdc/` |

---

## Ordre de rédaction proposé

Les chapitres ne sont pas indépendants : certains fixent des choix dont les
autres dépendent. Je propose de rédiger dans cet ordre plutôt que de 1 à 37.

| Rang | Chapitres | Pourquoi d'abord |
|---|---|---|
| 1 | **35** (ADR) | Les douze décisions gouvernent tout le reste. Rédigées en premier, elles évitent de justifier deux fois. |
| 2 | **24** (modèle de données) | Chapitre le plus lourd et le plus structurant ; presque tous les autres s'y réfèrent. |
| 3 | **9, 22** (rôles et permissions) | Conditionnent les workflows et l'ensemble des matrices. |
| 4 | **12, 33, 34** (certification, asynchrone, gas) | Le cœur métier et sa contrainte de passage à l'échelle. |
| 5 | **21, 20, 27** (audit, notifications, tableaux de bord) | Trois systèmes transverses qui consomment les événements définis plus haut. |
| 6 | **23** (sécurité) | S'appuie sur les sessions, permissions et clés déjà spécifiées. |
| 7 | **28, 29** (erreurs et cas exceptionnels) | Ne peuvent être précis qu'une fois le happy path figé. |
| 8 | **1-8, 10-11, 13-19, 25-26, 30-32, 36-37** | Rédaction de complétion. |

---

## Points en attente de ta décision

1. **Arbitrage de numérotation** (note méthodologique §2) : insertion dans les
   chapitres V1 existants, ou bloc V2 strictement séquentiel en fin de document ?
2. **Ordre de rédaction** : celui proposé ci-dessus, ou l'ordre 1 → 37 ?
3. **Priorisation** : dois-je taguer chaque exigence `[MVP]` / `[V1]` /
   `[VISION]` ? Sans cela, le document ne dira pas ce qui doit être codé avant la
   soutenance.
4. **Format de sortie** : ce fichier unique, ou un fichier par partie dans
   `docs/cdc/` — plus maniable pour 120 pages, et plus lisible en revue de code.
