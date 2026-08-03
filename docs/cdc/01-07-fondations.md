# Partie I — Fondations

> Chapitres 1 à 7. Cette partie pose le vocabulaire, le problème, les objectifs
> et l'architecture d'ensemble. Elle se lit avant tout le reste.

---

# 1. Introduction

## 1.1 Objet et portée

Ce document décrit **CertifTOGO**, plateforme nationale de certification et de
traçabilité des diplômes de l'enseignement supérieur togolais, adossée à une
blockchain publique.

Il couvre le périmètre fonctionnel, l'architecture, le modèle de données, les
règles métier, les cas exceptionnels et les décisions d'architecture. Il ne
couvre pas l'exploitation courante (procédures d'astreinte, plan de reprise
détaillé), ni la conduite du changement.

**Le document décrit l'état réel du système**, chapitre par chapitre, avec un
marqueur d'implémentation. Cette règle est absolue : un cahier des charges qui
laisse croire qu'une fonction existe alors qu'elle est à écrire est plus
dangereux qu'un document incomplet.

**Légende** — ✅ implémenté et testé · 🔨 partiel · ⬜ à construire · 📄 documentaire

## 1.2 Public visé et modes de lecture

| Lecteur | Parcours recommandé |
|---|---|
| **Jury de soutenance** | ch. 2 (vision) → [ch. 36](36-argumentaire-jury.md) (argumentaire) → [ch. 35](35-decisions-architecture.md) (ADR) |
| **Développeur reprenant le projet** | [ch. 24](24-modele-donnees.md) (données) → ch. 5 (architecture) → [ch. 35](35-decisions-architecture.md) |
| **Agent du ministère** | ch. 6 (acteurs) → ch. 12 (workflow) → ch. 29 (cas exceptionnels) |
| **Responsable d'établissement** | ch. 8 à 11 → ch. 10.5 (import) |
| **Auditeur / sécurité** | ch. 23 (sécurité) → ch. 21 (audit) → [ch. 36.1](36-argumentaire-jury.md) (clé privée) |

## 1.3 Glossaire

### Métier (français)

| Terme | Définition |
|---|---|
| **Personne** | Individu, indépendamment des établissements fréquentés. Porte le compte et le portefeuille. |
| **Candidat** *(fiche étudiant)* | Inscription d'une personne dans un établissement donné. Une personne en a autant que d'établissements fréquentés. |
| **Promotion** | Cohorte : une filière, un niveau, une année académique. Unité de regroupement. |
| **Lot de transmission** | Envoi groupé d'une promotion au ministère. Unité de transmission et d'instruction. |
| **Dossier** | Candidature individuelle au diplôme. **Unité de décision** : c'est lui qu'on valide ou rejette. |
| **Diplôme** | Document officiel créé par le ministère à partir d'un dossier validé. |
| **Habilitation** | Droit accordé à un établissement de délivrer un type de diplôme. |
| **Agrément** | Acte par lequel le ministère fait entrer un établissement dans la plateforme. |
| **Ancrage** | Écriture de l'empreinte d'un diplôme sur la blockchain. |
| **Révoqué** | Diplôme **retiré** à son titulaire — fraude, annulation. |
| **Remplacé** | Diplôme dont une version corrigée existe. **Reste légitime** — ne pas confondre avec révoqué. |
| **Délibération** | Décision du jury. Sa date fait foi comme date d'obtention. |

### Technique (anglais)

| Terme | Rôle dans le projet |
|---|---|
| `controller` | traduit HTTP ↔ métier, ne contient aucune règle |
| `service` | règles métier, ne connaît ni `req` ni `res` |
| `model` | SQL paramétré, aucune règle métier |
| `middleware` | traverse toutes les requêtes (auth, contexte, débit, métriques) |
| `hash` | empreinte SHA-256 des données canoniques |
| `worker` | consommateur de la file d'ancrage |
| `idempotence` | rejouer une opération produit le même résultat |
| `dead letter queue` | tâches abandonnées après épuisement des tentatives |

> **Convention** : le métier est en français, la technique en anglais. Un
> `controller` manipule des `dossiers` ; on ne dit ni « contrôleur » ni
> « files ».

## 1.4 Documents liés

| Document | Contenu |
|---|---|
| `CLAUDE.md` | référence opérationnelle : stack, commandes, état d'avancement |
| `docs/BACKLOG-V2.md` | inventaire des 174 éléments avec leur statut |
| `docs/DEPLOIEMENT.md` | procédure d'hébergement Render |
| `docs/WHATSAPP.md` | bascule du canal OTP en mode `cloud` |
| `backend/migrations/` | **source unique du schéma** — 13 migrations commentées |

## 1.5 Historique

| Version | Date | Contenu |
|---|---|---|
| 1.0 | — | structure en 32 chapitres, jamais rédigée |
| **2.0** | août 2026 | document complet, adossé au code livré |

---

# 2. Vision du projet

## 2.1 Le problème

Un diplôme togolais ne peut être vérifié aujourd'hui que par **contact direct
avec l'établissement émetteur** : appel téléphonique, courrier, déplacement.
Cette procédure a trois défauts qui se cumulent.

**Elle est lente.** Vérifier un diplôme prend des jours, parfois des semaines.
Un employeur pressé y renonce — et embauche sans vérifier.

**Elle n'est pas fiable.** L'établissement répond depuis ses propres archives,
papier ou tableur. Une archive perdue, un agent complaisant, et la réponse
devient fausse sans que personne ne puisse le constater.

**Elle est inaccessible depuis l'étranger.** Une université canadienne ou un
employeur français n'a ni le contact, ni la langue administrative, ni le moyen
de distinguer un établissement reconnu d'un établissement fictif.

**Conséquence** : le faux diplôme est peu risqué. Il suffit qu'il ne soit pas
vérifié — ce qui est le cas le plus fréquent.

## 2.2 Le modèle administratif togolais comme référence

CertifTOGO ne réinvente pas la procédure : il **numérise celle qui existe**,
calquée sur le Baccalauréat.

```
Établissement            Ministère                 Diplômé          Public
     │                       │                        │                │
 saisit les                  │                        │                │
 diplômés                    │                        │                │
     │                       │                        │                │
 transmet ─────────────────► instruit                 │                │
     │                    valide                      │                │
     │                    certifie ────────────────► reçoit            │
     │                    signe                       │                │
     │                    ancre                       │           vérifie
```

Le principe fondateur du modèle togolais est conservé : **l'établissement
n'émet pas seul un diplôme officiel.** Il transmet des données à une autorité
qui les valide avant délivrance. La plateforme respecte cette séparation
plutôt que de la contourner.

## 2.3 Positionnement

CertifTOGO est une **infrastructure publique**, pas un produit commercial.

| Ce que cela implique | Conséquence concrète |
|---|---|
| Le ministère est propriétaire | les établissements sont utilisateurs, pas clients |
| Aucun modèle économique par transaction | le coût blockchain est une charge publique |
| Adoption imposée, pas conquise | l'ergonomie doit servir des agents qui n'ont pas choisi l'outil |
| Durée de vie longue | la maintenabilité prime sur la sophistication |

Ce positionnement explique plusieurs choix qui paraîtraient discutables dans un
produit commercial : SQL brut plutôt qu'ORM, monolithe plutôt que
micro-services, mode simple par défaut plutôt que workflow imposé.

## 2.4 Hors périmètre

Ce que la plateforme **ne fait pas**, et ne prétend pas faire :

- **Elle ne juge pas de la véracité des données.** Un établissement qui déclare une fausse mention obtiendra une fausse mention certifiée — de façon parfaitement traçable. La chaîne garantit l'intégrité, pas la vérité.
- **Elle ne remplace pas l'archivage papier** tant que la valeur juridique du document numérique n'est pas établie par un texte.
- **Elle ne reprend pas les diplômes antérieurs.** La numérisation du stock existant est un projet distinct (ch. 32).
- **Elle ne gère pas la scolarité** : ni notes en cours d'année, ni emplois du temps, ni inscriptions administratives.
- **Elle ne délivre pas d'attestation d'équivalence.**

---

# 3. Objectifs

## 3.1 Objectifs métier

| Réf. | Objectif | Indicateur | Cible |
|---|---|---|---|
| **OBJ-01** | Rendre la vérification instantanée | délai de vérification | < 5 s |
| **OBJ-02** | Rendre la vérification accessible sans compte | comptes requis | 0 |
| **OBJ-03** | Rendre la falsification détectable par un tiers | vérification hors serveur du ministère | possible |
| **OBJ-04** | Réduire le délai de certification | transmission → certification | < 15 jours |
| **OBJ-05** | Tracer chaque acte administratif | actions journalisées | 100 % des actes sensibles |
| **OBJ-06** | Permettre au diplômé de détenir ses diplômes | portefeuille national | tous établissements confondus |

## 3.2 Objectifs techniques

| Réf. | Objectif | État |
|---|---|---|
| **OBJ-10** | Absorber une promotion de 12 000 diplômés | ✅ file d'ancrage — ⬜ non mesuré |
| **OBJ-11** | Aucune perte de données en cas de panne réseau | ✅ file en base |
| **OBJ-12** | Isolation stricte entre établissements | ✅ testée |
| **OBJ-13** | Reprise possible par un autre développeur | ✅ 13 migrations commentées, 186 tests |
| **OBJ-14** | Aucun secret dans le dépôt | ✅ refus de démarrage sans secret |

## 3.3 Contraintes

| Contrainte | Effet sur les choix |
|---|---|
| **Projet de stage, une personne** | monolithe ([ADR-010](35-decisions-architecture.md#adr-010)), pas de micro-services |
| **Délai court** | priorisation stricte, dettes assumées et documentées |
| **Budget nul** | testnet Amoy, hébergement gratuit, aucune licence |
| **Parc informatique hétérogène des établissements** | base centralisée ([ADR-001](35-decisions-architecture.md#adr-001)), import Excel |
| **Connexion internet inégale** | interfaces légères, pas de dépendance à un CDN |
| **Utilisateurs non techniques** | authentification sans mot de passe ([ADR-009](35-decisions-architecture.md#adr-009)) |

## 3.4 Critères d'acceptation du MVP

Le MVP est atteint lorsque **tous** les critères suivants sont satisfaits.

| Réf. | Critère | État |
|---|---|---|
| **AC-01** | Un établissement importe une promotion depuis Excel avec rapport d'erreurs | ✅ |
| **AC-02** | Une promotion entière est transmise en un geste | ✅ |
| **AC-03** | Le ministère instruit un lot avec contrôles automatiques et rejet partiel | ✅ |
| **AC-04** | Un diplôme certifié est ancré sur la blockchain | ✅ |
| **AC-05** | Le diplômé consulte et télécharge son diplôme | ✅ |
| **AC-06** | Un tiers vérifie un diplôme sans compte, en moins de 5 s | ✅ |
| **AC-07** | Un diplôme révoqué est signalé comme tel publiquement | ✅ |
| **AC-08** | Une erreur après certification produit une version corrigée | ✅ |
| **AC-09** | Chaque acte sensible est journalisé et consultable | ✅ |
| **AC-10** | Un diplômé ayant perdu son téléphone récupère son accès | ✅ |
| **AC-11** | La plateforme est accessible en ligne | ⬜ hébergement à créer |
| **AC-12** | Les OTP partent réellement par WhatsApp | ⬜ validation Meta en attente |

**AC-11 et AC-12 ne dépendent pas du code** : ils attendent respectivement la
création du blueprint Render et la validation du numéro et du gabarit par Meta.

---

# 4. Architecture globale

## 4.1 Vue d'ensemble

```
   ┌──────────────────┐         ┌──────────────────┐
   │   Back-office    │         │  Front-office    │
   │  (privé, OTP)    │         │ (public, sans    │
   │  4 rôles         │         │  compte)         │
   └────────┬─────────┘         └────────┬─────────┘
            │  HTTPS / JWT               │  HTTPS
            └─────────────┬──────────────┘
                          ▼
              ┌───────────────────────┐
              │   API REST Express    │
              │  Route → Middleware   │
              │  → Controller         │
              │  → Service → Model    │
              └───┬───────────────┬───┘
                  │               │
        ┌─────────▼──────┐   ┌────▼─────────────────┐
        │  PostgreSQL    │   │ RegistreDiplomes     │
        │  32 tables     │   │ Polygon Amoy         │
        │  LES DONNÉES   │   │ LA PREUVE            │
        └────────────────┘   └──────────────────────┘
                  │
        ┌─────────▼──────────┐
        │ uploads/ PDF + QR  │
        └────────────────────┘
```

## 4.2 Flux principal

```
1. Agrément        ministère ──► établissement + code + habilitations + agent principal
2. Structure       établissement ──► facultés, filières
3. Promotion       établissement ──► cohorte (filière, niveau, année, session)
4. Peuplement      saisie manuelle OU import Excel ──► fiches + inscriptions
5. Délibération    résultats saisis ──► admis / ajournés
6. Transmission    1 clic ──► lot + 1 dossier par ADMIS + notification ministère
7. Instruction     contrôles automatiques ──► synthèse ──► décision humaine
8. Décision        validation totale OU rejet partiel (dossier par dossier)
9. Certification   hash ──► signature ──► PDF ──► QR ──► file d'ancrage
10. Ancrage        worker ──► blockchain ──► statut « actif »
11. Notification   diplômé averti, compte activé
12. Vérification   public ──► hash ou référence ──► résultat + ancrage on-chain
```

## 4.3 Frontières de confiance

| Zone | Contenu | Confiance | Contrôle à la frontière |
|---|---|---|---|
| **Publique** | front-office, vérification, dépôt de demande | aucune | limitation de débit, aucune donnée sensible exposée |
| **Authentifiée** | back-office | identité vérifiée par OTP | JWT + session active en base |
| **Cloisonnée** | données d'un établissement | agent du même établissement | filtre `etablissement_id` issu du **jeton**, jamais du client |
| **Ministérielle** | certification, révocation | agent ministère | rôle + contrôle à quatre yeux si actif |
| **Cryptographique** | clé de signature | aucun humain | hors application, appel de signature tracé |

> **Règle absolue** : aucun identifiant de cloisonnement ne provient du client.
> `etablissement_id` est toujours lu dans le jeton. Un client qui l'enverrait
> dans le corps de la requête serait ignoré.

**Choix de conception** : l'isolation répond **404**, jamais **403**. Un 403
confirmerait l'existence de la ressource — donc renseignerait un curieux sur ce
qu'il n'a pas le droit de voir.

## 4.4 Stockage hybride

Voir [ADR-012](35-decisions-architecture.md#adr-012). En une phrase :

> **PostgreSQL détient les données. La blockchain détient la preuve qu'elles
> n'ont pas changé.**

---

# 5. Architecture technique

## 5.1 Stack et justification

| Couche | Choix | Pourquoi celui-ci |
|---|---|---|
| Runtime | Node.js 22 (ESM) | un seul langage front/back ; écosystème blockchain natif |
| API | Express 4 | minimal, sans magie ; le flux d'une requête se lit |
| Base | PostgreSQL 13+ | contraintes riches (`CHECK`, index partiels, FK composites) — le schéma porte des règles métier |
| Accès données | driver `pg`, SQL brut | requêtes lisibles et prévisibles ([ch. 24.1](24-modele-donnees.md)) |
| Front | React 18 + Vite | rechargement rapide, build léger |
| Style | Tailwind | pas de feuille de style à maintenir |
| Contrat | Solidity 0.8.24 + Hardhat | standard EVM, outillage mature |
| Chaîne | Polygon Amoy | [ADR-008](35-decisions-architecture.md#adr-008) |
| Auth | JWT + OTP | [ADR-009](35-decisions-architecture.md#adr-009) |
| Documents | PDFKit, qrcode | génération serveur, sans service externe |
| Import | ExcelJS | maintenu, sans les CVE de `xlsx` |
| Tests | `node:test` natif + supertest | zéro dépendance de test à maintenir |

## 5.2 Architecture en couches

```
Route ──► Middleware ──► Controller ──► Service ──► Model ──► SQL
```

| Couche | Fait | Ne fait jamais |
|---|---|---|
| Route | déclare le chemin, empile les middlewares | logique |
| Middleware | auth, contexte, débit, métriques, erreurs | métier |
| Controller | traduit HTTP ↔ métier | SQL, règles |
| Service | règles métier, transactions | connaître `req` / `res` |
| Model | SQL paramétré | règles métier |

**Un fichier = une responsabilité.** Cette règle est ce qui rend le découpage
en services crédible ([ch. 37](37-evolutivite-decouplage.md)).

## 5.3 Services applicatifs

22 services, inventoriés au [chapitre 37](37-evolutivite-decouplage.md) avec
leur extractibilité réelle.

## 5.4 Conventions

**Format de réponse, sans exception :**

```json
{ "success": true,  "data":  { } }
{ "success": false, "error": { "code": "PROMOTION_VIDE", "message": "…" } }
```

Le `code` est destiné au programme, le `message` à l'humain. Les messages
disent **quoi faire**, pas seulement ce qui ne va pas :

> « Aucun étudiant admis parmi les 12 inscrits. Saisissez les résultats de la
> délibération avant de transmettre. »

**Traduction des erreurs SQL.** `traduireErreurSql()` convertit les SQLSTATE
PostgreSQL en erreurs métier, avec un message par contrainte. Un filet dans le
middleware garantit qu'**aucune contrainte violée ne remonte en 500** en
exposant le schéma.

## 5.5 Environnements

| Environnement | Base | Blockchain | WhatsApp | Particularité |
|---|---|---|---|---|
| Développement | `certiftogo` (5433) | `mock` | `mock` | code OTP en console |
| Test | `certiftogo_test` | `mock` | `mock` | base recréée à chaque exécution |
| Démonstration | `certiftogo` + `seed:demo` | `mock` / Amoy | `mock` | 6 diplômes réellement ancrés |
| Production | PostgreSQL managé | Amoy puis mainnet | `cloud` | refus de démarrage sans secret |

---

# 6. Les acteurs

## 6.1 Description

| Acteur | Accès | Rôle | Créé par |
|---|---|---|---|
| **Établissement** | back-office, OTP | saisit, importe, transmet | ministère (agrément) |
| **Ministère** | back-office, OTP | instruit, valide, certifie, révoque | administrateur |
| **Candidat / diplômé** | back-office, OTP | consulte et partage ses diplômes | automatiquement, à la saisie |
| **Administrateur système** | back-office, OTP | exploite la plateforme, **ne certifie jamais** | manuellement |
| **Vérificateur public** | front-office, sans compte | vérifie un diplôme | — |

**Sous-rôles d'établissement** (mode hiérarchique uniquement, [ADR-016](35-decisions-architecture.md#adr-016)) :
agent de saisie · chef de scolarité · directeur.

## 6.2 Matrice acteurs × cas d'usage

| Cas d'usage | Étab. | Min. | Cand. | Admin | Public |
|---|:---:|:---:|:---:|:---:|:---:|
| Déposer une demande d'intégration | — | — | — | — | ✅ |
| Agréer un établissement | — | ✅ | — | — | — |
| Accorder une habilitation | — | ✅ | — | — | — |
| Créer un agent | ✅¹ | — | — | — | — |
| Gérer facultés et filières | ✅ | — | — | — | — |
| Créer une promotion | ✅ | — | — | — | — |
| Importer une promotion | ✅ | — | — | — | — |
| Saisir les résultats | ✅² | — | — | — | — |
| Transmettre au ministère | ✅³ | — | — | — | — |
| Instruire un lot | — | ✅ | — | — | — |
| Valider / rejeter un dossier | — | ✅ | — | — | — |
| Certifier | — | ✅ | — | — | — |
| Révoquer | — | ✅⁴ | — | — | — |
| Corriger un diplôme | — | ✅ | — | — | — |
| Consulter son portefeuille | — | — | ✅ | — | — |
| Vérifier un diplôme | ✅ | ✅ | ✅ | ✅ | ✅ |
| Consulter le journal | ✅⁵ | ✅ | — | ✅ | — |
| Suspendre un établissement | — | — | — | ✅ | — |
| Déclarer une clé compromise | — | — | — | ✅ | — |

¹ agent principal · ² chef de scolarité en mode hiérarchique · ³ directeur en
mode hiérarchique · ⁴ second agent requis si `DOUBLE_VALIDATION` · ⁵ ses propres
actions uniquement

## 6.3 Cycle de vie

**Établissement** : demande → examen → agréé (`actif`) → éventuellement
`suspendu` → `archive`. Un établissement suspendu ne transmet plus mais ses
diplômes restent valides.

**Agent** : créé → actif → désactivé (sessions coupées, dossiers en cours
transférés).

**Diplômé** : fiche créée (compte fermé) → certification (compte ouvert) →
consultation. Perte de téléphone → récupération médiée (ERR-003).

**Diplôme** : `en_attente_ancrage` → `actif` → `revoque` **ou** `remplace`.

---

# 7. Authentification

## 7.1 Choix de l'OTP

Voir [ADR-009](35-decisions-architecture.md#adr-009).

## 7.2 Parcours en deux étapes

```
POST /api/auth/request-otp   { telephone }
     └─► réponse IDENTIQUE que le compte existe ou non
POST /api/auth/verify-otp    { telephone, code }
     └─► { token, jeton_rafraichissement, session_id, utilisateur }
```

**FR-100** — La réponse à une demande d'OTP ne révèle jamais l'existence d'un
compte. Un `404` sur numéro inconnu permettrait d'énumérer les agents du
ministère par balayage. Aucun code n'est émis pour un numéro inconnu ou un
compte fermé, mais la réponse est la même.

## 7.3 Canaux

| Mode | Comportement | Usage |
|---|---|---|
| `mock` | code affiché en console et renvoyé dans `code_dev` | dev, test, démo |
| `cloud` | Meta WhatsApp Cloud API, gabarit d'authentification | production |

`code_dev` n'est renvoyé **que** hors production **et** si aucun envoi réel n'a
eu lieu. SMS et email sont câblés mais non raccordés.

## 7.4 Cycle de vie du code

| Propriété | Valeur |
|---|---|
| Longueur | 6 chiffres |
| Durée | 5 minutes |
| Usage | unique |
| Codes concurrents | non — les précédents sont invalidés |
| **Tentatives** | **5, puis le code est brûlé** |

**BR-100** — Cinq essais infructueux invalident le code : un million de
possibilités tombe en quelques minutes sans plafond.

**BR-101** — Si l'envoi échoue, le code est immédiatement invalidé : on ne
laisse pas traîner un OTP que personne n'a reçu.

## 7.5 Jeton d'accès

```json
{ "session_id", "utilisateur_id", "role", "etablissement_id",
  "ministere_id", "personne_id", "est_agent_principal", "sous_role" }
```

Le jeton porte le cloisonnement. **Il ne suffit pas** : le middleware vérifie à
chaque requête que la session est toujours ouverte.

## 7.6 Sessions et révocation

| Élément | Choix |
|---|---|
| Jeton d'accès | JWT court, porté par `Authorization: Bearer` |
| Jeton de rafraîchissement | 48 octets aléatoires, **stocké en SHA-256 uniquement** |
| Durée de session | 30 jours, glissante |
| Révocation | immédiate — la session fait autorité, pas le jeton |

**NFR-100** — Désactiver un compte coupe ses accès **immédiatement**. Sans
vérification de session, un agent parti resterait connecté jusqu'à expiration
du jeton.

Endpoints : `refresh`, `logout`, `sessions` (appareils connectés),
`sessions/:id` (fermeture à distance), `sessions/fermer-autres`.

## 7.7 Récupération après perte

Le changement volontaire de numéro s'auto-vérifie (OTP ancien puis nouveau). La
**perte** ne le permet pas : c'est justement l'ancien numéro qui a disparu.

**FR-101** — Le dépôt d'une demande de récupération est **public** : le
demandeur ne peut pas s'authentifier pour signaler qu'il ne peut plus
s'authentifier. La validation revient à un agent, pièce d'identité en main.

**BR-102** — À la validation, **toutes les sessions du compte sont coupées** :
l'ancien appareil est peut-être entre d'autres mains.

Détail en [chapitre 29 — ERR-003](#).
