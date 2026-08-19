# CLAUDE.md — CertifTOGO

Document de référence du projet pour Claude Code (et pour l'équipe). Il résume le
contexte, l'architecture, la stack, les conventions et les commandes utiles.

---

## 1. Contexte

**CertifTOGO** est une plateforme web de **certification et de traçabilité des
diplômes basée sur la blockchain**, calquée sur le modèle administratif togolais
(comme le Baccalauréat) :

1. Les **établissements** saisissent les candidats et transmettent les dossiers.
2. Le **ministère** valide, certifie, signe cryptographiquement et enregistre le
   diplôme sur la blockchain.
3. Le public **vérifie** un diplôme instantanément par hash ou QR code.

**Objectif :** lutter contre la fraude aux diplômes.

Projet de stage de fin de cycle — Licence Génie Logiciel (Parcours GLSI).

---

## 2. Architecture

Monorepo composé de **deux applications web** partageant la même base PostgreSQL
et (à terme) le même smart contract :

- **Back-office** (`frontend-back-office/`) — privé, authentification **OTP**.
  Pour établissement, ministère, candidat, admin système.
- **Front-office** (`frontend-public/`) — public, sans compte. Vérification
  uniquement.
- **Backend** (`backend/`) — API REST Node.js/Express + PostgreSQL.
- **Blockchain** (`blockchain/`) — smart contract Solidity, déployé sur
  Polygon Amoy (§11).

### Acteurs / rôles
| Rôle | Accès | Fonctions principales |
|------|-------|-----------------------|
| Établissement | back-office (OTP) | saisie candidats, transmission dossiers |
| Ministère | back-office (OTP) | validation, certification, révocation |
| Candidat | back-office (OTP) | portefeuille de diplômes |
| Admin système | back-office (OTP) | gestion comptes, configuration |
| Vérificateur | front-office (public) | vérification hash / QR |

> Le rôle **établissement** se décline en trois **sous-rôles** (agent de saisie,
> chef de scolarité, directeur) quand `etablissements.mode_workflow = 'complet'`.
> Voir migration 012 en §4.

---

## 3. Stack technique

- **Backend :** Node.js + Express (ESM), PostgreSQL via driver `pg` (SQL brut,
  pas d'ORM), JWT, bcrypt, uuid.
- **Frontend :** React 18 + Vite, React Router v6, Tailwind CSS, axios.
- **Auth :** OTP 6 chiffres, sessions révocables en base. Deux modes
  (`WHATSAPP_MODE`) : `mock` par défaut (code affiché dans la console serveur) ou
  `cloud` (Meta WhatsApp Cloud API) — voir [`docs/WHATSAPP.md`](docs/WHATSAPP.md).
- **Blockchain :** Solidity 0.8, Hardhat, Polygon Amoy testnet, Ethers.js.

---

## 4. Modèle de données (PostgreSQL)

**37 tables métier**, réparties en **18 migrations incrémentales**. Les migrations
001 à 004 posent le socle ; 005 à 018 répondent une à une aux exigences du cahier
des charges (gouvernance, transmission par lot, audit, notifications, sécurité,
cas exceptionnels).

**`001_init_schema.sql`** — socle (10 tables) : `etablissements`, `ministeres`,
`candidats`, `utilisateurs`, `codes_otp`, `dossiers`, `diplomes`,
`transactions_blockchain`, `verifications_log`, `journal_audit`.

**`002_referentiel_academique.sql`** — référentiel académique (6 tables) :
`annees_academiques`, `sessions_academiques`, `facultes`, `filieres`,
`promotions`, `inscriptions`. Hiérarchie :

```
etablissement → faculte → filiere → promotion → inscription → candidat
                                       ↑
                     annee_academique + session_academique
```

> Le lien étudiant↔promotion passe par `inscriptions` (et non par une colonne
> sur `candidats`) afin de conserver le **parcours complet** : un étudiant
> cumule une inscription par année d'études.

**`003_coherence_promotion_session.sql`** — clé étrangère composite
`(session_id, annee_id)` : la session d'une promotion doit appartenir à l'année
de cette promotion, ce que 002 laissait passer.

**`004_identite_nationale.sql`** — table `personnes`. Sépare l'**identité**
(nationale, unique, porteuse du compte et du portefeuille) de ses **fiches
étudiant** (une par établissement fréquenté) :

```
personnes ──< candidats ──< dossiers ──< diplomes
    ↑
utilisateurs (compte de connexion)
```

> Avant cette migration, un diplômé de deux établissements ne pouvait pas
> exister : deux fiches `candidats`, mais un seul téléphone donc un seul
> compte possible. Son portefeuille n'aurait jamais montré que la moitié de
> ses diplômes. `utilisateurs.candidat_id` est remplacé par `personne_id`.

> **Cycle du compte candidat** : créé **à la saisie** mais `actif = false` ;
> la **certification l'active** (`diplome.service.js`). Un compte fermé ne
> peut pas demander d'OTP (403 `COMPTE_INACTIF`).

**`005_gouvernance_etablissements.sql`** — `habilitations`,
`demandes_integration`, et un **code administratif** sur `etablissements`
(IAI001, UL002). Trois manques comblés : l'établissement n'avait pas d'identifiant
officiel — seulement un UUID technique ; rien ne disait **quels diplômes il a le
droit de délivrer**, ce qui rendait impossible tout contrôle automatique à la
réception d'un lot ; et il ne pouvait pas **demander** son intégration, il fallait
qu'un administrateur le crée à la main, sans trace de la décision d'agrément.

> Ce n'est pas l'Université de Lomé qui se connecte, c'est un de ses agents.
> D'où la séparation entre l'**institution** (code officiel, habilitations) et
> les **comptes** qui agissent en son nom.

**`006_lots_transmission.sql`** — table `lots_transmission` et rattachement des
dossiers. `promotions.statut = 'transmise'` ne créait aucun dossier : la promotion
changeait d'état et le ministère ne recevait rien. Par ailleurs le ministère
instruisait dossier par dossier — irréaliste pour une promotion de 250 diplômés,
et jusqu'à 12 000 pour l'Université de Lomé.

```
promotion ──> lot_transmission ──< dossiers ──< diplomes
```

> **Le lot est l'unité de transmission et d'instruction ; le dossier reste
> l'unité de décision.** Un lot peut donc être *partiellement traité* : 247
> dossiers validés, 3 renvoyés avec leur motif. Sans cela, trois anomalies sur
> 250 bloqueraient toute la promotion. La `date_deliberation` de la promotion
> fait foi comme date d'obtention.

**`007_journal_audit.sql`** — format complet du journal (rôle, valeurs
avant/après, user-agent, résultat), plus `historique_statuts_dossier` et
`corbeille`. La table `journal_audit` existait depuis la Phase 1 mais **aucun
code ne l'alimentait** : zéro écriture dans tout `backend/src/`. L'historique des
statuts mérite sa propre table — c'est la pièce la plus consultée en cas de
litige. Toute suppression devient réversible.

**`008_file_ancrage.sql`** — `file_attente_ancrage` et le statut de diplôme
`en_attente_ancrage`. La certification était synchrone : à ~4 s de confirmation
par transaction, 12 000 diplômes tiendraient 13 heures dans un cycle HTTP. Le
diplôme existe désormais en base dès la décision du ministère ; un worker consomme
la file au rythme du réseau et le passe à `actif`.

> Statuts de diplôme : `en_attente_ancrage → actif → revoque`. La certification
> **unitaire** reste synchrone — sur un seul diplôme, attendre quatre secondes est
> acceptable et le résultat immédiat est plus clair pour l'agent.

**`009_notifications.sql`** — `notifications` et `preferences_notification`. Le
système n'envoyait qu'une chose : le code OTP. Un établissement ignorait que son
lot avait été rejeté, un diplômé que son diplôme était certifié.

> Une notification est d'abord une **ligne en base**, ensuite seulement un envoi :
> le centre in-app fonctionne même quand WhatsApp est indisponible, et un envoi
> échoué reste rejouable. Catalogue des événements dans
> `services/catalogue-notifications.js`.

**`010_securite_sessions.sql`** — `sessions` et `validations_critiques`. Trois
faiblesses : le JWT valait 24 h et **rien ne pouvait l'annuler** (désactiver un
compte ne fermait pas ses accès en cours) ; l'OTP n'avait **aucun plafond de
tentatives** — six chiffres tombent en quelques minutes avec un script ; et un
agent seul pouvait révoquer un diplôme ou certifier des milliers de dossiers.

> **Contrôle à quatre yeux.** Toute l'authentification reposant sur le téléphone,
> un appareil volé donne tous les droits de son titulaire : le second facteur
> utile n'est pas un second appareil, c'est une **seconde personne**.

**`011_versionnement_diplomes.sql`** — table `corrections_diplome`. Une diplômée
se marie et change de nom ; une erreur de mention est découverte après
certification. On ne peut pas modifier les données — le hash ancré ne
correspondrait plus, et c'est précisément ce que la blockchain empêche. La seule
réponse honnête est une **nouvelle version**, l'ancienne étant marquée *remplacée*.

> « Remplacé » n'est pas « révoqué ». Un diplôme révoqué a été **retiré** à son
> titulaire (fraude, annulation) ; un diplôme remplacé reste légitime, c'est sa
> forme qui a changé. Confondre les deux ferait passer une mariée pour une
> fraudeuse. `RegistreDiplomes` ne connaissant que `certifier()` et `revoquer()`,
> un remplacement se traduit on-chain par révocation + certification ; le **lien**
> entre versions vit hors chaîne, dans `corrections_diplome`.

**`012_sous_roles_etablissement.sql`** — `permissions`, `roles_permissions`,
`utilisateurs.sous_role`. « L'établissement » était un acteur unique : n'importe
quel agent pouvait saisir, corriger **et** transmettre au ministère. Trois
sous-rôles : **agent de saisie** (crée candidats et promotions), **chef de
scolarité** (contrôle, corrige, saisit les résultats), **directeur** (seul à
pouvoir engager l'institution en transmettant).

> `etablissements.mode_workflow = 'simple'` (défaut) : tous les agents ont toutes
> les permissions et la promotion passe directement de `ouverte` à `transmise`.
> Beaucoup d'établissements n'ont qu'une personne à la scolarité — leur imposer
> une hiérarchie qu'ils n'ont pas les bloquerait purement et simplement.

**`013_cas_exceptionnels.sql`** — `demandes_recuperation` et `cles_signature`.
Quatre situations sans réponse : un diplômé **perd son téléphone**, donc son seul
moyen de connexion (ERR-003) ; un agent **quitte son établissement** en laissant
des dossiers à son nom (ERR-004) ; un établissement est **suspendu** — que
deviennent ses transmissions et ses diplômes déjà certifiés (ERR-005) ; la **clé
de signature du ministère est compromise** (ERR-006).

> On ne stocke **jamais** la clé, seulement son empreinte : `cles_signature` sert
> à savoir quels diplômes ont été signés avec quelle clé, donc lesquels sont à
> re-signer en cas de compromission.

**`014_pieces_jointes.sql`** — table `pieces_jointes`. L'établissement
transmettait des **données** ; il transmet désormais aussi les **actes** qui les
fondent. Deux portées exclusives : individuelle (`candidat_id` — relevé de
notes, rapport de stage) et collective (`promotion_id` — procès-verbal de
délibération, arrêté de jury). Cycle : `deposee → vue → validee | rejetee`.

> Les fichiers vivent dans `backend/stockage/` (privé, ignoré par git), **jamais**
> dans `uploads/` qui est servi en statique : un PDF de diplôme est fait pour
> circuler, un relevé de notes non. Chaque lecture passe par
> `GET /api/pieces/:id/contenu`, qui vérifie le rôle, l'appartenance, puis
> recalcule l'empreinte SHA-256 — une substitution sur le disque est détectée.
> Un lot dont une pièce obligatoire manque, a été rejetée ou n'a pas été
> ouverte ne peut pas être validé (409).

> **La mention découle de la moyenne.** Elle n'est pas saisie : le service
> `nomenclature.mentionPourMoyenne()` applique les `seuil_min` de la table
> `mentions` (10 / 12 / 14 / 16 / 18). À barème national, deux étudiants de 14,0
> ont la même mention quel que soit l'agent qui les note. Une mention fournie
> qui contredit le barème est **refusée** (409 `MENTION_INCOHERENTE`) plutôt
> qu'écrasée en silence — la divergence vient le plus souvent d'une moyenne
> fausse. À l'import, la colonne `mention` peut rester vide ; une moyenne
> présente vaut délibération (admis au-dessus de 10, ajourné en dessous).

**`015_changement_numero.sql`** — table `changements_numero`. À ne pas confondre
avec la **récupération** (ERR-003, migration 013) : là, le titulaire a *perdu*
l'accès à son numéro et ne peut rien prouver à distance — un agent tranche en le
voyant, pièce d'identité en main. Ici il a **encore ses deux numéros**, il peut
donc prouver seul qu'il détient l'ancien *et* le nouveau.

> D'où la **double confirmation** : un code sur l'ancien numéro établit que le
> demandeur est le titulaire actuel ; un code sur le nouveau établit que le numéro
> visé lui appartient. Ne confirmer que le nouveau permettrait à quiconque a volé
> une session de déplacer le compte vers son téléphone ; ne confirmer que l'ancien
> permettrait d'envoyer le compte vers un numéro saisi de travers — et de le
> perdre définitivement.

**`016_nomenclatures.sql`** — tables `types_diplome` et `mentions`. Les listes
vivaient dans cinq contraintes `CHECK` répétées à l'identique : créer un « DUT »
demandait une migration et un redéploiement. Elles sont désormais des **données**,
et les `CHECK` ont laissé la place à des **clés étrangères** — le contrôle n'est
pas assoupli, il est déplacé. Une entrée ne se supprime jamais (des diplômes
ancrés y font référence) : elle se désactive, ce qui la retire des formulaires
sans toucher au passé. Lecture par `nomenclature.service.js` (cache 5 min) côté
serveur, `useNomenclatures` côté front.

**`017_types_piece_memoire.sql`** — élargit la liste des types de pièces à la
**page de garde du mémoire** et au **mémoire de fin de cycle**. Elle avait été
écrite pour un dossier administratif (relevé de notes, acte de naissance) et
ignorait ce qui fonde réellement un diplôme de fin de cycle. Sans nom propre,
ces documents tombaient dans « Autre document » — et un fourre-tout ne se
réclame pas. Tous deux restent **facultatifs** : toutes les filières ne
soutiennent pas de mémoire.

**`018_dossier_integration.sql`** — identité complète du demandeur et table
`pieces_demande`. La demande d'intégration (005) tenait en douze champs
déclaratifs : le ministère devait agréer un futur **certificateur** sur parole.
Le formulaire porte désormais les **données** (statut juridique, site,
représentant légal, responsable des certifications, contact informatique) et
les pièces les **prouvent** — lettre signée, acte de création, agrément,
présentation, liste des formations, pièce d'identité, plus registre de commerce
et attestation fiscale pour le privé.

> Table séparée de `pieces_jointes`, qui exige un `etablissement_id` : le
> demandeur n'en a pas, c'est précisément ce qu'il demande. D'où aussi le
> statut **`brouillon`** — on ne dépose pas huit fichiers dans la requête qui
> porte le formulaire, et une demande arrivée sans ses actes ferait perdre son
> tour à l'établissement. Le dossier n'entre dans la file du ministère qu'une
> fois **transmis**, pièces obligatoires vérifiées côté serveur. L'autorisation
> du déposant tient au **jeton** rendu une seule fois à l'ouverture : la
> référence (`DI-2026-00042`) se devine, elle ne peut pas tenir lieu de secret.

Les migrations sont **incrémentales** : `scripts/run-migrations.js` joue les
fichiers dans l'ordre et note chacun dans `schema_migrations`. Un fichier déjà
appliqué n'est jamais rejoué, les données sont donc préservées.

Points clés :
- `utilisateurs.role` ∈ {etablissement, ministere, candidat, admin_systeme}, avec
  un FK de rattachement cohérent selon le rôle (contrainte CHECK).
- Références métier : dossiers `CT-AAAA-XXXXX`, diplômes `DIP-AAAA-XXXXX`.
- Énumérations gérées par contraintes `CHECK` (pas de type ENUM natif).

---

## 5. Conventions de code

- **Métier en français** (`etablissement`, `candidat`, `dossier`, `certifier`…),
  **technique en anglais** (`controller`, `service`, `middleware`, `route`…).
- Composants React en **PascalCase** ; fichiers utilitaires en **kebab-case**.
- Tables/colonnes SQL en **snake_case**, tables au pluriel.
- **Architecture backend :** Route → Middleware → Controller → Service → Model → DB.
  Un fichier = une responsabilité.
- **Format de réponse API homogène :**
  - Succès : `{ "success": true, "data": { ... } }`
  - Erreur : `{ "success": false, "error": { "code": "...", "message": "..." } }`
- **Sécurité :** JWT (24h), validation des entrées, requêtes `pg` **paramétrées**
  (jamais de concaténation SQL).

---

## 6. Structure (extrait)

```
certiftogo/
├── backend/          API Express + SQL (migrations, seeds, scripts/seed-demo.mjs)
│   ├── uploads/      PDF et QR générés — servis en statique sous /uploads
│   └── stockage/     pièces justificatives — PRIVÉ, jamais servi en statique
├── frontend-back-office/   React (espace privé OTP, 4 rôles)
├── frontend-public/  React (vérification publique)
├── blockchain/       Solidity/Hardhat (contrat RegistreDiplomes)
├── docs/
│   ├── CDC-V2.md              cahier des charges (+ docs/cdc/)
│   ├── BACKLOG-V2.md          reste à faire
│   ├── DEPLOIEMENT.md         blueprint Render
│   ├── WHATSAPP.md            bascule mock → cloud
│   ├── SECURITE-DEPENDANCES.md
│   └── stitch-ui-prompts.md   design system / prompts UI
└── docker-compose.yml  PostgreSQL local (optionnel)
```

---

## 7. Commandes utiles

### Base de données
```bash
# Option Docker (à la racine)
docker compose up -d

# Ou PostgreSQL local : créer la base puis jouer schéma + seed
#   (voir README.md pour le détail)
cd backend
npm run migrate    # joue les migrations en attente (sûr à relancer)
npm run seed       # joue seeds/seed_dev.sql
npm run migrate:reset  # ⚠️ reconstruit le schéma (efface les données)
npm run db:reset   # schéma + seed d'un coup (⚠️ destructif)
npm run seed:demo  # AJOUTE un gros jeu de données de démo (via les vrais services)
npm run db:demo    # reset + seed + démo (données riches pour présentation)
```

### Backend
```bash
cd backend
npm install
npm run dev       # http://localhost:4000  (nodemon)
npm test          # 278 tests — exécution SÉQUENTIELLE (--test-concurrency=1) :
                  # les fichiers partagent la base certiftogo_test, et les écrire
                  # en parallèle corrompt le canal du test runner.
```

### Frontends
```bash
cd frontend-back-office && npm install && npm run dev   # back-office : http://localhost:5173
cd frontend-public      && npm install && npm run dev   # public      : http://localhost:5174
```

### Blockchain (optionnel — vérification on-chain réelle)
```bash
cd blockchain && npm install
npm test                           # 16 tests du contrat
npm run node                       # nœud Hardhat local (RPC :8545)
npm run deploy:local               # déploie RegistreDiplomes → note l'adresse
# puis dans backend/.env : BLOCKCHAIN_MODE=onchain, CONTRAT_ADRESSE=…,
#   BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545, BLOCKCHAIN_PRIVATE_KEY=… (compte autorisé)
```

> Le contrat est **déjà déployé sur Polygon Amoy** — pas besoin de nœud local
> pour une démo on-chain réelle. Voir **§11** pour l'adresse et la configuration.

---

## 8. Comptes de test (seed)

Connexion par OTP (le code s'affiche dans la **console du backend**) :

| Rôle | Téléphone |
|------|-----------|
| Ministère | `+22890000001` |
| Établissement (IAI Lomé) | `+22890000002` |
| Admin système | `+22890000003` |
| Candidat (Koffi) | `+22890000011` |
| Candidat (Ama) | `+22890000012` |
| Candidat (Yao) | `+22890000013` |

> Astuce présentation : `npm run seed:demo` remplit la base de données réalistes
> (établissements, dossiers dans tous les statuts, diplômes certifiés/révoqués).
> Les comptes candidats de test possèdent alors plusieurs diplômes.

---

## 9. Plan par phases

1. **Phase 1 :** structure + auth OTP + layout. ✅
2. **Phase 2 :** smart contract blockchain. ✅
3. **Phase 3 :** module établissement (candidats, dossiers). ✅
4. **Phase 4 :** module ministère + certification (hash, signature, PDF, QR,
   blockchain). ✅ — intégration Ethers réelle incluse (mode `mock`/`onchain`).
5. **Phase 5 :** front-office public (vérification). ✅
6. **Phase 6 :** portefeuille candidat. ✅
7. **Phase 7 :** admin système. ✅ *(notifications WhatsApp réelles : à venir)*
8. **Phase 8 :** tests automatisés ✅ + déploiement blockchain Amoy ✅ +
   CI ✅ + blueprint Render ✅ + intégration WhatsApp ✅.
   *Reste des étapes hors code : débloquer la facturation GitHub, créer le
   Blueprint Render, faire valider numéro et template par Meta.* ⏳
9. **Mise en conformité CDC (post-phases) :** gouvernance, transmission par lot,
   audit, ancrage asynchrone, notifications, sécurité (sessions, quatre yeux),
   versionnement des diplômes, sous-rôles, cas exceptionnels, pièces
   justificatives, nomenclatures. ✅ — migrations 005 à 016 (§4), détail en §10.
   Reste à faire : [`docs/BACKLOG-V2.md`](docs/BACKLOG-V2.md).

> **Refonte UI (post-phases)** : socle « service public » inspiré du DSFR et de
> GOV.UK — une couleur primaire (vert togolais), une échelle de gris, quatre
> couleurs d'état, une seule famille typographique (Inter), aucune ombre ni
> dégradé, séparations par filets de 1 px. Les jetons vivent dans
> `tailwind.config.js` (identique dans les deux fronts) et les composants dans
> `components/ui/index.jsx`. Les quatre espaces du back-office et le front
> public sont passés sur ce socle.

> On avance **phase par phase**, avec validation avant de créer les fichiers.

---

## 10. État actuel

**Phases 1–8 ✅**, plus un **cycle de mise en conformité avec le cahier des
charges** (migrations 005 à 016) détaillé en fin de section. Ne restent que des
étapes hors code : facturation GitHub, création du Blueprint Render, validation
du numéro et du template par Meta.

- ✅ Schéma BDD complet + seed de développement.
- ✅ API d'authentification OTP (`/api/auth/request-otp`, `/verify-otp`, `/me`).
- ✅ Middlewares JWT + contrôle de rôle.
- ✅ Back-office : login OTP 2 étapes, contexte Auth, route protégée, layout +
  sidebar dynamique par rôle.
- ✅ Blockchain : contrat `RegistreDiplomes` (Hardhat, Solidity 0.8.24) —
  certifier / révoquer / vérifier, contrôle d'accès, 16 tests verts, scripts de
  déploiement (local + Amoy) dans `blockchain/`.
- ✅ **Module établissement (Phase 3)** :
  - Backend : modules `candidats`, `dossiers`, `statistiques` complets
    (route → controller → service → model), montés dans `app.js`.
  - Workflow dossier : `brouillon → soumis` (transmission ministère),
    modification/suppression restreintes par statut, isolation par établissement.
  - Back-office : pages réelles pour le rôle établissement (Tableau de bord,
    Candidats, Dossiers, Statistiques) branchées via `config/pages.jsx`.
- ✅ **Module ministère (Phase 4, slice 1)** : instruction des dossiers reçus.
  - Backend : `/api/ministere/dossiers` (liste tous établissements + stats),
    transitions `examiner` / `valider` / `rejeter` (motif requis) — service
    `dossier-ministere.service.js`, contrôle de rôle `ministere`.
  - Back-office : page « Dossiers reçus » (file d'attente + actions + modale de
    rejet), branchée pour le rôle ministère dans `config/pages.jsx`.
- ✅ **Certification (Phase 4, slice 2)** : `valide → certifie`.
  - Services : `hash` (SHA-256 canonique), `signature` (HMAC ministère),
    `blockchain` (mock, interface prête pour Ethers), `qr` + `pdf` (fichiers
    dans `uploads/`, servis sous `/uploads`).
  - Module `diplome` (model/service) : émission atomique (diplôme + transaction
    blockchain + passage du dossier en `certifie`) et révocation (avec motif).
  - Endpoints : `POST /api/ministere/dossiers/:id/certifier`,
    `GET /api/ministere/diplomes`, `POST /api/ministere/diplomes/:id/revoquer`.
  - Back-office : bouton « Certifier » (dossier validé) + page « Diplômes
    certifiés » (accès PDF/QR, révocation).
- ✅ **Front-office public (Phase 5)** : vérification sans compte.
  - Backend : endpoint public `GET /api/verification/:code` (hash SHA-256 ou
    référence), journalisé dans `verifications_log`, résultat
    `authentique` / `revoque` / `introuvable` (vue publique sans données sensibles).
  - `frontend-public/` : app Vite/React/Tailwind (port 5174) — accueil (saisie)
    + page `/verifier/:code` (cible des QR codes générés à la certification)
    + page `/integration` — **dossier d'agrément** d'un établissement (§4,
    migration 018) : formulaire en deux étapes, checklist des pièces
    obligatoires, transmission, et suivi par référence. L'API existait depuis
    la migration 005, mais **aucun écran ne l'appelait** : la file du ministère
    ne pouvait se remplir qu'à la main.
- ✅ **Portefeuille candidat (Phase 6)** : le candidat consulte ses diplômes.
  - Backend : `/api/candidat/diplomes` + `/api/candidat/statistiques`
    (rôle `candidat`, isolation par `candidat_id`) — `portefeuille.service.js`.
  - Back-office : pages « Mon portefeuille » (tableau de bord) et « Mes diplômes »
    (cartes avec PDF / QR / lien de vérification publique), branchées pour le rôle
    candidat dans `config/pages.jsx`.
- ✅ **Admin système (Phase 7)** : gestion de la plateforme.
  - Backend : `/api/admin` (rôle `admin_systeme`) — stats globales,
    utilisateurs (liste / création avec cohérence rôle↔rattachement / activation),
    établissements (liste / création / suspension). Modèles `etablissement`,
    `admin` + extensions `utilisateur`.
  - Back-office : pages Tableau de bord (compteurs globaux), Utilisateurs et
    Établissements (rôle admin dans `config/pages.jsx` + entrée sidebar).
- ✅ **Référentiel académique (V2, backend)** : socle de la transmission par
  promotion.
  - Schéma : `annees_academiques`, `sessions_academiques`, `facultes`,
    `filieres`, `promotions`, `inscriptions` (migrations 002 et 003).
  - `/api/referentiel` — années et sessions. **Lecture ouverte à tout compte
    authentifié, écriture réservée au ministère** (les établissements doivent
    lire l'année ouverte pour rattacher leurs promotions).
  - `/api/structure` — facultés et filières, **isolées par établissement**.
  - `/api/promotions` — promotions, inscriptions, résultats et parcours
    pluriannuel d'un étudiant.
  - Cycle de vie d'une promotion : `brouillon → ouverte → transmise →
    certifiee → cloturee` (retours en arrière limités, sauts interdits).
  - Règles métier refusées côté service, pas seulement en base : niveau
    supérieur à la durée du cursus, session appartenant à une autre année,
    transmission d'une promotion vide, modification d'une promotion figée,
    mention sans admission, moyenne hors barème.
  - Exceptions : `traduireErreurSql()` (`utils/errors.js`) convertit les
    SQLSTATE PostgreSQL en erreurs métier, et le middleware d'erreurs sert de
    filet — **plus aucune contrainte violée ne remonte en 500**. Un
    identifiant qui n'est pas un UUID donne 404, plus 500.
  - Back-office : trois pages réelles branchées dans `config/pages.jsx` —
    **Structure** et **Promotions** (rôle établissement), **Années
    académiques** (rôle ministère), avec leurs entrées de sidebar.
    La page Promotions gère les inscriptions et la saisie des résultats ;
    l'interface ne propose que les transitions plausibles, le serveur reste
    seul juge.
- ✅ **Pages complémentaires** : ministère (tableau de bord, statistiques,
  annuaire établissements), candidat (paramètres), admin (configuration).
  **Plus aucun `PlaceholderPage` métier.**
- ✅ **Blockchain réelle** : `blockchain.service` câblé sur `RegistreDiplomes`
  via Ethers v6 (`BLOCKCHAIN_MODE=onchain`) — certifier / révoquer / lire l'état
  on-chain ; la vérification publique renvoie `ancrage_blockchain`. Testé de bout
  en bout sur un nœud Hardhat local. Défaut = `mock` (aucun nœud requis).
- ✅ **Refonte UI complète** (design system Material 3, Manrope/Inter, Material
  Symbols) sur le back-office (4 rôles) et le front public.
- ✅ **Seed de démo** (`npm run seed:demo`) : ~6 établissements, ~36 candidats,
  ~40 dossiers (tous statuts), ~20 diplômes (PDF/QR/hash réels), vérifications.
- ✅ **Tests automatisés (Phase 8)** :
  - Backend : `cd backend && npm test` — **278 tests** répartis en 6 fichiers.
    - `api.test.js` (238) — intégration sur une base dédiée `certiftogo_test`,
      recréée avant chaque exécution : auth OTP, RBAC, cycle de vie du dossier,
      certification, vérification publique, portefeuille candidat, admin et
      isolation inter-établissements ; référentiel académique et ses API ;
      identité nationale et portefeuille multi-établissements ; gouvernance
      (demandes d'intégration, habilitations) ; import Excel d'une promotion ;
      audit ; lots de transmission avec rejet partiel ; ancrage asynchrone ;
      correction d'un diplôme certifié ; tableaux de bord par rôle ; sessions
      révocables ; notifications ; contrôle à quatre yeux ; cas exceptionnels
      ERR-003 à ERR-006 ; sous-rôles d'établissement ; pièces justificatives
      (dépôt, instruction, intégrité) ; changement de numéro ; nomenclatures ;
      mention calculée ; traçabilité des clés de signature ; corbeille ;
      traduction des erreurs techniques.
    - `dates.test.js` (13) — `canoniserDate`, formes acceptées et refusées.
    - `pdf.test.js` (8) — génération du diplôme imprimé.
    - `securite.test.js` (5) — limitation de débit, jetons de session.
    - `signature.test.js` (7) — dont le refus de démarrer en production sans
      `MINISTERE_SIGNING_SECRET`.
    - `whatsapp.test.js` (7) — `fetch` doublé, aucun appel réseau.
  - Blockchain : `cd blockchain && npm test` — 16 tests du contrat.
- ✅ **Déploiement Polygon Amoy (Phase 8)** — voir §11.
- ✅ **CI (Phase 8)** : `.github/workflows/ci.yml` — tests backend sur un
  PostgreSQL éphémère, compilation + tests du contrat, build des deux frontends.
  Déclenché sur push `main` et sur PR.
- ✅ **Hébergement (Phase 8)** : blueprint Render `render.yaml` (PostgreSQL
  managé + API + 2 sites statiques) — procédure et limites dans
  [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).
- ✅ **Notifications WhatsApp (Phase 8)** : `whatsapp.service.js` gère deux modes
  (`WHATSAPP_MODE`) — `mock` (code en console, défaut, aucun identifiant) et
  `cloud` (envoi réel via la Meta Cloud API, template d'authentification).
  Procédure de bascule dans [`docs/WHATSAPP.md`](docs/WHATSAPP.md).
  ⏳ *Reste à faire côté Meta : validation du numéro et du template.*

### Après les phases — mise en conformité avec le cahier des charges

Les huit phases livraient un système qui marche ; ce second cycle le rend
**tenable à l'échelle nationale**. Migrations 005 à 016 (§4), et côté code :

- ✅ **Gouvernance** : codes officiels d'établissement, habilitations par type de
  diplôme, demandes d'intégration instruites par le ministère
  (`gouvernance.service.js`, `controle.service.js`).
- ✅ **Transmission par lot** : `lot.service.js` — émission depuis une promotion,
  contrôles automatiques à la réception, **rejet partiel** dossier par dossier.
- ✅ **Ancrage asynchrone** : `ancrage.service.js` + file d'attente ; le ministère
  ne bloque plus sur le réseau blockchain.
- ✅ **Audit** : `audit.service.js` alimente réellement `journal_audit`,
  historise les statuts de dossier et alimente une corbeille réversible.
- ✅ **Notifications** : `notification.service.js` + `catalogue-notifications.js`
  — centre in-app, préférences par canal, relais WhatsApp.
- ✅ **Sécurité** : `session.service.js` (sessions révocables, liste des appareils),
  plafond de tentatives OTP, `validation-critique.service.js` (quatre yeux),
  `rate-limit.middleware.js`.
- ✅ **Corrections** : `correction.service.js` — nouvelle version d'un diplôme
  certifié sans casser l'ancrage.
- ✅ **Sous-rôles** : `permissions.service.js` — agent de saisie / chef de
  scolarité / directeur, avec mode `simple` par défaut.
- ✅ **Cas exceptionnels** : `exceptions.service.js` — récupération de compte,
  départ d'agent, suspension d'établissement, rotation de clé de signature.
- ✅ **Pièces justificatives** : `piece-jointe.service.js` — dépôt, instruction,
  contrôle d'intégrité SHA-256 à chaque lecture.
- ✅ **Changement de numéro** : `changement-numero.service.js` (double confirmation).
- ✅ **Import Excel** : `import.service.js` — promotion entière, dates aux formats
  réellement écrits par les établissements.
- ✅ **Nomenclatures** : `nomenclature.service.js` (cache 5 min) ; la mention
  découle de la moyenne.
- ✅ **Tableaux de bord** : `tableau-bord.service.js`, un par rôle.
- ✅ **Back-office complété** : 28 pages métier (hors login) — établissement
  (7 : structure, promotions, candidats, dossiers, lots, agents, tableau de bord),
  ministère (9 : lots reçus, dossiers reçus, diplômes, ancrage, validations,
  demandes, établissements, années académiques, tableau de bord), admin (6 :
  utilisateurs, établissements, clés, corbeille, configuration, tableau de bord),
  candidat (3), commun (3 : notifications, journal, récupérations).
- ✅ **Dépendances backend assainies**, audit de sécurité intégré à la CI.

---

## 11. Déploiement blockchain — Polygon Amoy (testnet)

Le contrat `RegistreDiplomes` est déployé et **vérifié** sur le testnet public :

| | |
|---|---|
| Adresse | `0x42d2e5EE482c365E5b4737C2d476D127732495F6` |
| Réseau | Polygon Amoy (chainId **80002**) |
| Explorer | https://amoy.polygonscan.com/address/0x42d2e5EE482c365E5b4737C2d476D127732495F6#code |
| Propriétaire / certificateur | `0x038151d7d0A18B4fe604C94EeE72D8913A3b871D` |

**Points d'attention :**

- ⚠️ **L'endpoint RPC historique `rpc-amoy.polygon.technology` ne résout plus**
  (DNS mort). On utilise `https://polygon-amoy-bor-rpc.publicnode.com`
  (secours : `https://polygon-amoy.drpc.org`).
- Le constructeur autorise automatiquement le déployeur à certifier : le backend
  signe avec **la même clé** que le déploiement, aucun appel `autoriser()` requis.
- `hardhat-verify` exige le format de clé **Etherscan API V2** (une clé unique,
  `etherscan: { apiKey: '…' }`) ; l'ancien format par réseau est rejeté.
- **Coût réel ≈ 0,0075 POL par opération** (certification ou révocation).
  Prévoir le solde en conséquence ; faucet : https://faucet.polygon.technology
- ⚠️ **Données mixtes en base de démo** : les diplômes issus de `seed:demo` ont
  été ancrés en mode `mock` — leurs hash **ne sont pas** sur le contrat, la
  vérification publique renvoie `ancrage_blockchain.ancre = false`. Seuls
  **6 diplômes vitrine** sont réellement ancrés, dont **un révoqué**
  (`DIP-2026-23831`) qui démontre l'état `valide=false / revoqué=true` on-chain.
  Un reseed complet en mode `onchain` coûterait ~0,15 POL.
- Le coût réel de chaque opération est désormais tracé :
  `blockchain.service.js` remonte `receipt.gasUsed` dans
  `transactions_blockchain.gas_used` (la colonne restait `NULL` auparavant).

Bascule du backend en on-chain (`backend/.env`) :

```bash
BLOCKCHAIN_MODE=onchain
CONTRAT_ADRESSE=0x42d2e5EE482c365E5b4737C2d476D127732495F6
BLOCKCHAIN_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
BLOCKCHAIN_PRIVATE_KEY=…        # clé du déployeur (voir blockchain/.env)
```

Redéployer / vérifier depuis `blockchain/` :

```bash
npm run deploy:amoy
npx hardhat verify --network amoy <ADRESSE>
```

---

## 12. Workflow git

**On ne commite jamais directement sur `main`.** Un chantier = une branche = une
Pull Request relue avant merge. L'historique reste lisible et raconte la
progression du projet — utile à présenter en soutenance.

### Nommage des branches

`<phase>/<sujet-en-kebab-case>` — par exemple :

```
phase-8/deploiement-amoy
phase-8/hebergement-ci
phase-8/whatsapp-reel
fix/gas-used-manquant
```

### Cycle type

```bash
git checkout main && git pull          # partir d'un main à jour
git checkout -b phase-8/mon-chantier   # brancher
# … travail, commits …
git push -u origin phase-8/mon-chantier
gh pr create --base main               # ouvrir la PR
# … relecture, puis merge depuis GitHub …
git checkout main && git pull          # récupérer l'état mergé
```

### Messages de commit

Format **Conventional Commits**, sujet en français à l'impératif :

```
feat(blockchain): déploie RegistreDiplomes sur Polygon Amoy
fix(dossier): empêche la re-transmission d'un dossier déjà soumis
docs: documente la configuration on-chain
test(api): couvre l'isolation inter-établissements
```

Portées usuelles : `backend`, `blockchain`, `back-office`, `public`, `bdd`,
ou le module concerné (`dossier`, `diplome`, `auth`…). Le corps du message
explique le **pourquoi**, pas le *quoi* (le diff le montre déjà).

### Règles de sécurité

- Aucun secret dans un commit : clés privées, `JWT_SECRET`,
  `MINISTERE_SIGNING_SECRET` et clés d'API vivent dans les `.env`
  (ignorés par git). Vérifier avec `git diff` avant de commiter.
- Ne jamais commiter `backend/uploads/` (PDF et QR générés au runtime).
- En cas de doute sur un fichier : `git check-ignore -v <fichier>`.
