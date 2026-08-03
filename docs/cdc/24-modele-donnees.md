# 24. Modèle de données

> Ce chapitre décrit le schéma **réellement en place**, introspecté depuis la
> base au 3 août 2026, et non un schéma cible. Les écarts entre ce qui est
> décrit et ce qui existe sont signalés explicitement.

| | |
|---|---|
| Tables | **32** (hors `schema_migrations`) |
| Clés étrangères | 60 |
| Contraintes `CHECK` | 56 |
| Index | 104 |
| Migrations | 13, incrémentales |

---

## 24.1 Principes

**SQL brut, pas d'ORM.** Le driver `pg` est utilisé directement, avec des
requêtes paramétrées. Ce choix rend les requêtes lisibles et prévisibles — on
voit exactement ce qui part vers la base — et évite qu'un ORM produise
silencieusement une requête coûteuse. Le coût : il faut écrire le SQL, et la
protection contre l'injection repose sur la discipline du paramétrage plutôt
que sur une couche d'abstraction.

**Énumérations par `CHECK`, pas par `ENUM` natif.** Ajouter une valeur à un
type `ENUM` PostgreSQL exige `ALTER TYPE`, qui ne peut pas s'exécuter dans une
transaction en même temps que son usage. Une contrainte `CHECK` se remplace en
une instruction. Le prix : les valeurs autorisées sont dupliquées entre la base
(`CHECK`) et l'application (`utils/validators.js`), et un écart entre les deux
produirait une erreur `23514` renvoyée en 400 plutôt qu'un message métier. Les
tests couvrent ce risque en vérifiant les deux niveaux.

**Convention de nommage.** Tables au pluriel, colonnes en `snake_case`, métier
en français (`etablissement`, `dossier`, `certifier`) et technique en anglais
(`controller`, `middleware`). Les dates portent le préfixe `date_`, les
booléens un adjectif (`actif`, `lue`, `bloque`).

**Suppression réversible plutôt que suppression douce.** Plutôt qu'un
`supprime_le` sur chacune des trente tables — qui obligerait à filtrer *toutes*
les lectures existantes et rendrait chaque oubli invisible — la ligne supprimée
est recopiée en JSON dans `corbeille`. La restauration la réinsère **avec le
même identifiant**, donc les références qui la désignaient redeviennent
valides.

**Migrations incrémentales.** `scripts/run-migrations.js` joue les fichiers de
`migrations/` dans l'ordre et enregistre chacun dans `schema_migrations`. Un
fichier déjà appliqué n'est jamais rejoué : les données sont préservées.
`--reset` reconstruit tout et reste réservé au développement.

---

## 24.2 Vue d'ensemble

```
                            ┌─────────────┐
                            │  personnes  │  identité nationale
                            └──────┬──────┘
                    ┌──────────────┼──────────────┐
                    │              │              │
             ┌──────▼─────┐  ┌─────▼──────┐       │
             │ candidats  │  │utilisateurs│       │  compte de connexion
             └──────┬─────┘  └─────┬──────┘       │
                    │              │              │
                    │        ┌─────▼─────┐  ┌─────▼──────┐
                    │        │ sessions  │  │ codes_otp  │
                    │        └───────────┘  └────────────┘
                    │
      ┌─────────────┼──────────────────────────────┐
      │             │                              │
┌─────▼──────┐ ┌────▼─────┐                 ┌──────▼───────┐
│inscriptions│ │ dossiers ├─────────────────►│   diplomes   │
└─────┬──────┘ └────┬─────┘                 └──────┬───────┘
      │             │                              │
┌─────▼──────┐ ┌────▼──────────────┐    ┌──────────▼──────────┐
│ promotions │ │ lots_transmission │    │transactions_blockchain│
└─────┬──────┘ └────┬──────────────┘    │ file_attente_ancrage │
      │             │                    │ corrections_diplome  │
┌─────▼─────┐       │                    └──────────────────────┘
│ filieres  │       │
└─────┬─────┘       │
┌─────▼─────┐  ┌────▼──────────┐
│ facultes  ├──►│etablissements │◄── habilitations, demandes_integration
└───────────┘  └───────────────┘
```

Trois axes structurent le schéma :

1. **L'axe identité** — `personnes` → `candidats` / `utilisateurs`. La personne
   est l'individu ; la fiche candidat est son inscription dans un
   établissement ; l'utilisateur est son moyen de se connecter. Voir
   [ADR-014](35-decisions-architecture.md#adr-014).

2. **L'axe académique** — `etablissements` → `facultes` → `filieres` →
   `promotions` → `inscriptions`. Croisé par `annees_academiques` et
   `sessions_academiques`.

3. **L'axe certification** — `dossiers` → `diplomes` →
   `transactions_blockchain`. Regroupé par `lots_transmission`.

Trois familles transverses les accompagnent : **exploitation** (`journal_audit`,
`corbeille`, `notifications`), **sécurité** (`sessions`, `cles_signature`,
`validations_critiques`, `permissions`) et **cas exceptionnels**
(`demandes_recuperation`, `corrections_diplome`).

---

## 24.3 Description par domaine

### 24.3.1 Identité et accès

#### `personnes` — l'individu

| Colonne | Type | Contraintes |
|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` |
| `nom`, `prenom` | VARCHAR(120) | NOT NULL |
| `date_naissance` | DATE | |
| `lieu_naissance` | VARCHAR(120) | |
| `sexe` | VARCHAR(1) | `CHECK (sexe IN ('M','F'))` |
| `telephone` | VARCHAR(30) | **UNIQUE**, nullable |
| `email` | VARCHAR(180) | |
| `date_creation` | TIMESTAMPTZ | NOT NULL, `now()` |

**Index** : `idx_personnes_telephone`, `idx_personnes_nom (nom, prenom)`.

**Pourquoi `telephone` est nullable** : un import Excel incomplet ne doit pas
bloquer la saisie. Une personne sans numéro existe, mais ne peut pas se
connecter — c'est signalé comme anomalie, pas comme erreur.

**Pourquoi UNIQUE** : le téléphone est la clé de rapprochement entre deux
fiches du même individu. Sans unicité, le portefeuille national se
fragmenterait.

#### `candidats` — la fiche étudiant

| Colonne | Type | Contraintes |
|---|---|---|
| `id` | UUID | PK |
| `personne_id` | UUID | **NOT NULL**, FK → `personnes` `ON DELETE RESTRICT` |
| `numero_etudiant` | VARCHAR(60) | NOT NULL |
| `etablissement_id` | UUID | NOT NULL, FK → `etablissements` `ON DELETE RESTRICT` |
| identité dupliquée | | `nom`, `prenom`, `date_naissance`, `sexe`, `telephone`, `email` |
| | | **UNIQUE (etablissement_id, numero_etudiant)** |

**Duplication assumée de l'identité.** Nom et prénom figurent sur la personne
*et* sur la fiche. Ce n'est pas une erreur de normalisation : la fiche conserve
l'identité **telle qu'elle était à l'inscription**, ce qui compte quand un
diplôme a été émis sous un nom qui a changé depuis. La correction (ERR-001)
met à jour les deux, volontairement.

#### `utilisateurs` — le compte de connexion

| Colonne | Type | Contraintes |
|---|---|---|
| `id` | UUID | PK |
| `telephone` | VARCHAR(30) | **NOT NULL UNIQUE** — identifiant de connexion |
| `role` | VARCHAR(20) | `CHECK IN ('etablissement','ministere','candidat','admin_systeme')` |
| `etablissement_id` / `ministere_id` / `personne_id` | UUID | FK, `ON DELETE SET NULL` |
| `actif` | BOOLEAN | NOT NULL, défaut `TRUE` |
| `est_agent_principal` | BOOLEAN | NOT NULL, défaut `FALSE` |
| `sous_role` | VARCHAR(30) | `CHECK` : réservé au rôle établissement |

**Contrainte de cohérence** — le rattachement doit correspondre au rôle :

```sql
CONSTRAINT chk_role_rattachement CHECK (
    (role = 'etablissement' AND etablissement_id IS NOT NULL) OR
    (role = 'ministere'     AND ministere_id     IS NOT NULL) OR
    (role = 'candidat'      AND personne_id      IS NOT NULL) OR
    (role = 'admin_systeme')
)
```

```sql
CONSTRAINT chk_sous_role CHECK (
    sous_role IS NULL
    OR (role = 'etablissement' AND sous_role IN ('agent_saisie','chef_scolarite','directeur'))
)
```

`actif` porte une sémantique particulière pour les candidats : **faux tant
qu'aucun diplôme n'est certifié**. Le compte naît fermé à la saisie et s'ouvre
à la certification ([ADR-002](35-decisions-architecture.md#adr-002)).

#### `sessions` — accès révocables

| Colonne | Type | Contraintes |
|---|---|---|
| `id` | UUID | PK |
| `utilisateur_id` | UUID | NOT NULL, FK `ON DELETE CASCADE` |
| `jeton_hash` | CHAR(64) | **NOT NULL UNIQUE** |
| `adresse_ip`, `user_agent` | | origine de la connexion |
| `date_expiration` | TIMESTAMPTZ | NOT NULL |
| `date_revocation`, `revoquee_par`, `motif_revocation` | | fermeture |

**Le jeton de rafraîchissement n'est jamais stocké en clair** : seule son
empreinte SHA-256 figure en base. La fuite de cette table ne permet donc pas
d'usurper une session.

Index partiel `idx_sessions_utilisateur ... WHERE date_revocation IS NULL` : on
n'indexe que les sessions vivantes, qui sont les seules interrogées.

#### `codes_otp`

Ajouts de sécurité : `tentatives SMALLINT` et `bloque BOOLEAN`. Cinq essais
infructueux brûlent le code — un code à six chiffres représente un million de
possibilités, qui tombent en quelques minutes sans plafond.

---

### 24.3.2 Institutions et gouvernance

#### `etablissements`

| Colonne | Particularité |
|---|---|
| `code` | **NOT NULL UNIQUE** — identifiant administratif (`IAI001`, `ENA001`) |
| `type` | `CHECK IN ('institut','universite','ecole','lycee')` |
| `statut` | `CHECK IN ('actif','suspendu','archive')` |
| `mode_workflow` | `CHECK IN ('simple','hierarchique')`, défaut `simple` |

Le **code** est distinct des comptes agents : ce n'est pas « l'Université de
Lomé » qui se connecte, c'est un agent nommé qui y travaille. Le code identifie
l'institution dans les échanges ; les comptes portent l'authentification.

Un établissement `suspendu` ne transmet plus, mais son travail interne continue
et **ses diplômes déjà certifiés restent valides** : la suspension vise
l'avenir, pas le passé (ERR-005).

#### `habilitations` — droit de délivrer un type de diplôme

```sql
CREATE UNIQUE INDEX idx_habilitation_active
    ON habilitations (etablissement_id, type_diplome) WHERE statut = 'active';
```

L'index unique **partiel** autorise l'historique — plusieurs habilitations
expirées pour le même couple — tout en garantissant une seule active. C'est
cette table qui rend écrivables les contrôles « établissement habilité » et
« diplôme autorisé » à la réception d'un lot.

#### `demandes_integration`

Porte d'entrée publique d'un établissement candidat. `CHECK (statut <>
'refusee' OR motif_refus IS NOT NULL)` : un refus sans motif est impossible au
niveau de la base, pas seulement du service.

#### `permissions` et `roles_permissions`

Catalogue consultable de la matrice de droits. **Le code fait autorité**
(`permissions.service.js`) ; ces tables en sont le reflet, destiné à l'audit et
à un futur écran d'administration. Cet écart est une dette assumée : un
décalage entre les deux serait invisible sans vigilance.

---

### 24.3.3 Structure académique

| Table | Rôle | Contrainte notable |
|---|---|---|
| `annees_academiques` | référentiel national | `CHECK (libelle ~ '^\d{4}-\d{4}$')` + index unique partiel : **une seule année ouverte à la fois** |
| `sessions_academiques` | normale / rattrapage / exceptionnelle | index unique partiel `WHERE type IN ('normale','rattrapage')` — les sessions exceptionnelles ne sont pas limitées |
| `facultes` | subdivision d'établissement | `UNIQUE (etablissement_id, code)` |
| `filieres` | cursus | `UNIQUE (faculte_id, code)`, `duree_annees BETWEEN 1 AND 8` |
| `promotions` | cohorte | `UNIQUE (filiere_id, annee_id, niveau)` |
| `inscriptions` | étudiant × promotion | `UNIQUE (candidat_id, promotion_id)` |

**La cohérence session ↔ année est portée par une clé composite**, ajoutée en
migration 003 :

```sql
ALTER TABLE sessions_academiques ADD CONSTRAINT uq_sessions_id_annee UNIQUE (id, annee_id);
ALTER TABLE promotions ADD CONSTRAINT fk_promotions_session_annee
    FOREIGN KEY (session_id, annee_id)
    REFERENCES sessions_academiques (id, annee_id) ON DELETE RESTRICT;
```

Sans elle, deux clés étrangères indépendantes laissaient rattacher une
promotion de 2024-2025 à une session de 2023-2024. Une promotion sans session
reste possible : une clé composite n'est pas contrôlée si l'une de ses colonnes
est nulle.

**Règle métier en base** : `CHECK (mention IS NULL OR statut = 'admis')` sur
`inscriptions` — une mention ne se justifie que pour un étudiant admis.

**Pourquoi `inscriptions` plutôt qu'une colonne sur `candidats`** : un étudiant
cumule une inscription par année d'études. La table conserve donc le **parcours
complet** (L1 → L2 → L3, redoublements, abandons) au lieu de ne garder que la
dernière promotion.

---

### 24.3.4 Instruction et certification

#### `dossiers`

Le dossier est l'unité de décision. Ajouts V2 : `lot_id` et `promotion_id`,
tous deux **nullables** — les dossiers saisis individuellement avant ce
mécanisme restent valides.

```sql
CREATE UNIQUE INDEX idx_dossier_unique_par_lot
    ON dossiers (lot_id, candidat_id) WHERE lot_id IS NOT NULL;
```

Un même étudiant ne peut pas figurer deux fois dans le même lot.

**Machine à états** : `brouillon → soumis → en_examen → valide | rejete →
certifie`, avec révocation ultérieure possible.

#### `lots_transmission`

L'unité de transmission et d'instruction. Statuts : `transmis`, `en_examen`,
`valide`, **`partiellement_traite`**, `rejete`, `certifie`.

Le statut `partiellement_traite` est la traduction en base du rejet partiel :
247 dossiers validés, 3 renvoyés. Sans lui, trois anomalies bloqueraient 250
diplômés.

`rapport_controles JSONB` fige le résultat des contrôles automatiques au moment
de l'instruction — c'est la pièce à produire si la décision est contestée plus
tard.

#### `diplomes`

| Colonne | Rôle |
|---|---|
| `hash_sha256` | empreinte canonique des données signées |
| `signature_numerique` | signature du ministère |
| `donnees_signees` JSONB | **snapshot figé** au moment de la certification |
| `transaction_id` | ancrage blockchain |
| `statut` | `en_attente_ancrage` \| `actif` \| `revoque` \| `remplace` |
| `version`, `diplome_precedent_id`, `motif_version` | chaînage des versions |
| `cle_signature_id` | quelle clé a signé — donc quoi re-signer si elle est compromise |

**Le snapshot est essentiel** : le hash porte sur les données telles qu'elles
étaient à la certification. Si le dossier évolue ensuite, l'empreinte reste
vérifiable.

**`remplace` n'est pas `revoque`.** Un diplôme révoqué a été retiré à son
titulaire ; un diplôme remplacé reste légitime, c'est sa forme qui a changé.
Confondre les deux ferait passer une diplômée qui se marie pour une fraudeuse.

#### `corrections_diplome`

Trace de ce qui a changé, champ par champ, avec les deux empreintes et les deux
transactions blockchain. **Le lien entre versions vit ici, hors chaîne** : le
contrat ne connaît que `certifier()` et `revoquer()`, donc un remplacement s'y
traduit par une révocation suivie d'une certification
([ADR-006](35-decisions-architecture.md#adr-006)).

#### `file_attente_ancrage`

| Colonne | Rôle |
|---|---|
| `cle_idempotence` | **UNIQUE** — deux demandes du même ancrage ne créent qu'une tâche |
| `charge_utile` JSONB | tout ce qu'il faut pour rejouer sans relire le diplôme |
| `priorite`, `tentatives`, `max_tentatives` | ordonnancement et abandon |
| `prochaine_tentative` | report exponentiel, plafonné à une heure |
| `statut` | `en_attente` → `en_cours` → `confirmee` \| `echouee` \| **`abandonnee`** |

`abandonnee` **est** la file d'abandon : plutôt qu'une table séparée, un statut
suffit et garde l'historique au même endroit.

```sql
CREATE INDEX idx_file_a_traiter
    ON file_attente_ancrage (priorite, prochaine_tentative)
    WHERE statut IN ('en_attente', 'echouee');
```

Index partiel : le worker n'interroge que les tâches dues. À 12 000 lignes dont
11 900 confirmées, il ne parcourt que les 100 restantes.

---

### 24.3.5 Exploitation et sécurité

#### `journal_audit`

Format complet exigé par le CDC §21.1 : horodatage, utilisateur, **rôle**,
action, entité et identifiant, **valeurs avant / après** en JSONB, adresse IP,
user-agent, résultat (`succes` / `echec`), message, **corrélation blockchain**
(`transaction_hash`) et rattachement établissement.

`auteur_libelle` conserve l'identité **figée au moment de l'action** : un compte
supprimé ne doit pas effacer l'historique de ses actes. C'est la raison d'être
de cette colonne malgré la présence de `utilisateur_id`.

43 actions sont cataloguées dans `audit.service.js`.

#### `corbeille`

`table_source`, `enregistrement_id`, `donnees JSONB`, `libelle`,
`supprime_par`, `restaure`. La restauration réinsère la ligne **avec son
identifiant d'origine**.

#### `notifications` et `preferences_notification`

Une notification est **une ligne en base avant d'être un envoi** : le centre
in-app fonctionne même si WhatsApp est indisponible, et un envoi échoué reste
rejouable.

Pour les préférences, **l'absence de ligne vaut acceptation** — seuls les refus
sont stockés. On n'impose pas à l'utilisateur d'activer une à une dix-sept
notifications.

#### `cles_signature`

Seule l'**empreinte** est stockée, jamais la clé. `emplacement` déclare où elle
vit réellement (`variable_environnement`, `kms`, `hsm_logiciel`,
`hsm_materiel`, `cold_wallet_multisig`) : rendre visible le niveau de protection
en vigueur vaut mieux que le laisser deviner.

```sql
CREATE UNIQUE INDEX idx_cle_active ON cles_signature (statut) WHERE statut = 'active';
```

Une seule clé active : deux clés valides rendraient impossible de dire laquelle
fait foi.

#### `validations_critiques`

```sql
CONSTRAINT chk_quatre_yeux CHECK (approbateur_id IS NULL OR approbateur_id <> demandeur_id)
```

Le demandeur ne peut pas être son propre approbateur — garanti par la base, pas
par le service. **État** : table posée, activation à brancher
([ADR-015](35-decisions-architecture.md#adr-015)).

#### `verifications_log`

Journalise chaque vérification publique. `resultat` accepte `authentique`,
`introuvable`, `revoque`, `en_attente_ancrage`, `remplace` — le vocabulaire a
suivi l'enrichissement du cycle de vie du diplôme.

---

## 24.4 Décisions de modélisation, et ce qu'elles coûtent

| Décision | Bénéfice | Coût assumé |
|---|---|---|
| `personnes` séparée de `candidats` | portefeuille national possible | rapprochement dépendant du téléphone |
| Identité dupliquée sur la fiche | conserve l'état à l'inscription | deux endroits à corriger |
| `CHECK` plutôt qu'`ENUM` | évolution en une instruction | valeurs dupliquées code / base |
| `corbeille` JSON plutôt que `supprime_le` | aucune lecture existante à modifier | restauration à écrire par table si le schéma évolue |
| Index partiels | index petits et rapides | invisibles pour qui lit `\d table` sans regarder les index |
| `abandonnee` comme statut | historique au même endroit | pas de séparation physique de la file d'abandon |
| Snapshot JSONB dans `diplomes` | hash vérifiable indépendamment du dossier | données dupliquées, volontairement figées |

---

## 24.5 DDL

Le schéma exécutable est constitué des **13 migrations** de `backend/migrations/`,
jouées dans l'ordre :

| # | Fichier | Apport |
|---|---|---|
| 001 | `init_schema` | socle : 10 tables |
| 002 | `referentiel_academique` | facultés, filières, années, sessions, promotions, inscriptions |
| 003 | `coherence_promotion_session` | clé composite session ↔ année |
| 004 | `identite_nationale` | `personnes`, reprise des données |
| 005 | `gouvernance_etablissements` | code officiel, habilitations, demandes |
| 006 | `lots_transmission` | lots, rattachement des dossiers |
| 007 | `journal_audit` | format complet, historique, corbeille |
| 008 | `file_ancrage` | file d'attente, statut `en_attente_ancrage` |
| 009 | `notifications` | notifications et préférences |
| 010 | `securite_sessions` | sessions, anti-force brute, quatre yeux |
| 011 | `versionnement_diplomes` | versions, corrections |
| 012 | `sous_roles_etablissement` | sous-rôles, mode de workflow, permissions |
| 013 | `cas_exceptionnels` | clés de signature, récupération de compte |

**Pourquoi le DDL n'est pas recopié ici.** Un schéma consolidé dans ce document
divergerait des migrations dès la première évolution, et personne ne saurait
laquelle fait foi. Les migrations sont la source unique ; elles sont abondamment
commentées, chacune expliquant **le problème qu'elle résout** avant de le
résoudre.

Pour obtenir le schéma complet à jour :

```bash
cd backend && npm run migrate          # applique les migrations en attente
pg_dump --schema-only certiftogo       # extrait le DDL consolidé
```

Les commentaires `COMMENT ON TABLE` et `COMMENT ON COLUMN` sont posés sur les
tables et colonnes dont le nom ne suffit pas — ils remontent dans `\d+` et dans
les outils d'exploration.

---

## 24.6 Stratégie de migration depuis l'existant

Les migrations 004 et 005 comportent une **reprise de données**, éprouvée sur la
base de démonstration :

- **004** regroupe les fiches existantes par téléphone pour créer les personnes ; celles sans numéro deviennent chacune une personne distincte. Résultat mesuré : 44 fiches → 44 personnes, aucune orpheline.
- **005** attribue un code officiel à chaque établissement à partir des initiales de son nom (accents retirés : « École Nationale d'Administration » → `ENA001`), et habilite chaque établissement pour les types de diplômes qu'il a effectivement délivrés.

**Piège rencontré, à connaître** : une reprise écrite dans une migration ne
couvre pas une base neuve, où le seed s'exécute *après* les migrations. Les deux
chemins doivent donc être alimentés — la migration pour les bases existantes, le
seed pour les bases neuves. C'est ce qui a fait échouer les premiers tests
d'habilitation.
