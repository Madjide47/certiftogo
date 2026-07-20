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
  uniquement. *(Phase 5)*
- **Backend** (`backend/`) — API REST Node.js/Express + PostgreSQL.
- **Blockchain** (`blockchain/`) — smart contract Solidity. *(Phase 2)*

### Acteurs / rôles
| Rôle | Accès | Fonctions principales |
|------|-------|-----------------------|
| Établissement | back-office (OTP) | saisie candidats, transmission dossiers |
| Ministère | back-office (OTP) | validation, certification, révocation |
| Candidat | back-office (OTP) | portefeuille de diplômes |
| Admin système | back-office (OTP) | gestion comptes, configuration |
| Vérificateur | front-office (public) | vérification hash / QR |

---

## 3. Stack technique

- **Backend :** Node.js + Express (ESM), PostgreSQL via driver `pg` (SQL brut,
  pas d'ORM), JWT, bcrypt, uuid.
- **Frontend :** React 18 + Vite, React Router v6, Tailwind CSS, axios.
- **Auth :** OTP 6 chiffres — **mock** en Phase 1 (code affiché dans la console
  serveur), WhatsApp Business API plus tard.
- **Blockchain (Phase 2) :** Solidity 0.8, Hardhat, Polygon Amoy testnet, Ethers.js.

---

## 4. Modèle de données (PostgreSQL)

10 tables (voir `backend/migrations/001_init_schema.sql`) :
`etablissements`, `ministeres`, `candidats`, `utilisateurs`, `codes_otp`,
`dossiers`, `diplomes`, `transactions_blockchain`, `verifications_log`,
`journal_audit`.

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
├── frontend-back-office/   React (espace privé OTP, 4 rôles)
├── frontend-public/  React (vérification publique)
├── blockchain/       Solidity/Hardhat (contrat RegistreDiplomes)
├── docs/             stitch-ui-prompts.md (design system / prompts UI)
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
npm run migrate    # joue migrations/001_init_schema.sql
npm run seed       # joue seeds/seed_dev.sql
npm run db:reset   # schéma + seed d'un coup
npm run seed:demo  # AJOUTE un gros jeu de données de démo (via les vrais services)
npm run db:demo    # reset + seed + démo (données riches pour présentation)
```

### Backend
```bash
cd backend
npm install
npm run dev       # http://localhost:4000  (nodemon)
npm test          # 34 tests (base dédiée certiftogo_test + service WhatsApp)
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

> **Refonte UI (post-phases)** : design system Material 3 (vert Togo + jaune),
> polices Manrope/Inter, icônes Material Symbols. Tous les écrans back-office
> (4 rôles) et le front public ont été redesignés — voir `docs/stitch-ui-prompts.md`.

> On avance **phase par phase**, avec validation avant de créer les fichiers.

---

## 10. État actuel (Phases 1–8 ✅ sauf hébergement/WhatsApp)

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
    + page `/verifier/:code` (cible des QR codes générés à la certification).
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
  - Backend : `cd backend && npm test` — 34 tests. 27 tests d'intégration sur
    une base dédiée `certiftogo_test` (recréée avant chaque exécution) couvrant
    auth OTP, RBAC, cycle de vie du dossier, certification, vérification
    publique, portefeuille candidat, admin et isolation inter-établissements ;
    7 tests unitaires du service WhatsApp (`fetch` doublé, aucun appel réseau).
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
- Connu : la colonne `transactions_blockchain.gas_used` reste `NULL`
  (`blockchain.service.js` ne remonte pas `receipt.gasUsed`).

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
