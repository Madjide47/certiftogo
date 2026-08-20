# Sécurité des dépendances (L-14)

État au 16 août 2026. Relancer `npm audit` dans chaque paquet pour actualiser.

Une alerte n'est pas une vulnérabilité : elle le devient si le code
*atteint* la fonction fautive. Ce document tranche pour chaque cas, plutôt
que d'afficher un compteur à zéro obtenu en désinstallant ce qui gêne.

---

## Backend — de 7 alertes (dont 1 critique) à 2 modérées

### Corrigé par suppression

| Paquet | Gravité | Décision |
|---|---|---|
| `bcrypt` → `@mapbox/node-pre-gyp` → `tar` | **critique** | **Désinstallé.** `bcrypt` n'était importé nulle part : l'authentification se fait par OTP et JWT, il n'y a aucun mot de passe à hacher. La dépendance traînait depuis la Phase 1. Elle portait à elle seule la seule alerte critique du projet (écriture arbitraire de fichiers via un lien physique dans une archive tar). |
| `uuid` | modérée | **Désinstallé.** Jamais importé non plus : les identifiants viennent de `gen_random_uuid()` côté PostgreSQL. |

> Leçon : la moitié de la surface d'attaque du backend venait de deux
> paquets que le code n'utilisait pas. Avant de mettre à jour, vérifier
> ce qui sert.

### Corrigé par mise à jour

| Paquet | Gravité | Décision |
|---|---|---|
| `express` → `body-parser` | faible | Monté en `^4.21.2`. Déni de service quand une valeur de `limit` invalide désactivait silencieusement le contrôle de taille. |
| `brace-expansion` (transitif) | haute | Résolu par `npm audit fix`. |

### Accepté, avec justification

| Paquet | Gravité | Pourquoi on ne corrige pas |
|---|---|---|
| `exceljs` → `uuid` | modérée | L'avis concerne `uuid` v3/v5/v6 **quand un buffer est fourni** (absence de contrôle de bornes). ExcelJS n'appelle que `v4()` sans buffer — un seul site d'appel, `cf-rule-ext-xform.js`, pour un identifiant de règle de mise en forme conditionnelle. **La fonction fautive n'est pas atteignable.** Le « correctif » proposé par npm est un retour à `exceljs@3.4.0`, c'est-à-dire une régression majeure de la bibliothèque qui porte tout l'import Excel : le remède serait pire que le mal. |

**Revue à faire** quand `exceljs` publiera une version alignée sur
`uuid@11.1.1`.

---

## Front-office et back-office — de 6 alertes à **zéro**

| Paquet | Gravité | Décision |
|---|---|---|
| `nanoid` | haute | Mis à jour (`npm audit fix`). Boucle infinie sur une taille nulle ou négative. |
| `postcss` | haute | Mis à jour. Lecture arbitraire de fichiers `.map` via `sourceMappingURL`. Outillage de build, mais le correctif ne coûtait rien. |
| `react-router`, `react-router-dom` | modérée | **Monté en v7.** Aucun correctif n'existe sur la branche 6 : l'avis couvre `6.0.0 – 7.17.0`, la version saine est `7.18`. Redirection ouverte via un antislash dans `<Link>` et `useNavigate`. |
| `vite`, `esbuild` | modérée | **Monté en vite 7** (esbuild 0.25). |

> **Pourquoi accepter un saut de version majeure à trois semaines de la
> soutenance ?** Parce qu'il n'en était pas vraiment un ici. Les deux fronts
> n'utilisent que l'API déclarative de React Router — `BrowserRouter`,
> `Routes`, `Route`, `Navigate`, `Link`, `NavLink`, `Outlet`, `useNavigate`,
> `useParams`, `useSearchParams`, `useLocation` — toutes inchangées en v7 ;
> les ruptures de la v7 portent sur le mode « framework » et le rendu serveur,
> que le projet n'emploie pas. Vite 7 ne demande que Node ≥ 20.19. Les deux
> builds ont été rejoués et passent (`vite build`, 105 et 163 modules).

> `react-router` méritait la correction réelle : c'est le seul des quatre à
> être **embarqué dans le site livré au public**. `postcss`, `esbuild` et
> `vite` ne servent qu'à fabriquer des fichiers statiques — leur avis ne
> concerne que le poste du développeur.

---

## Blockchain — 27 alertes, toutes dans l'outillage Hardhat

`hardhat`, `@nomicfoundation/*`, `mocha`, `solc`, `adm-zip`, `undici`…

**Aucune n'atteint la production** : ce paquet ne sert qu'à compiler,
tester et déployer le contrat. Le contrat déployé, lui, est du bytecode
figé sur Polygon Amoy — il ne dépend d'aucun paquet npm à l'exécution, et
le backend parle à la chaîne via `ethers`, qui est à jour.

Passer Hardhat 2 → 3 est une migration de rupture (configuration, plugins,
API de test) pour un bénéfice nul sur la sécurité du service rendu. **Non
fait, assumé.**

---

## Récapitulatif

| Paquet | Critiques | Hautes | Modérées |
|---|---|---|---|
| `backend/` | 0 | 0 | 0 |
| `frontend-back-office/` | 0 | 0 | 0 |
| `frontend-public/` | 0 | 0 | 0 |
| `blockchain/` | — | — | outillage seul, hors production |

---

## Le code OTP affiché à l'écran — un drapeau, et deux verrous

`OTP_AFFICHE_CODE=true` fait renvoyer le code OTP dans la réponse de
`request-otp`, que l'écran de connexion montre alors dans un encart. C'est un
confort de **démonstration** : sans lui, il faut lire le code dans
`docker logs certiftogo_api` au milieu d'une présentation.

Deux conditions le bornent, et la seconde n'a pas d'échappatoire :

1. le drapeau doit être posé — il ne l'est que dans `docker-compose.yml`, sur la
   pile de démonstration, jamais dans `render.yaml` ;
2. **aucun envoi réel ne doit avoir eu lieu** (`WHATSAPP_MODE` ≠ `cloud`). Dès
   qu'un code part vraiment sur le téléphone de quelqu'un, il redevient un
   secret et rien ne le réaffiche, drapeau ou pas.

> **Pourquoi un drapeau dédié plutôt que `NODE_ENV=development` ?** Parce que
> l'image conteneurisée tourne délibérément en `production` — on montre le vrai
> emballage, pas un serveur de développement. Rétrograder `NODE_ENV` pour
> obtenir l'affichage du code changerait au passage la verbosité des erreurs et
> le durcissement HTTP : bien plus que ce qu'on demande, et sans le dire.

---

## Backend — les deux dernières modérées, réglées par `overrides`

`exceljs@4.4.0` déclare `uuid@^8.3.0`, visé par un avis modéré : absence de
contrôle de bornes sur le tampon fourni à `v3`/`v5`/`v6`. `npm audit fix --force`
proposait de **redescendre exceljs en 3.4.0** — une rupture qui casserait
l'import Excel d'une promotion, pour corriger une faille que le projet
n'atteint pas : exceljs n'importe que `v4`, et jamais avec un tampon.

Le `overrides: { "uuid": "^11.1.1" }` de `backend/package.json` force la
version saine sans toucher à exceljs. Le pari est mince et vérifié :
`cf-rule-ext-xform.js` est le seul fichier d'exceljs à requérir uuid, il en
tire `{ v4 }`, export nommé toujours présent en CJS sur uuid 11. Les **304
tests passent**, import Excel compris.

> Corriger une dépendance transitive vaut mieux que dégrader la dépendance
> directe qui la tire : la seconde a des utilisateurs dans le code, la
> première non.

## Ce qu'il reste à faire

1. Retirer l'`overrides` le jour où exceljs publie une version alignée sur
   `uuid@11` — l'override est une béquille, pas une réparation amont.
2. `npm audit --audit-level=high` est en CI, pour que la prochaine
   alerte critique ne dorme pas six mois.
