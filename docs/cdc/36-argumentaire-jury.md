# 36. Argumentaire pour le jury

> Deux questions tomberont. Elles ne portent pas sur le code, mais sur la
> crédibilité du dispositif. Ce chapitre y répond, puis anticipe les objections
> qui suivent et énonce les limites du système — parce qu'un projet qui ne
> connaît pas ses limites n'inspire pas confiance.

---

## 36.1 Qui détient réellement la clé privée du ministère ?

C'est **la** question. Si cette clé est compromise, n'importe qui peut fabriquer
un diplôme que la plateforme déclarera authentique — et tout le dispositif perd
sa raison d'être.

### Réponse courte

> La clé n'appartient à personne physiquement. Elle vit **hors de l'application**,
> dans un service de gestion de clés du ministère. L'application ne la lit
> jamais : elle **demande une signature**, et chaque demande est tracée. Aucun
> agent, aucun administrateur, aucun développeur n'a accès à sa valeur.

### Réponse détaillée

**Où elle est stockée.** Quatre niveaux, du plus faible au plus fort :

| Niveau | Emplacement | Adapté à |
|---|---|---|
| 1 | Variable d'environnement du serveur | **état actuel — développement et MVP** |
| 2 | KMS cloud managé (chiffrement au repos, accès par rôle) | mise en service |
| 3 | HSM logiciel | production nationale |
| 4 | HSM matériel ou portefeuille froid multi-signature | cible long terme |

La colonne `cles_signature.emplacement` **déclare explicitement** le niveau en
vigueur. C'est un choix de conception : rendre visible le fait qu'on est encore
au niveau 1 vaut mieux que de le laisser deviner.

**Qui peut l'utiliser.** Jamais un humain. Le serveur applicatif appelle une
fonction de signature ; à partir du niveau 2, cet appel sort du serveur et
devient une requête au KMS, autorisée par rôle et journalisée côté fournisseur.
Chaque signature laisse une trace dans `journal_audit`, avec l'agent qui a
déclenché la certification.

**Comment elle est protégée.**

- Elle n'est **jamais** en base : seule son empreinte SHA-256 y figure, ce qui permet de dire « c'est bien la même clé » sans rien révéler. Un test vérifie que le secret n'apparaît nulle part dans les réponses de l'API.
- Elle n'est jamais dans le dépôt : l'application **refuse de démarrer en production** si `MINISTERE_SIGNING_SECRET` est absent ou trop court. Une valeur de repli codée en dur avait existé au début du projet ; sa suppression a fait l'objet d'un correctif de sécurité dédié.
- Chaque diplôme est rattaché à la clé qui l'a signé (`diplomes.cle_signature_id`), donc on sait exactement lesquels seraient concernés par une compromission.
- Une seule clé peut être active à la fois — garanti par un index unique partiel. Deux clés valides simultanément rendraient impossible de dire laquelle fait foi.

**Que faire en cas de compromission.** La procédure est implémentée
(`POST /api/admin/cles/compromission`) et ne prétend **pas** réparer
automatiquement — la nouvelle clé doit d'abord être installée hors application.
Elle fige le constat et produit la marche à suivre :

1. installer une nouvelle clé dans le KMS ou le HSM ;
2. redémarrer le service avec le nouveau secret ;
3. enregistrer la nouvelle clé au registre ;
4. re-signer les *N* diplômes concernés — le nombre est calculé, pas estimé ;
5. publier un avis public indiquant la période affectée.

**Point important pour le jury** : la compromission **n'invalide pas** les
diplômes déjà ancrés. Leur empreinte est sur la blockchain, horodatée, et le
registre dit précisément quelle période est douteuse. C'est exactement ce qu'une
base de données seule ne permettrait pas : on ne saurait pas distinguer ce qui
a été signé avant de ce qui a été signé après.

---

## 36.2 Pourquoi une blockchain plutôt qu'une simple base de données ?

C'est la question classique, et la mauvaise réponse — « parce que la blockchain
est sécurisée » — est éliminatoire. La bonne réponse tient en un constat :

> **Une base de données prouve ce que son propriétaire veut bien montrer.
> Une blockchain publique prouve ce qui s'est passé, même contre lui.**

### 36.2.1 Intégrité vérifiable sans faire confiance au serveur

Un employeur qui consulte une base de données consulte **ce que le serveur lui
répond**. Il n'a aucun moyen de savoir si la ligne a été modifiée hier.

Avec l'ancrage, il dispose d'une vérification indépendante :

```
document reçu ──> recalcul SHA-256 ──> empreinte
                                          │
                        comparaison avec la chaîne publique
                                          │
                          identique ? le document est intact
```

Le point décisif : **cette vérification ne passe pas par le serveur du
ministère**. Le vérificateur peut consulter le contrat sur Polygonscan et
constater lui-même que l'empreinte y figure, avec sa date.

### 36.2.2 Non-répudiation

Le diplôme est signé par la clé du ministère, et cette signature est ancrée
avec un horodatage. Le ministère ne peut pas nier avoir certifié un diplôme
qu'il a certifié — ni prétendre l'avoir fait à une autre date.

Symétriquement, un établissement ne peut pas nier avoir transmis un lot : la
transmission est horodatée, nominative, et le journal d'audit conserve l'agent
émetteur.

### 36.2.3 Résistance à la falsification interne

C'est **l'argument le plus fort**, et celui qu'il faut développer.

La fraude aux diplômes ne vient pas seulement de faussaires extérieurs. Le
risque le plus sérieux est **interne** : un agent qui ajoute un diplôme dans la
base, ou modifie une mention contre rémunération.

- Avec une base seule : l'administrateur modifie la ligne, et **rien ne le montre**. Il peut même effacer le journal d'audit — il en a les droits.
- Avec l'ancrage : la modification change l'empreinte, qui ne correspond plus à celle publiée. **Et l'agent ne peut pas modifier la chaîne**, parce qu'elle n'est pas chez lui.

Le système ne rend pas la fraude impossible — il la rend **détectable par un
tiers**, ce qui est le seul niveau de garantie atteignable.

Corollaire honnête : ajouter un *nouveau* diplôme frauduleux **et l'ancrer**
reste possible pour qui contrôle la clé de signature. C'est pourquoi la
question 36.1 précède celle-ci : la chaîne protège l'intégrité de ce qui a été
signé, la gouvernance de la clé protège la légitimité de la signature. Les deux
sont nécessaires.

### 36.2.4 Interopérabilité internationale

Une université canadienne qui reçoit un diplôme togolais ne va pas ouvrir un
compte sur une plateforme togolaise, ni signer une convention d'accès.

Avec un ancrage public, elle vérifie **sans autorisation, sans compte, sans
convention** : elle recalcule l'empreinte et la cherche sur une chaîne publique.
Le diplôme devient vérifiable partout où l'on sait lire une blockchain — ce
qu'aucune base nationale ne permet.

---

## 36.3 Objections probables, et réponses

**« Vous auriez pu signer les PDF avec un certificat électronique classique,
sans blockchain. »**

C'est exact, et cela couvrirait la non-répudiation. Mais une signature
classique ne dit **rien de l'état actuel** : un diplôme révoqué reste
parfaitement signé. Il faudrait consulter une liste de révocation… hébergée par
le ministère, donc on revient au problème de confiance. L'ancrage porte
l'horodatage **et** le statut, publiquement.

**« Le testnet est gratuit ; en production le coût sera prohibitif. »**

Le coût mesuré est d'environ 0,0075 POL par opération. Pour 50 000 diplômes
annuels, cela reste modeste — et le chapitre 34 documente deux optimisations :
le regroupement par lot et l'arbre de Merkle, qui ancre une racine par
promotion avec des preuves individuelles. Le compromis y est explicité : le
Merkle divise le coût, mais complique la révocation unitaire.

**« Que se passe-t-il si Polygon disparaît ? »**

Les preuves déjà publiées restent vérifiables tant que la chaîne existe. En cas
de disparition, la base PostgreSQL conserve l'intégralité des données et des
signatures : le système continue de fonctionner, il perd la vérifiabilité
indépendante. C'est une dégradation, pas une panne. Un ré-ancrage sur une autre
chaîne resterait possible, puisque les empreintes sont conservées.

**« Un diplômé peut-il perdre l'accès à ses diplômes ? »**

Non. Le diplôme appartient à la base et à la chaîne, pas au compte. Perdre son
téléphone empêche de se connecter, pas d'exister : la procédure ERR-003 permet
de rattacher le compte à un nouveau numéro après vérification d'identité par un
agent.

**« Pourquoi le candidat ne peut-il pas corriger lui-même son nom ? »**

Parce qu'il pourrait alors modifier l'identité portée par un diplôme officiel.
Toute correction passe par le ministère et produit une **nouvelle version** du
diplôme, l'ancienne étant marquée « remplacée » — pas « révoquée », la
distinction est importante : une diplômée qui se marie n'est pas une fraudeuse.

**« Comment gérez-vous 12 000 diplômés d'un coup ? »**

Pas en synchrone : ce serait treize heures de requête HTTP. Le diplôme est créé
en base immédiatement — juridiquement il est délivré — et l'ancrage passe par
une file consommée au rythme du réseau, avec reprise sur incident et indicateur
de progression. La vérification publique d'un diplôme non encore ancré répond
franchement « en cours d'ancrage » plutôt que d'annoncer une preuve qui n'existe
pas encore.

---

## 36.4 Limites assumées du dispositif

Les énoncer soi-même vaut mieux que de les laisser découvrir.

**Ce que le système ne garantit pas :**

1. **La véracité des données saisies.** Si un établissement déclare une mention fausse, la plateforme certifiera une mention fausse — de manière parfaitement traçable. La blockchain garantit l'intégrité, pas la vérité. Les contrôles automatiques réduisent les erreurs matérielles ; ils ne remplacent pas l'honnêteté de l'émetteur.

2. **La sécurité au-delà de la clé.** Qui contrôle la clé de signature peut émettre un diplôme authentique. C'est pourquoi la gouvernance de la clé (36.1) est traitée comme le cœur du sujet, et pourquoi le contrôle à quatre yeux existe.

3. **La disponibilité hors ligne.** Le QR pointe vers une URL : sans réseau, pas de vérification. Choix assumé (ADR-005), puisqu'un QR statique mentirait sur les diplômes révoqués.

**Dettes techniques reconnues :**

| Point | État | Conséquence |
|---|---|---|
| Clé en variable d'environnement | niveau 1 sur 4 | acceptable en MVP, à élever avant mise en service |
| Contrôle à quatre yeux | table posée, non branché | la révocation reste une décision individuelle |
| Limitation de débit en mémoire | par processus | insuffisant derrière plusieurs instances |
| SMS et email | canaux tracés, non raccordés | seul WhatsApp achemine réellement |
| Données de démonstration | ancrées en mode `mock` | signalé honnêtement à la vérification |
| Frontend | fonctionnel, refonte prévue | l'interface actuelle n'est pas le rendu final |

**Ce qui reste hors périmètre :** reprise des diplômes papier antérieurs,
reconnaissance optique, ouverture à d'autres ministères, application mobile
native. Ces sujets figurent au chapitre 32 comme évolutions, pas comme
livrables.

---

## 36.5 Ce qu'il faut retenir en trois phrases

1. **PostgreSQL détient les données ; la blockchain détient la preuve qu'elles n'ont pas changé.** Ni l'une ni l'autre ne suffirait seule.
2. **La garantie n'est pas l'impossibilité de frauder, c'est la détectabilité de la fraude par un tiers** — y compris contre l'administration elle-même.
3. **Le point faible n'est pas la blockchain, c'est la clé.** C'est pour cela qu'elle est traitée en premier, avec un registre, une procédure de compromission et un chemin d'élévation documenté.
