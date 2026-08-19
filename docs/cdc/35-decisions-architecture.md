# 35. Décisions d'architecture (ADR)

> Format Michael Nygard : **Contexte**, **Décision**, **Statut**, **Conséquences**.
> Chaque décision est datée et porte ses conséquences négatives autant que
> positives — une ADR qui n'énonce que des avantages n'est pas une décision,
> c'est un argumentaire.

**Statuts possibles** : `Acceptée` · `Acceptée avec réserve` · `Remplacée par ADR-xxx` · `Proposée`

---

<a id="adr-001"></a>
## ADR-001 — Une base PostgreSQL centralisée plutôt que distribuée

**Statut** : Acceptée — 2 août 2026

### Contexte

CertifTOGO doit rassembler les données de tous les établissements togolais.
Deux architectures étaient possibles.

**Option A — bases réparties.** Chaque établissement conserve sa propre base ;
CertifTOGO l'interroge au moment de la certification. Cela suppose de
développer un connecteur par établissement, car le parc réel est hétérogène :
Oracle ici, MySQL là, des classeurs Excel ailleurs, et parfois rien du tout. La
structure des bases change sans préavis, et un établissement hors ligne bloque
la certification de ses diplômés.

**Option B — base centralisée.** Les établissements travaillent directement
dans CertifTOGO ; chacun ne voit que ses données grâce au cloisonnement
applicatif.

### Décision

**Une base PostgreSQL unique, hébergée par le ministère.** Le cloisonnement est
assuré par l'application : chaque requête d'un établissement porte un filtre
`etablissement_id` issu du jeton d'authentification, jamais d'un paramètre
client.

### Conséquences

**Positives**

- Un seul schéma à maintenir et à faire évoluer ; les migrations sont jouées une fois.
- Sauvegarde et restauration uniques, donc réellement testables.
- Les statistiques nationales sont une requête SQL, pas un travail d'agrégation distribuée.
- Aucun connecteur à écrire, donc aucun coût d'intégration par établissement.
- Un établissement sans informatique peut utiliser la plateforme le jour même.

**Négatives**

- **Point unique de défaillance** : si la base tombe, tout le pays s'arrête. Atténuation : sauvegardes régulières, restauration testée, supervision (voir chapitre 27).
- **Le cloisonnement repose sur le code**, pas sur une frontière physique. Un défaut d'isolation exposerait les données d'un établissement à un autre. Atténuation : l'isolation est couverte par des tests d'intégration dédiés, qui vérifient qu'un établissement reçoit `404` — et non `403` — sur les ressources d'un confrère.
- **Le ministère devient dépositaire de données personnelles** pour l'ensemble du pays, avec les obligations qui en découlent.
- Souveraineté des données : les établissements ne détiennent plus leur copie de référence. C'est un choix politique autant que technique.

### Alternative écartée et pourquoi

L'option A n'a pas été retenue parce que son coût réel n'est pas technique mais
organisationnel : elle suppose que chaque établissement dispose d'un système
d'information stable et d'une équipe pour le maintenir. Ce n'est pas le cas
aujourd'hui, et une architecture qui exige cette condition ne serait tout
simplement pas déployable.

> **Évolution prévue** : l'ADR-013 (API d'intégration) permettra aux
> établissements déjà informatisés d'alimenter la base centrale depuis leur
> propre système, sans double saisie — sans revenir sur la centralisation.

---

<a id="adr-002"></a>
## ADR-002 — Le candidat ne s'inscrit pas lui-même

**Statut** : Acceptée — 2 août 2026

### Contexte

La question posée est : comment un diplômé obtient-il un compte ?

L'inscription libre est le réflexe habituel. Elle est ici **structurellement
impossible** : si un visiteur saisit « Koffi, IAI Lomé », la plateforme n'a
aucun moyen de vérifier qu'il y a réellement étudié. Un système dont la raison
d'être est de combattre la fraude aux diplômes ne peut pas commencer par
accepter une déclaration sur l'honneur.

### Décision

**Aucun rôle ne dispose d'inscription libre.** Les comptes naissent d'un acte
administratif :

| Rôle | Créé par | Au moment de |
|---|---|---|
| Administrateur système | manuellement, à l'installation | mise en service |
| Ministère | administrateur système | prise de fonction de l'agent |
| Établissement | ministère | agrément de l'établissement (ADR-003) |
| Agent d'établissement | agent principal de l'établissement | recrutement |
| Candidat | **automatiquement, à la saisie de sa fiche** | inscription dans une promotion |

Le compte du diplômé est créé **désactivé** au moment de la saisie, et **activé
par la certification** de son premier diplôme.

### Conséquences

**Positives**

- Aucun compte ne peut exister sans qu'un acteur habilité en réponde.
- La fraude par création de compte est éliminée à la racine : il n'y a pas de porte d'entrée à forcer.
- Le diplômé n'a rien à faire : le jour où il reçoit la notification, son compte l'attend déjà.
- L'activation à la certification évite d'ouvrir des milliers de comptes inutilisables pour des étudiants non encore diplômés.

**Négatives**

- **Un diplômé sans numéro de téléphone n'a pas de compte.** L'établissement doit collecter le numéro, ce qui n'est pas toujours le cas dans les fichiers existants. Atténuation : l'import signale les lignes sans numéro comme anomalie sans les rejeter, et la fiche reste créée — seule la connexion est impossible.
- **Une erreur de numéro à la saisie donne le diplôme à la mauvaise personne.** C'est le risque principal du dispositif. Atténuation : le numéro est canonisé (ADR-014), l'import détecte les doublons, et la récupération de compte (ERR-003) passe par une vérification d'identité.
- Le diplômé ne peut pas corriger lui-même ses données : il doit passer par son établissement.

### Décision liée

**Le compte est rattaché à la PERSONNE, pas à la fiche étudiant** — voir
ADR-014, sans laquelle un diplômé de deux établissements aurait deux comptes
et deux portefeuilles séparés.

---

<a id="adr-003"></a>
## ADR-003 — Le ministère crée les établissements, pas l'administrateur système

**Statut** : Acceptée — 2 août 2026 (remplace la pratique initiale)

### Contexte

Dans la première version, `POST /api/admin/etablissements` permettait à
l'administrateur système de créer un établissement. Techniquement correct,
administrativement faux : **agréer un établissement est une décision
d'habilitation**, pas une opération d'exploitation. C'est le ministère qui
reconnaît un établissement et fixe les diplômes qu'il peut délivrer.

Laisser l'administrateur le faire revenait à confier une décision politique à
un informaticien.

### Décision

La route administrateur est **supprimée**. L'agrément passe par
`POST /api/ministere/etablissements`, qui crée d'un seul geste et de manière
atomique :

1. l'établissement et son **code officiel** (`IAI001`, `ENA001`) ;
2. ses **habilitations** — les types de diplômes qu'il peut délivrer ;
3. son **agent principal**, seul compte capable d'en créer d'autres.

La répartition devient symétrique et lisible :

> **L'administrateur ne certifie jamais. Le ministère n'administre pas la plateforme.**

L'administrateur conserve : comptes du ministère, suspension d'un
établissement, paramètres, journaux, supervision, restauration.

### Conséquences

**Positives**

- La responsabilité de l'agrément est portée par l'autorité qui l'exerce réellement.
- L'atomicité évite l'état incohérent le plus probable : un établissement créé sans agent, donc auquel personne ne peut se connecter.
- Les habilitations posées à l'agrément rendent possibles les contrôles automatiques à la réception d'un lot (chapitre 29).

**Négatives**

- Le ministère devient un passage obligé : s'il tarde, l'établissement attend. Atténuation : la demande d'intégration (`/api/demandes-integration`) trace le délai et rend l'attente visible.
- Un test d'intégration vérifie que l'ancienne route répond `404` : c'est une rupture d'API assumée, justifiée par la gouvernance.

---

<a id="adr-004"></a>
## ADR-004 — La transmission se fait par promotion, pas diplômé par diplômé

**Statut** : Acceptée — 2 août 2026

### Contexte

Le modèle initial était : un candidat → un dossier → une transmission. Pour
l'Université de Lomé et ses 12 000 diplômés, cela signifie 12 000 envois et
12 000 instructions individuelles. Ni l'établissement ni le ministère ne
peuvent travailler ainsi.

Par ailleurs, un diplôme n'est pas délivré isolément : il résulte d'une
**délibération de jury** qui porte sur une promotion entière.

### Décision

**Le lot est l'unité de transmission et d'instruction ; le dossier reste
l'unité de décision.**

Un clic transmet la promotion : le système génère un dossier par étudiant
**admis**, horodate l'envoi et retient l'agent émetteur. Le ministère voit une
file de lots, pas une file de dossiers.

Le corollaire indispensable est le **rejet partiel** : un lot peut être
« partiellement traité » — 247 dossiers validés, 3 renvoyés avec leur motif.
Sans cela, trois anomalies bloqueraient 250 diplômés.

### Conséquences

**Positives**

- Le geste métier correspond à la réalité administrative : on transmet une délibération.
- La charge d'instruction devient proportionnelle au nombre de promotions, pas d'étudiants.
- La traçabilité est nominative : on sait quel agent a transmis quel lot, quand.
- Seuls les admis partent : on ne certifie pas un ajourné.

**Négatives**

- **Un lot mal constitué se corrige par retransmission**, pas par retouche : l'établissement doit reprendre la promotion. C'est plus lourd qu'une correction unitaire, mais cela préserve la cohérence du lot.
- La transmission devient un acte engageant, ce qui a imposé la hiérarchie interne (ADR-016) pour les établissements qui la souhaitent.
- Le statut `transmise` n'est plus atteignable par un simple changement d'état : une promotion transmise sans lot serait invisible du ministère. La transmission a donc son propre point d'entrée, ce qui a rendu obsolète l'ancien chemin.

---

<a id="adr-005"></a>
## ADR-005 — Le QR code porte une URL de vérification, pas le diplôme

**Statut** : Acceptée — 2 août 2026

### Contexte

Un QR code peut contenir les données du diplôme, ou une adresse permettant de
le vérifier. Le premier choix paraît séduisant : le vérificateur lit tout, même
hors ligne.

### Décision

**Le QR code contient uniquement l'URL de vérification publique**, construite
sur l'empreinte SHA-256 du diplôme.

### Conséquences

**Positives**

- **Un QR statique ne peut pas mentir sur un état qui change.** Un diplôme révoqué ou remplacé après impression continuerait d'afficher « valide » si les données étaient embarquées. En pointant vers le serveur, le QR dit toujours l'état actuel.
- La capacité d'un QR est limitée : y loger identité, mention, filière, date et signature produirait un code dense, fragile à l'impression et à la lecture.
- Aucune donnée personnelle n'est exposée à qui scanne sans autorisation : le QR ne révèle rien par lui-même.
- Chaque vérification est journalisée, ce qui alimente les statistiques et permet d'alerter le diplômé.

**Négatives**

- **La vérification exige une connexion.** Hors ligne, le QR est inutilisable. C'est assumé : la vérification d'un diplôme est un acte rare et volontaire, généralement effectué depuis un bureau.
- Le service de vérification devient un point critique de disponibilité.
- Une URL peut être imitée visuellement : un faux QR peut pointer vers un site ressemblant. Atténuation : le domaine officiel doit être communiqué et, à terme, la vérification proposée depuis une application officielle.

---

<a id="adr-006"></a>
## ADR-006 — La blockchain ne stocke que l'empreinte

**Statut** : Acceptée — 2 août 2026

### Contexte

Il serait possible d'écrire sur la chaîne le nom du diplômé, sa mention, son
établissement. Cela rendrait la vérification totalement indépendante du serveur
du ministère.

### Décision

**Le contrat ne stocke que l'empreinte SHA-256 du diplôme, sa signature, un
horodatage et un statut.** Aucune donnée personnelle n'est écrite on-chain.

### Conséquences

**Positives**

- **Une blockchain publique est irrévocable et mondiale.** Y écrire le nom et la date de naissance d'un citoyen togolais serait définitif et consultable par quiconque, pour toujours — incompatible avec toute exigence de protection des données.
- Le coût est borné : une empreinte de 32 octets coûte le même prix quel que soit le volume du diplôme.
- L'empreinte suffit à la preuve : si le document produit redonne la même empreinte, il est authentique ; sinon, il a été modifié.

**Négatives**

- **La chaîne seule ne permet pas de reconstituer un diplôme.** Sans la base PostgreSQL, on peut prouver qu'un document n'a pas été altéré, mais pas savoir de quoi il s'agit. C'est le compromis du stockage hybride (ADR-012).
- Un vérificateur ne peut pas se passer du serveur du ministère pour obtenir le contenu — seulement pour en contrôler l'intégrité.
- Toute modification de la structure des données signées change l'empreinte : le calcul doit être **canonique et figé**, ce qui contraint les évolutions futures du format.

---

<a id="adr-007"></a>
## ADR-007 — Une file d'attente pour les transactions blockchain

**Statut** : Acceptée — 2 août 2026

### Contexte

La certification était synchrone : une transaction blockchain par diplôme,
attendue dans le cycle HTTP. Sur Polygon, une confirmation prend quelques
secondes. Pour 12 000 diplômés, la requête durerait plus de treize heures — et
la moindre coupure réseau perdrait tout le travail.

### Décision

**La certification de masse passe par une file d'attente ; la certification
unitaire reste synchrone.**

Le diplôme est créé en base dès la décision du ministère, au statut
`en_attente_ancrage` : **juridiquement il est délivré, seule sa preuve publique
reste à publier**. Un worker consomme la file au rythme du réseau et fait
passer le diplôme à `actif` une fois la transaction confirmée.

La file porte : idempotence par clé unique en base, réservation en
`FOR UPDATE SKIP LOCKED` — plusieurs workers peuvent consommer sans se marcher
dessus —, report exponentiel plafonné à une heure, et file d'abandon après
épuisement des tentatives.

### Conséquences

**Positives**

- Une certification de 12 000 diplômés répond en quelques secondes ; l'ancrage se poursuit en arrière-plan avec un indicateur de progression.
- Une panne du nœud RPC ne perd rien : les tâches restent en file et repartent.
- L'idempotence est portée par la base, pas par le worker : deux demandes du même ancrage ne créent qu'une tâche, quelle que soit la source de l'appel.
- Un dossier fautif n'interrompt pas les 249 autres.

**Négatives**

- **Un diplôme peut exister sans preuve publique pendant un temps.** La vérification publique répond alors `en_attente_ancrage` avec une explication, plutôt que d'annoncer « authentique » sans pouvoir l'étayer. C'est moins confortable, mais honnête.
- Le système gagne une pièce mobile de plus, qui doit être supervisée : taille de file, taux d'échec, tâches abandonnées.
- Une tâche abandonnée laisse un diplôme sans ancrage : elle exige une reprise manuelle, tracée et notifiée à l'administrateur.

---

<a id="adr-008"></a>
## ADR-008 — Polygon plutôt qu'Ethereum, Hyperledger Fabric ou Indy

**Statut** : Acceptée avec réserve — 2 août 2026

### Contexte

Quatre familles de solutions étaient envisageables pour l'ancrage.

| Solution | Nature | Coût par écriture | Vérifiable par un tiers ? |
|---|---|---|---|
| Ethereum L1 | publique | élevé, volatil | oui |
| **Polygon** | publique, L2 | très faible | oui |
| Hyperledger Fabric | permissionnée | nul | **non, sans accès au réseau** |
| Hyperledger Indy | permissionnée, identité | nul | partiellement |

### Décision

**Polygon**, avec le testnet Amoy pour le MVP et une bascule mainnet prévue.

### Conséquences

**Positives**

- **Une chaîne permissionnée annulerait l'intérêt du dispositif.** Si le ministère contrôle les nœuds, un vérificateur étranger doit à nouveau lui faire confiance : on retombe sur une base de données classique avec une couche de complexité en plus. La vérifiabilité par un tiers non-confiant exige une chaîne publique.
- Le coût mesuré est d'environ **0,0075 POL par opération**, soit un ordre de grandeur compatible avec un budget public.
- Compatibilité EVM : Solidity, Hardhat, Ethers.js — un écosystème mature et des compétences disponibles.
- Le contrat est déployé **et vérifié** sur Amoy, donc son code est publiquement auditable.

**Négatives et réserves**

- **Dépendance à un réseau tiers** que l'État ne contrôle pas. Un incident majeur sur Polygon affecterait la publication des preuves — pas leur validité passée.
- **Volatilité du POL** : le coût en monnaie locale n'est pas prévisible sur plusieurs années.
- L'endpoint RPC historique `rpc-amoy.polygon.technology` ne résout plus ; la plateforme utilise `polygon-amoy-bor-rpc.publicnode.com` avec un secours. Cette fragilité des points d'accès publics est réelle et doit être supervisée.
- Le passage en mainnet reste à faire : le coût y sera réel, ce qui rend l'optimisation par arbre de Merkle (chapitre 34) plus qu'un exercice théorique.

---

<a id="adr-009"></a>
## ADR-009 — OTP par téléphone plutôt que mot de passe

**Statut** : Acceptée — 2 août 2026

### Contexte

Les utilisateurs sont des agents administratifs et des diplômés, dont beaucoup
n'utilisent pas de gestionnaire de mots de passe. Un mot de passe classique
génère de l'oubli, du support, et des réutilisations dangereuses.

### Décision

**Authentification sans mot de passe : numéro de téléphone + code à usage
unique**, envoyé par WhatsApp (SMS en secours).

Le téléphone sert d'identifiant de connexion ; l'**UUID interne** sert
d'identité stable, parce qu'un numéro peut changer et qu'un identifiant ne le
doit pas.

### Conséquences

**Positives**

- Rien à mémoriser, donc pas de réinitialisation à gérer — le support s'effondre.
- Aucun mot de passe stocké, donc aucune base de mots de passe à fuiter.
- Le canal WhatsApp est déjà installé chez la quasi-totalité des utilisateurs togolais.

**Négatives**

- **Le téléphone devient le point de défaillance unique.** Un appareil volé donne accès au compte : c'est pourquoi le « second facteur » utile n'est pas un second appareil mais une **seconde personne** (ADR-015).
- Perdre son téléphone, c'est perdre son accès. D'où la procédure de récupération médiée par un agent (ERR-003), qui ne peut pas être automatique puisque c'est justement le canal de vérification qui a disparu.
- **Un code à six chiffres, c'est un million de possibilités** : sans plafond d'essais il tombe en quelques minutes. Cinq tentatives infructueuses brûlent le code.
- Dépendance à un tiers (Meta) pour le canal principal, avec ses conditions de validation de numéro et de gabarits de message.

---

<a id="adr-010"></a>
## ADR-010 — Services applicatifs découplés dans un monolithe modulaire

**Statut** : Acceptée — 2 août 2026

### Contexte

Le CDC envisage des micro-services (authentification, blockchain, PDF,
notifications). Le projet est mené par une personne, avec un délai contraint et
un hébergement modeste.

### Décision

**Un monolithe déployable, découpé en services applicatifs à frontière nette** :
`auth`, `session`, `blockchain`, `ancrage`, `hash`, `signature`, `pdf`, `qr`,
`notification`, `audit`, `permissions`, `controle`, `import`.

Chaque service expose une interface explicite et ne connaît pas les couches
supérieures. L'architecture reste **Route → Middleware → Controller → Service →
Model → SQL**.

### Conséquences

**Positives**

- Un seul déploiement, une seule base, aucune orchestration : compatible avec les moyens réels du projet.
- Les frontières sont déjà tracées : extraire `notification` ou `ancrage` en service autonome ne demanderait pas de réécriture, seulement un transport.
- Les transactions restent locales — un point non négligeable : la certification écrit diplôme, transaction blockchain, statut de dossier, journal d'audit et activation de compte **dans une seule transaction SQL**. En micro-services, il faudrait une saga.

**Négatives**

- Une montée en charge impose de dupliquer tout le monolithe, pas seulement la partie sollicitée.
- Rien n'empêche techniquement un service d'en appeler un autre à contresens : la discipline repose sur la revue, pas sur la compilation.
- La limitation de débit est en mémoire, donc par processus : plusieurs instances compteraient chacune de leur côté. Documenté comme dette explicite.

### Critères d'extraction ultérieure

Un service mérite d'être extrait quand il remplit au moins deux conditions :
il a un profil de charge différent du reste, il a besoin d'être déployé à un
autre rythme, ou il devient un point de contention mesuré. `ancrage` est le
premier candidat : son rythme est celui de la blockchain, pas celui du web.

---

<a id="adr-011"></a>
## ADR-011 — Back-office et front-office séparés

**Statut** : Acceptée — 2 août 2026

### Contexte

La plateforme sert deux publics sans recouvrement : des agents authentifiés qui
produisent des diplômes, et des vérificateurs anonymes qui en contrôlent un.

### Décision

**Deux applications front distinctes** : un back-office privé (quatre rôles,
authentification OTP) et un front-office public de vérification, sans compte.

### Conséquences

**Positives**

- **Surface d'attaque réduite** : l'application publique ne contient aucun code d'administration, aucune route privée, aucun formulaire de connexion à forcer.
- Le poids et le temps de chargement du front public restent minimes, ce qui compte pour un usage mobile en connexion faible.
- Les deux applications évoluent à des rythmes différents sans se gêner.

**Négatives**

- Deux projets à construire, tester et déployer, avec une part de duplication (design system, appels HTTP).
- Un correctif d'interface transverse doit être appliqué deux fois.

---

<a id="adr-012"></a>
## ADR-012 — Stockage hybride : PostgreSQL pour les données, blockchain pour la preuve

**Statut** : Acceptée — 2 août 2026

### Contexte

C'est la décision qui structure tout le système, et celle que le jury
interrogera en premier : pourquoi ne pas tout mettre dans l'une ou l'autre ?

### Décision

Répartition stricte des rôles :

| | PostgreSQL | Blockchain |
|---|---|---|
| Identité, notes, mention, filière | ✅ | ❌ |
| PDF, QR, pièces | ✅ | ❌ |
| Historique, journal d'audit | ✅ | ❌ |
| **Empreinte SHA-256** | copie | **référence** |
| **Signature du ministère** | copie | **référence** |
| **Horodatage, statut valide/révoqué** | copie | **référence** |

**PostgreSQL détient les données. La blockchain détient la preuve qu'elles
n'ont pas changé.**

### Conséquences

**Positives**

- Chaque technologie fait ce qu'elle sait faire : requêtes riches et mutables d'un côté, immuabilité vérifiable de l'autre.
- Une modification frauduleuse en base est **détectable** : l'empreinte recalculée ne correspondrait plus à celle ancrée. C'est précisément ce qu'une base seule ne peut pas garantir, puisque l'administrateur peut tout réécrire.
- Le coût blockchain reste indépendant du volume de données.

**Négatives**

- **Deux sources de vérité à réconcilier.** Le système doit gérer les divergences : diplôme en base mais pas encore ancré, transaction confirmée mais base non mise à jour. C'est le rôle de la file d'ancrage et de la lecture on-chain à la vérification.
- La cohérence n'est pas garantie par une transaction unique : l'écriture SQL et l'écriture blockchain ne peuvent pas être atomiques ensemble. L'ordre choisi — ancrer d'abord, écrire ensuite en certification unitaire ; écrire d'abord, ancrer ensuite en masse — est un compromis assumé, documenté au chapitre 33.
- Les données de démonstration ancrées en mode `mock` ne sont pas sur la chaîne : la vérification publique le signale honnêtement plutôt que de le masquer.

---

# Décisions prises en cours de construction

> Ces quatre ADR ne figuraient pas dans le cadrage initial. Elles ont été
> imposées par des problèmes rencontrés en construisant le système, et elles
> sont au moins aussi structurantes que les précédentes.

---

<a id="adr-013"></a>
## ADR-013 — Une API d'intégration plutôt qu'une double saisie

**Statut** : Proposée — non implémentée

### Contexte

Les établissements déjà informatisés — l'Université de Lomé notamment —
disposent d'un système de scolarité. Leur demander de ressaisir 12 000
diplômés dans CertifTOGO est irréaliste et générera des erreurs.

### Décision

Exposer une **API d'intégration** authentifiée par clé, permettant à un système
tiers de déposer une promotion. Le format est celui de l'import : mêmes
contrôles, même rapport d'erreurs.

### Conséquences

**Positives** : suppression de la double saisie ; adoption facilitée par les
gros établissements ; les contrôles restent centralisés côté ministère.

**Négatives** : nouvelle surface d'authentification à sécuriser (clés, quotas,
révocation) ; versionnement de l'API devient obligatoire, puisque des systèmes
tiers en dépendront ; support technique auprès d'équipes externes.

**Décision reportée** : l'import Excel couvre le besoin immédiat et fonctionne
pour tous les établissements, informatisés ou non. L'API est un confort pour
une minorité, à traiter après la mise en service.

---

<a id="adr-014"></a>
## ADR-014 — L'identité nationale est séparée des fiches établissement

**Statut** : Acceptée — 2 août 2026

### Contexte

Le schéma initial rattachait le compte de connexion à **une** fiche
`candidats`, elle-même propre à un établissement. Un diplômé de deux
établissements — licence à l'IAI, master à l'Université de Lomé — produit deux
fiches. Son téléphone étant unique, il ne pouvait posséder qu'un seul compte :
la création du second échouait, et son portefeuille n'aurait jamais montré plus
de la moitié de ses diplômes.

Le portefeuille national annoncé était donc **structurellement impossible**.

### Décision

Introduction de la table `personnes` :

```
personnes ──< candidats ──< dossiers ──< diplomes
    ↑
utilisateurs (compte de connexion)
```

La **personne** porte l'identité, le compte et le portefeuille. La **fiche
candidat** porte l'inscription dans un établissement donné. Une personne en a
autant que d'établissements fréquentés.

### Conséquences

**Positives**

- Le portefeuille agrège les diplômes de tous les établissements — un test de bout en bout le prouve : deux fiches, deux certifications, un seul portefeuille.
- Un changement de nom s'applique à la personne, donc à toutes ses inscriptions : un mariage concerne l'individu, pas une scolarité.
- Le parcours pluriannuel devient représentable via `inscriptions`.

**Négatives**

- **Le rapprochement repose sur le téléphone.** Deux fiches saisies avec des numéros différents restent deux personnes distinctes. C'est ce qui a imposé la canonisation des numéros (`90 00 00 12` → `+22890000012`) : sans elle, le portefeuille national se fragmente silencieusement.
- Une fiche sans numéro devient une personne à part entière, potentiellement doublon. Un rapprochement manuel restera nécessaire.
- Migration de données réelles à opérer, avec regroupement par téléphone.

---

<a id="adr-015"></a>
## ADR-015 — Le second facteur est une seconde personne, pas un second appareil

**Statut** : Acceptée — table posée, activation à brancher

### Contexte

Le CDC demande un second facteur pour les rôles sensibles. Or **toute
l'authentification repose déjà sur le téléphone** : ajouter un second facteur
sur le même appareil ne protège de rien. Si l'appareil est volé, les deux
facteurs le sont ensemble.

### Décision

Pour les actions critiques — révocation d'un diplôme, certification de masse,
rotation de clés — le second facteur est un **contrôle à quatre yeux** : un
second agent doit approuver. La contrainte est portée par la base :

```sql
CONSTRAINT chk_quatre_yeux CHECK (approbateur_id IS NULL OR approbateur_id <> demandeur_id)
```

### Conséquences

**Positives** : protège contre l'appareil volé *et* contre l'agent malveillant,
ce qu'un second facteur technique ne fait pas ; la contrainte est structurelle,
pas déclarative.

**Négatives** : ralentit les opérations critiques ; exige au moins deux agents
disponibles — problématique dans un petit service ; nécessite une procédure de
contournement documentée en cas d'urgence.

**État** : la table `validations_critiques` et sa contrainte existent.
L'activation sur la révocation et la certification de masse reste à brancher.

---

<a id="adr-016"></a>
## ADR-016 — Mode simple par défaut, hiérarchie interne en option

**Statut** : Acceptée — 2 août 2026

### Contexte

Le CDC décrit une hiérarchie interne à l'établissement : agent de saisie, chef
de scolarité, directeur. Cette organisation correspond à une grande université.
Elle ne correspond pas à un institut où **une seule personne** tient la
scolarité — et lui imposer trois validations successives la bloquerait purement
et simplement.

### Décision

`etablissements.mode_workflow` prend deux valeurs :

- **`simple`** (défaut) — tous les agents disposent de toutes les permissions ; la promotion va directement de `ouverte` à `transmise` ;
- **`hierarchique`** — l'agent de saisie produit, le chef de scolarité contrôle et arrête les résultats, seul le directeur transmet. Le parcours devient `ouverte → controle_interne → validee_interne → transmise`.

Le basculement est réservé à l'agent principal : c'est une décision
d'organisation, pas un réglage technique.

### Conséquences

**Positives**

- La plateforme s'adapte à l'établissement plutôt que l'inverse — condition d'adoption réelle.
- Le défaut est le comportement le plus permissif, donc aucun établissement n'est bloqué à la mise en service.
- Un choix de conception heureux : le mode simple étant le comportement historique, l'introduction de la hiérarchie n'a cassé aucun des tests existants.

**Négatives**

- **Deux chemins à tester et à maintenir**, donc deux fois plus de cas de figure.
- Le mode simple offre moins de garanties : dans un établissement d'une personne, il n'y a de toute façon pas de séparation des tâches possible. C'est un constat, pas une faiblesse du logiciel.
- La matrice de permissions vit dans le code (`permissions.service.js`) ; les tables SQL n'en sont que le reflet consultable. Un écart entre les deux serait invisible sans vigilance.

---

## Récapitulatif

| ADR | Décision | Statut |
|---|---|---|
| [001](#adr-001) | PostgreSQL centralisée | Acceptée |
| [002](#adr-002) | Pas d'inscription libre | Acceptée |
| [003](#adr-003) | Le ministère agrée les établissements | Acceptée |
| [004](#adr-004) | Transmission par lot, décision par dossier | Acceptée |
| [005](#adr-005) | QR = URL de vérification | Acceptée |
| [006](#adr-006) | Blockchain = empreinte seule | Acceptée |
| [007](#adr-007) | File d'attente d'ancrage | Acceptée |
| [008](#adr-008) | Polygon | Acceptée avec réserve |
| [009](#adr-009) | OTP téléphone | Acceptée |
| [010](#adr-010) | Monolithe modulaire | Acceptée |
| [011](#adr-011) | Back-office / front-office séparés | Acceptée |
| [012](#adr-012) | Stockage hybride | Acceptée |
| [013](#adr-013) | API d'intégration | Proposée |
| [014](#adr-014) | Identité nationale séparée des fiches | Acceptée |
| [015](#adr-015) | Quatre yeux plutôt que second appareil | Acceptée, à brancher |
| [016](#adr-016) | Mode simple par défaut | Acceptée |
