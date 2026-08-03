# Parties II et III — Domaines métier et cœur de la certification

> Chapitres 8 à 19. Ces chapitres décrivent les processus. Les décisions qui
> les gouvernent sont dans les [ADR](35-decisions-architecture.md), le schéma
> dans le [chapitre 24](24-modele-donnees.md) : ils ne sont pas répétés ici.

---

# 8. Gestion des établissements

## 8.1 Agrément par le ministère

Voir [ADR-003](35-decisions-architecture.md#adr-003). L'agrément crée **d'un
seul geste, dans une transaction** : l'établissement, son code officiel, ses
habilitations et son agent principal.

**BR-110** — Un établissement sans agent principal ne peut pas exister :
personne ne pourrait s'y connecter. L'atomicité est structurelle, pas
optionnelle.

**BR-111** — Au moins un type de diplôme doit être habilité à l'agrément.
Un établissement habilité pour rien ne peut rien transmettre.

## 8.2 Demande d'intégration

`POST /api/demandes-integration` — **public**, car un établissement candidat n'a
par définition pas de compte.

```
soumise ──► en_examen ──► acceptee (établissement créé)
                     └──► refusee (motif obligatoire)
```

**FR-110** — Le dépôt d'une demande ne crée **aucun accès**. Seul le ministère
transforme une demande en établissement.

**FR-111** — Le suivi public par référence expose le statut et le motif de
refus, rien d'autre. Ni email, ni téléphone, ni contenu de l'instruction.

**BR-112** — `CHECK (statut <> 'refusee' OR motif_refus IS NOT NULL)` : un refus
sans motif est impossible au niveau de la base.

## 8.3 Code établissement

`IAI001`, `ENA001`, `UL001` — initiales des mots significatifs du nom, accents
retirés, suivies d'un compteur.

**Le code identifie l'institution ; les comptes portent la connexion.** Ce n'est
pas « l'Université de Lomé » qui se connecte, c'est un agent nommé qui y
travaille — ce qui rend la traçabilité nominative possible.

## 8.4 Structure interne

`etablissements → facultes → filieres`. La **durée** d'une filière borne le
niveau des promotions : une L4 dans une licence de trois ans traduit une erreur
de saisie, refusée par `NIVEAU_HORS_CURSUS`.

## 8.5 Suspension et fermeture (ERR-005)

| Effet | Comportement |
|---|---|
| Transmissions | **gelées** — `ETABLISSEMENT_SUSPENDU` |
| Travail interne | poursuivi (saisie, promotions, résultats) |
| Dossiers en cours | conservés, consultables |
| **Diplômes déjà certifiés** | **restent valides** |
| Agents | notifiés |

**BR-113** — La suspension vise l'avenir, pas le passé. Invalider les diplômes
déjà délivrés punirait les diplômés d'une faute de leur établissement.

---

# 9. Gestion des agents

## 9.1 Rattachement

Un agent est un `utilisateur` de rôle `etablissement` ou `ministere`, rattaché à
son entité. Le rattachement est vérifié par contrainte
(`chk_role_rattachement`).

## 9.2 Hiérarchie interne

Voir [ADR-016](35-decisions-architecture.md#adr-016).

### 9.2.1 à 9.2.3 — Les trois sous-rôles

| Sous-rôle | Produit | Contrôle | Engage l'établissement |
|---|:---:|:---:|:---:|
| **Agent de saisie** | ✅ | — | — |
| **Chef de scolarité** | ✅ | ✅ | — |
| **Directeur** | ✅ | ✅ | ✅ |

### 9.2.4 — Workflow interne

```
mode simple        : brouillon ──► ouverte ─────────────────► transmise
mode hierarchique  : brouillon ──► ouverte ──► controle_interne
                                            ──► validee_interne ──► transmise
```

**FR-120** — En mode hiérarchique, une promotion seulement « ouverte » est
refusée à la transmission, avec un message qui dit quoi faire.

### 9.2.5 — Matrice permissions × sous-rôles

| Permission | Saisie | Scolarité | Directeur |
|---|:---:|:---:|:---:|
| `candidat.creer` / `candidat.modifier` | ✅ | ✅ | ✅ |
| `candidat.supprimer` | — | ✅ | ✅ |
| `structure.gerer` | — | ✅ | ✅ |
| `promotion.creer` / `modifier` / `inscrire` / `importer` | ✅ | ✅ | ✅ |
| `promotion.supprimer` | — | ✅ | ✅ |
| `promotion.resultat` | — | ✅ | ✅ |
| `promotion.controler` / `valider_interne` | — | ✅ | ✅ |
| **`promotion.transmettre`** | — | — | **✅** |
| `agent.creer` | — | — | ✅ |

### 9.2.6 — Mode simple

**BR-114** — En mode `simple`, tout agent dispose de toutes les permissions.
Imposer trois validations successives à une scolarité d'une seule personne la
bloquerait.

`GET /api/structure/profil` renvoie sous-rôle, mode et permissions effectives :
**l'interface masque ce qui est interdit** plutôt que de laisser l'agent
découvrir l'interdiction par un 403.

## 9.3 Agents du ministère

Créés par l'administrateur système. Pas de sous-rôles : la séparation des
fonctions au ministère passe par le **contrôle à quatre yeux**
([ADR-015](35-decisions-architecture.md#adr-015)), pas par une hiérarchie.

## 9.4 Départ d'un agent (ERR-004)

`POST /api/agents/transfert`

**BR-115** — Désactiver sans transférer laisserait des dossiers au nom de
quelqu'un qui ne travaille plus là. Le transfert déplace les dossiers **en
cours** ; les dossiers certifiés gardent leur auteur d'origine — c'est une
trace historique, pas une affectation.

**BR-116** — Les sessions de l'agent sont révoquées **immédiatement**.

---

# 10. Gestion des promotions

## 10.1 à 10.2 — Définition et référentiel

Promotion = (filière, niveau, année académique), unique par ce triplet.
Le référentiel national — années et sessions — est tenu par le ministère ;
les établissements le lisent.

**BR-120** — Une seule année académique ouverte à la fois (index unique
partiel).

**BR-121** — Une seule session `normale` et une seule `rattrapage` par année ;
les sessions `exceptionnelle` ne sont pas limitées.

**BR-122** — La session d'une promotion doit appartenir à l'année de cette
promotion (clé étrangère composite, migration 003).

## 10.3 Cycle de vie

```
brouillon ──► ouverte ──► [controle_interne ──► validee_interne] ──► transmise
                                                                  ──► certifiee ──► cloturee
```

Le statut `transmise` **n'est pas atteignable** par un simple changement
d'état : la transmission a son propre point d'entrée, car elle crée un lot et
des dossiers. Une promotion transmise sans lot serait invisible du ministère.

## 10.4 Transmission par promotion

Voir [ADR-004](35-decisions-architecture.md#adr-004).

## 10.5 Import Excel

`POST /api/promotions/:id/import` — `?simulation=true` analyse sans écrire.
`GET /api/promotions/modele-import` fournit le gabarit, consignes incluses.

**Colonnes** : `matricule`, `nom`, `prenom` obligatoires ; `telephone`, `email`,
`date_naissance`, `lieu_naissance`, `sexe`, `moyenne`, `mention` facultatifs.

**En-têtes tolérants** : la comparaison se fait sur une forme sans accent ni
ponctuation — `N° Étudiant`, `MATRICULE` et `numero etudiant` désignent la même
colonne.

**Contrôles par ligne**, chacun rattaché au **numéro de ligne du fichier** pour
être corrigeable directement dans Excel : champs requis, matricule en double
dans le fichier, matricule déjà pris dans l'établissement, téléphone invalide ou
dupliqué, email, date, sexe, moyenne hors barème, mention inconnue.

**BR-123** — L'import est **strict** : une seule ligne en erreur annule tout,
dans une transaction unique. Une promotion à moitié importée serait ingérable —
l'établissement corrige son fichier et relance.

**BR-124** — Une mention vaut délibération : la ligne est inscrite en `admis`.
Sans mention, l'étudiant est simplement `inscrit`.

**BR-125** — Les numéros sont canonisés avant tout contrôle (`90 00 00 12` →
`+22890000012`). Sans cela, le même diplômé saisi en forme locale par un
établissement et en forme internationale par un autre produirait **deux
personnes distinctes**.

## 10.6 Effectifs

`effectif_prevu` déclaré, `effectif_inscrit` calculé. Un écart entre les deux au
moment de la transmission est signalé comme **anomalie**, pas comme erreur.

---

# 11. Gestion des étudiants

## 11.1 à 11.3 — Fiche et création

Voir [ADR-002](35-decisions-architecture.md#adr-002) : le candidat ne s'inscrit
pas lui-même.

**Terminologie** : `candidat` en base et dans l'API — le renommer aurait touché
le rôle SQL, trois modules et des dizaines de composants pour un gain
cosmétique. « Étudiant » à l'écran.

## 11.4 à 11.5 — Identité nationale et parcours

Voir [ADR-014](35-decisions-architecture.md#adr-014).

**FR-130** — Le portefeuille agrège les diplômes de **tous** les établissements
fréquentés.

**FR-131** — Le parcours pluriannuel est consultable :
`GET /api/promotions/parcours/:candidatId` restitue les inscriptions ordonnées
par année puis niveau.

## 11.6 Changement de nom (ERR-001)

**BR-126** — Un changement de nom s'applique à la **personne**, donc à toutes
ses fiches : un mariage concerne l'individu, pas une scolarité.

Il produit une **nouvelle version du diplôme** — voir chapitre 13.5.

---

# 12. Workflow de certification

## 12.1 Machine à états du dossier

```
brouillon ──► soumis ──► en_examen ──► valide ──► certifie
                    └──────────────► rejete ──► (correction, retransmission)
```

Chaque transition est enregistrée dans `historique_statuts_dossier` avec son
auteur, son motif et son lot — **la pièce la plus consultée en cas de litige**.

## 12.2 Instruction

L'instruction porte sur le **lot** ; la décision sur le **dossier**.

**Contrôles automatiques de niveau 1**, en deux natures qu'il ne faut pas
confondre :

| Nature | Signification | Effet |
|---|---|---|
| **Bloquant** | le dossier est objectivement invalide | rejeté d'office, avec le détail comme motif |
| **Anomalie** | rien n'est faux, la statistique est suspecte | signalé à l'agent, aucune conséquence automatique |

**Bloquants** : champs obligatoires, matricule manquant ou en double,
téléphone invalide, dates incohérentes, âge invraisemblable, **établissement non
habilité** pour ce type de diplôme, diplôme identique déjà délivré, type
incohérent avec la filière.

**Anomalies** : effectif divergent, mention quasi uniforme (≥ 90 %), naissances
toutes la même année, étudiants sans téléphone.

**BR-130** — *La machine ne décide jamais : elle instruit, l'agent tranche.*

## 12.3 Certification

Opération atomique : diplôme + transaction blockchain + statut du dossier +
activation du compte + historique + journal, **dans une seule transaction SQL**.

## 12.4 Révocation

Motif obligatoire. Soumise au contrôle à quatre yeux si `DOUBLE_VALIDATION`.

## 12.5 Historique des statuts

Table dédiée (`historique_statuts_dossier`), interrogeable par
`GET /api/journal/dossiers/:id`.

## 12.6 Certification de masse

Voir [chapitre 33](33-performances-asynchrone.md).

## 12.7 Double certification (ERR-008)

**BR-131** — Un dossier déjà certifié ne peut pas l'être une seconde fois :
`DEJA_CERTIFIE` (409). Vérifié avant toute écriture.

---

# 13. Génération du diplôme

## 13.1 Hash canonique

L'empreinte SHA-256 porte sur un **snapshot figé** des données au moment de la
certification, sérialisé de manière canonique. Le snapshot est conservé dans
`diplomes.donnees_signees`.

**NFR-130** — Le calcul du hash doit être **reproductible** : les mêmes données
produisent toujours la même empreinte, indépendamment de l'ordre des clés.

## 13.2 Signature

HMAC-SHA256 avec la clé du ministère. Voir
[ch. 36.1](36-argumentaire-jury.md) pour la gouvernance de cette clé.

## 13.3 à 13.4 — PDF et QR

Générés côté serveur (PDFKit, qrcode), stockés dans `uploads/`, servis en
statique. Le QR porte l'**URL de vérification**
([ADR-005](35-decisions-architecture.md#adr-005)).

## 13.5 Versionnement

```
v1 (remplace) ──► v2 (actif)
       │                │
   hash A           hash B
```

**BR-132** — On ne modifie **jamais** un diplôme certifié : le hash ancré ne
correspondrait plus. On émet une nouvelle version.

**BR-133** — Le snapshot de la v2 porte son numéro de version et la référence
remplacée : deux versions ne peuvent donc jamais produire le même hash.

## 13.6 Révocation et réémission (ERR-002)

`POST /api/ministere/diplomes/:id/corriger` — types : `changement_nom`,
`erreur_donnees`, `autre`. Motif obligatoire.

Côté chaîne : **révocation de l'ancien hash + certification du nouveau**, deux
transactions. Le lien entre versions vit hors chaîne dans
`corrections_diplome`.

---

# 14. Portefeuille du diplômé

## 14.1 à 14.2 — Consultation et partage

`GET /api/candidat/diplomes` — tous les diplômes de la **personne**, tous
établissements confondus, avec PDF, QR et lien de vérification publique.

## 14.3 Pendant l'ancrage

Le diplôme est **visible et téléchargeable** dès la certification, avec son
statut réel (`en_attente_ancrage`) — voir
[ch. 33.5.2](33-performances-asynchrone.md).

## 14.4 Alerte de consultation

`GET /api/tableau-bord` (rôle candidat) indique combien de fois chaque diplôme a
été vérifié. **C'est le seul moyen, pour un diplômé, de repérer un usage qu'il
n'a pas autorisé.**

🔨 La notification à chaque consultation est modélisée (`qr_consulte`) mais son
déclencheur n'est pas branché.

---

# 15. Vérification publique

## 15.1 Recherche

`GET /api/verification/:code` — accepte une **empreinte SHA-256** (64 hex) ou
une **référence** `DIP-AAAA-XXXXX`. Aucun compte requis.

## 15.2 Vue publique

Exposé : référence, titulaire, type, mention, filière, établissement, date,
empreinte, transaction, version, état d'ancrage on-chain.

**Jamais exposé** : signature, snapshot complet, notes, contacts, identifiants
internes.

## 15.3 Journalisation

Chaque vérification est enregistrée (`verifications_log`) : méthode, IP,
user-agent, résultat. Alimente les statistiques et, à terme, l'alerte au
diplômé.

## 15.4 à 15.5 — Résultats

| Résultat | Signification |
|---|---|
| `authentique` | diplôme valide et ancré |
| `en_attente_ancrage` | délivré, preuve publique en cours de publication |
| `revoque` | retiré à son titulaire, avec motif |
| `remplace` | **remplacé par une version corrigée** — référence de la version en vigueur fournie |
| `introuvable` | aucune correspondance |

**FR-140** — Un vérificateur qui scanne un ancien PDF est **renvoyé vers la
version en vigueur**, plutôt que de rester avec un document périmé ou d'être
alerté d'une fraude inexistante.

## 15.6 Limitation de débit

60 vérifications par minute et par IP, pour borner l'énumération massive sans
gêner un usage normal.

---

# 16. Blockchain

## 16.1 Rôle

Voir [ADR-006](35-decisions-architecture.md#adr-006) et
[ADR-012](35-decisions-architecture.md#adr-012).

## 16.2 Modes

| Mode | Comportement |
|---|---|
| `mock` | empreintes déterministes, aucun appel réseau — défaut |
| `onchain` | Ethers v6 vers `RegistreDiplomes` |

Le mode `mock` n'est pas un contournement : il permet de tester toute la chaîne
métier sans dépendre d'un réseau, ce qui rend les 186 tests exécutables
n'importe où.

## 16.3 Déploiement

| | |
|---|---|
| Adresse | `0x42d2e5EE482c365E5b4737C2d476D127732495F6` |
| Réseau | Polygon Amoy (chainId 80002) |
| Vérifié | oui, code auditable sur Polygonscan |
| RPC | `polygon-amoy-bor-rpc.publicnode.com` (l'endpoint historique ne résout plus) |

## 16.4 Réconciliation

La vérification publique lit l'état **on-chain** en plus de la base et renvoie
`ancrage_blockchain`. Si le nœud est injoignable, la vérification aboutit quand
même avec `{ verifie: false, indisponible: true }` — on ne bloque pas sur un
tiers.

## 16.5 Échec de transaction (ERR-007)

Voir [ch. 33.3.5](33-performances-asynchrone.md).

## 16.6 Données mixtes

⚠️ Les diplômes issus de `seed:demo` ont été ancrés en mode `mock` : leurs
empreintes **ne sont pas** sur le contrat. La vérification publique le signale
(`ancre: false`) plutôt que de le masquer. Six diplômes vitrine sont réellement
ancrés, dont un révoqué.

---

# 17. Smart contract

## 17.1 Interface

```solidity
function certifier(bytes32 hash, string reference) external onlyAutorise
function revoquer(bytes32 hash, string motif) external onlyAutorise
function verifier(bytes32 hash) external view returns (bool existe, bool valide, ...)
function autoriser(address compte) external onlyOwner
```

Le constructeur autorise le déployeur : le backend signe avec la même clé,
aucun appel d'autorisation supplémentaire.

## 17.2 à 17.3 — Stockage et événements

Stocké on-chain : empreinte, référence, horodatage, statut, motif de révocation.
**Aucune donnée personnelle.** Événements émis à chaque certification et
révocation.

## 17.4 Tests

16 tests Hardhat : certification, révocation, contrôle d'accès, double
certification, lecture.

## 17.5 Limite connue

**Le contrat ignore la notion de remplacement.** Un remplacement s'y traduit par
révocation + certification, et le lien entre versions vit hors chaîne.

## 17.6 Évolution

Faire évoluer le contrat impose un redéploiement : l'adresse actuelle et sa
vérification deviendraient obsolètes, et les diplômes déjà ancrés resteraient
sur l'ancien contrat — il faudrait interroger les deux. C'est ce qui rend
l'ajout de `certifierLot` (ch. 34.3) plus coûteux qu'il n'y paraît.

---

# 18. QR code

Voir [ADR-005](35-decisions-architecture.md#adr-005).

Le QR pointe vers `/verifier/<empreinte>` du front-office public. Deux formes
générées : fichier PNG dans `uploads/` pour le PDF, et data-URL pour l'affichage.

**Limite assumée** : un QR peut être imité visuellement pour pointer vers un
site ressemblant. La parade est la communication du domaine officiel, et à terme
une application de vérification.

---

# 19. Gestion des comptes

## 19.1 Création

Voir [ADR-002](35-decisions-architecture.md#adr-002). Cohérence rôle ↔
rattachement garantie par contrainte.

## 19.2 Désactivation

**BR-140** — Désactiver un compte **révoque toutes ses sessions** : sans cela,
l'agent qui vient de partir resterait connecté jusqu'à expiration de son jeton.

**BR-141** — Un compte fermé ne reçoit plus d'OTP — mais la réponse reste
identique à celle d'un compte actif, pour ne pas révéler son existence.
