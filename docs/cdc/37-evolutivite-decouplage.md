# 37. Évolutivité et découplage

> Ce chapitre décrit le découpage **réel** du code, pas une cible.
> Voir [ADR-010](35-decisions-architecture.md#adr-010) pour la décision de
> rester sur un monolithe modulaire.

---

## 37.1 Principe : monolithe modulaire

Un seul processus déployable, découpé en services applicatifs à frontière
nette. L'architecture est stricte :

```
Route ──► Middleware ──► Controller ──► Service ──► Model ──► SQL
```

Chaque couche ne connaît que la suivante. Un contrôleur ne fait jamais de SQL ;
un modèle n'applique jamais de règle métier ; un service ne connaît ni `req` ni
`res`.

**Ce que cette discipline permet concrètement** : les frontières d'un futur
micro-service sont déjà tracées. Extraire un service reviendrait à remplacer un
appel de fonction par un appel réseau — pas à réécrire la logique.

**Ce qu'elle ne garantit pas** : rien n'empêche techniquement un service d'en
appeler un autre à contresens. La discipline repose sur la revue, pas sur le
compilateur.

---

## 37.2 Inventaire des services

| Service | Responsabilité | Dépend de | Extractible |
|---|---|---|---|
| `auth` | OTP, jetons, anti-force brute | `otp`, `whatsapp`, `session`, `audit` | 🟡 |
| `session` | sessions révocables, rafraîchissement | — | 🟡 |
| `permissions` | matrice des droits, modes de workflow | — | 🟢 |
| `candidat` | fiches étudiant, résolution d'identité | `personne`, `utilisateur`, `audit` | 🔴 |
| `structure` | facultés, filières | — | 🔴 |
| `promotion` | cohortes, inscriptions, résultats | `structure`, `import` | 🔴 |
| `import` | Excel / CSV, validation ligne à ligne | — | 🟢 |
| `lot` | transmission, instruction, rejet partiel | `controle`, `audit`, `notification` | 🔴 |
| `controle` | contrôles automatiques de niveau 1 | `habilitation` | 🟢 |
| `diplome` | certification unitaire, révocation | `hash`, `signature`, `pdf`, `qr`, `blockchain` | 🟡 |
| `correction` | versionnement, remplacement | `diplome`, `blockchain` | 🟡 |
| `ancrage` | file d'attente, worker | `blockchain` | 🟢 **candidat n° 1** |
| `blockchain` | Ethers, contrat, modes mock/onchain | — | 🟢 |
| `hash` / `signature` | empreinte canonique, signature | — | 🟢 |
| `pdf` / `qr` | génération documentaire | — | 🟢 |
| `notification` | catalogue, envoi, préférences | `whatsapp` | 🟢 |
| `whatsapp` | Cloud API, mode mock | — | 🟢 |
| `audit` | journal, historique, corbeille | `contexte` | 🟡 |
| `verification` | vérification publique | `diplome`, `blockchain` | 🟢 |
| `tableau-bord` | agrégations par rôle | — | 🟡 |
| `gouvernance` | agrément, habilitations, agents | `notification`, `audit` | 🔴 |
| `exceptions` | récupération, départ, clés | `session`, `notification` | 🟡 |

🟢 extractible sans difficulté · 🟡 extractible avec adaptation · 🔴 fortement
couplé au modèle de données

---

## 37.3 Les services les plus autonomes

### `ancrage` — premier candidat à l'extraction

**Responsabilité** : consommer la file d'ancrage, appeler la blockchain,
mettre à jour le statut des diplômes.

**Interface** : deux verbes seulement — *enfiler une tâche*, *traiter une
tranche*. La table `file_attente_ancrage` fait déjà office de contrat entre le
producteur et le consommateur.

**Pourquoi il est le premier candidat** : son rythme n'est pas celui du web.
Une requête HTTP se mesure en millisecondes, une confirmation blockchain en
secondes. Les faire cohabiter dans le même processus, c'est dimensionner l'un
sur les contraintes de l'autre. `FOR UPDATE SKIP LOCKED` permet déjà à
plusieurs consommateurs de travailler en parallèle : l'extraction consisterait
à lancer ce consommateur ailleurs, sans changer une ligne de logique.

### `notification` — deuxième candidat

**Interface** : `notifier(evenement, destinataires, donnees)`. Le catalogue est
un fichier de données pur.

**Pourquoi** : les envois sortants dépendent de tiers (Meta, opérateur SMS,
SMTP) dont les latences et les pannes n'ont rien à voir avec l'application. La
table `notifications` est déjà une file : la ligne existe avant l'envoi.

### `blockchain`, `pdf`, `qr`, `hash`, `signature`

Fonctions pures ou quasi pures, sans état ni accès base. `blockchain` est déjà
abstrait derrière deux modes (`mock` / `onchain`), ce qui prouve que sa
frontière tient.

---

## 37.4 Ce qui ne doit pas être découplé

C'est la partie du chapitre qui compte le plus. Découper au mauvais endroit
coûte plus cher que de ne pas découper.

### La certification doit rester transactionnelle

La certification d'un dossier écrit, **dans une seule transaction SQL** :

1. le diplôme ;
2. la transaction blockchain ;
3. le statut du dossier ;
4. l'activation du compte du diplômé ;
5. l'historique de statut ;
6. le journal d'audit.

Éclater cela en micro-services imposerait une **saga** avec compensations. Or
que compense-t-on quand la troisième étape échoue et que le diplôme est déjà
ancré on-chain ? La blockchain est irréversible : il n'y a pas de compensation
possible.

> **Une transaction ACID locale vaut mieux qu'une saga distribuée quand l'une
> des étapes est irréversible.**

### `candidat`, `promotion`, `lot`, `gouvernance` restent ensemble

Ces services partagent le même graphe de données et le même cloisonnement par
établissement. Les séparer exigerait de dupliquer la vérification d'isolation
dans chaque service — donc de multiplier les endroits où l'oublier.

### L'audit doit rester au même endroit que ce qu'il trace

Les traces critiques — certification, révocation, validation d'un lot — sont
écrites **dans la même transaction** que l'acte. Extraire l'audit rendrait cette
garantie impossible : on retomberait sur un envoi asynchrone qui peut se perdre,
c'est-à-dire exactement ce qu'un journal d'audit ne doit pas être.

---

## 37.5 Critères d'extraction

Un service mérite d'être extrait quand **au moins deux** conditions sont
réunies :

1. **Profil de charge différent** du reste de l'application ;
2. **Rythme de déploiement différent** ;
3. **Point de contention mesuré** — pas supposé ;
4. **Dépendance externe instable** dont on veut isoler les pannes ;
5. **Équipe distincte** qui en assume la maintenance.

`ancrage` remplit 1, 2 et 4. `notification` remplit 1 et 4. Aucun autre n'en
remplit deux aujourd'hui — ce qui est la raison de ne pas les extraire.

**Contre-indication absolue** : un service dont l'extraction transformerait une
transaction ACID en saga ne doit pas être extrait, quel que soit son profil de
charge.

---

## 37.6 Autres axes d'évolutivité

### Horizontal

Le backend est **sans état** — sauf deux exceptions à corriger avant de
dupliquer les instances :

| Élément | État actuel | À faire |
|---|---|---|
| Sessions | en base | ✅ compatible |
| Limitation de débit | **en mémoire, par processus** | ⬜ compteur partagé |
| Métriques d'API | **en mémoire, par processus** | ⬜ agrégation externe |
| File d'ancrage | en base, `SKIP LOCKED` | ✅ compatible |
| Fichiers PDF / QR | disque local | ⬜ stockage objet partagé |

Ces quatre points sont la dette réelle à solder avant une mise à l'échelle. Ils
sont listés ici pour être vus, pas pour être découverts en production.

### Vertical

PostgreSQL absorbera longtemps la charge nationale : 50 000 diplômes par an
représentent une base modeste. Les index partiels et les agrégations en SQL
évitent les parcours complets.

### Fonctionnel

L'ajout d'un domaine suit toujours le même chemin : migration → modèle →
service → contrôleur → route → tests. Treize migrations ont été ajoutées sans
casser les précédentes, ce qui valide le mécanisme incrémental.

---

## 37.7 Trajectoire réaliste

| Étape | Déclencheur | Action |
|---|---|---|
| **Aujourd'hui** | — | monolithe modulaire, une instance |
| **Mise en service** | premiers établissements | compteur de débit partagé, stockage objet, worker autonome |
| **Montée en charge** | file d'ancrage saturée | extraction de `ancrage` |
| **Volume national** | envois sortants massifs | extraction de `notification` |
| **Plusieurs ministères** | nouveau périmètre | cloisonnement par ministère avant tout découpage technique |

Le point à retenir : **le découpage suit la charge mesurée, pas l'inverse.**
Extraire un service avant d'avoir mesuré le besoin ajoute une latence réseau,
un mode de panne et une complexité de déploiement, en échange d'un bénéfice
hypothétique.
