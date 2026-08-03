# Sécurité des dépendances (L-14)

État au 3 août 2026. Relancer `npm audit` dans chaque paquet pour actualiser.

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

## Front-office et back-office — 5 alertes, non corrigées faute d'espace disque

| Paquet | Gravité | Portée |
|---|---|---|
| `vite`, `esbuild` | haute / modérée | **Outillage de développement.** Le serveur de développement d'esbuild accepte des requêtes de n'importe quelle origine ; cela n'affecte pas le site construit, qui est un ensemble de fichiers statiques. |
| `postcss` | haute | Outillage de build. |
| `react-router`, `react-router-dom` | modérée | **Embarqué dans le site livré** — celui-ci mérite une correction réelle. |

⏳ **À faire** : `npm audit fix` dans les deux fronts. La commande a échoué
le 3 août sur un disque plein (`npm error nospc`) ; le poste n'avait plus
que 50 Mo libres. Rien n'est cassé — les deux fronts se construisent — mais
la mise à jour reste à passer.

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

## Ce qu'il reste à faire

1. `npm audit fix` dans `frontend-back-office/` et `frontend-public/`
   (bloqué par l'espace disque le 3 août).
2. Revoir `exceljs` quand une version alignée sur `uuid@11.1.1` sortira.
3. Ajouter `npm audit --audit-level=high` à la CI, pour que la prochaine
   alerte critique ne dorme pas six mois.
