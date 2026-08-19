# 26.4 — Description écran par écran

Trente-deux écrans : vingt-huit dans le back-office, quatre dans le front
public, plus la page de connexion commune. Chacun est décrit par sa
**composition**, ses **actions**, son **état vide** et ses **états d'erreur**.

Ce chapitre est écrit *depuis* les écrans livrés, non avant eux : les libellés
cités sont ceux du code. Il vaut donc aussi comme inventaire de ce qui existe.

> **Une convention traverse les trente-deux.** Un état vide n'annonce jamais
> seulement l'absence : il dit *pourquoi* c'est vide et *ce qu'il faut faire*.
> « Aucun dossier » seul laisse l'agent se demander s'il a mal filtré ou si le
> système est en panne. La distinction structurante est celle entre **vide
> normal** (« Aucune suppression en attente. C'est le cas normal. ») et **vide
> anormal**, qui appelle une action.

---

## 26.4.1 — Écran commun

### Connexion (`/login`)

**Composition.** Deux étapes sur un seul écran : saisie du numéro de téléphone,
puis saisie du code à six chiffres. Aucune sélection de rôle — le rôle découle
du compte, pas d'un choix de l'utilisateur.

**Actions.** Demander un code · Saisir le code · Renvoyer un code (compteur de
temporisation) · Revenir au numéro.

**État vide.** Sans objet : l'écran est un formulaire.

**États d'erreur.**
- Numéro inconnu ou compte désactivé → **message identique** au succès. Un 404
  permettrait d'énumérer les comptes de la plateforme, donc de savoir qui
  travaille au ministère.
- Code faux → décompte des tentatives restantes ; au plafond, le code est brûlé
  et il faut en redemander un.
- Compte fermé → `COMPTE_INACTIF`, explicite : un compte candidat naît fermé et
  la certification l'ouvre.
- Envoi impossible → `ENVOI_OTP_ECHEC` ; le code stocké est invalidé plutôt que
  laissé actif sans que personne l'ait reçu.

**Encart conditionnel.** « Environnement de développement » — affiche le code et
propose « Utiliser ce code ». Visible uniquement si aucun envoi réel n'a eu lieu
(voir 26.4.5).

---

## 26.4.2 — Espace établissement (7 écrans)

### Tableau de bord

**Composition.** Transmissions (promotions transmises / en attente / rejetées),
délai moyen de certification, motifs de rejet agrégés.

**États vides.** « Aucune promotion » · « Aucun diplôme certifié pour l'instant »
· « Aucun dossier rejeté » — ce dernier est un **vide normal**, et le dit.

**Erreurs.** Statistiques indisponibles : les compteurs se dégradent
individuellement, le reste de l'écran reste lisible.

### Structure

**Composition.** Deux sections successives — Facultés, puis Filières
(rattachées à une faculté, avec type de diplôme et durée du cursus).

**Actions.** Créer, modifier, désactiver une faculté ou une filière.

**États vides.** « Aucune faculté » précède « Aucune filière » : l'ordre du
travail est imposé par la hiérarchie, on ne crée pas une filière hors faculté.

**Erreurs.** Type de diplôme non habilité pour l'établissement · durée
incohérente avec le niveau.

### Promotions

**Composition.** Liste des promotions avec leur statut
(`brouillon → ouverte → transmise → certifiee → cloturee`), leurs inscriptions,
la saisie des résultats et la **grille des pièces**.

**Actions.** Créer une promotion · Inscrire un étudiant · Importer une promotion
depuis Excel (avec simulation préalable) · Saisir les résultats · Déposer les
pièces · Vérifier l'aptitude à transmettre · Transmettre.

**États vides — trois, et ils ne disent pas la même chose.**
- « Aucune promotion » : rien n'a encore été créé.
- « Aucune année académique ouverte » : **blocage amont**, le ministère n'a pas
  ouvert d'année ; le bouton de création reste inerte tant que c'est le cas.
- « Aucune filière active » : blocage amont interne, à régler dans Structure.

> Ces deux derniers sont la raison d'être de la distinction. Un simple
> « Aucune promotion » aurait laissé l'agent cliquer sur un bouton grisé sans
> comprendre.

**Erreurs.**
- `PIECES_MANQUANTES` (409) — les étudiants concernés sont **nommés**, pas
  seulement dénombrés.
- `PIECES_COLLECTIVES_MANQUANTES` — procès-verbal absent.
- `MENTION_INCOHERENTE` (409) — la mention fournie contredit le barème ; refus
  plutôt qu'écrasement silencieux, car la divergence vient le plus souvent d'une
  moyenne fausse.
- Niveau supérieur à la durée du cursus · session appartenant à une autre année
  · promotion vide · promotion figée.

**Encart.** « Mode hiérarchique » — explique pourquoi certaines actions sont
réservées quand `mode_workflow = 'complet'`.

### Étudiants

**Composition.** Recherche, liste, fiche individuelle avec le parcours
pluriannuel (une inscription par année d'études).

**États vides.** « Aucun étudiant » (fichier vierge) et « Aucun étudiant ne
correspond à cette recherche » (filtre trop étroit) sont **deux écrans
différents** : le second propose d'effacer la recherche.

**Erreurs.** Téléphone au format invalide · doublon d'identité nationale.

### Dossiers

**Composition.** Les dossiers engendrés par les transmissions, avec leur statut
et leur historique.

**Actions.** Consulter · Corriger avant transmission · Déclarer une **voie
exceptionnelle** (encart dédié).

**État vide.** « Aucun dossier ».

### Lots transmis

**Composition.** Les lots émis, leur statut d'instruction côté ministère, et le
détail des dossiers rejetés avec leur motif.

**État vide.** « Aucun lot transmis ».

### Agents

**Composition.** Les comptes agissant au nom de l'établissement, leur sous-rôle
(agent de saisie, chef de scolarité, directeur), l'encart « Organisation du
travail » qui explique la matrice.

**Actions.** Créer un agent · Changer son sous-rôle · Le désactiver (ce qui
**révoque ses sessions** immédiatement) · Transférer ses dossiers en cours.

**État vide.** « Aucun agent ».

---

## 26.4.3 — Espace ministère (9 écrans)

### Tableau de bord

**Composition.** File d'instruction, diplômes certifiés, délai d'instruction,
top des établissements, coût blockchain cumulé, vérifications publiques.

**Bandeau d'alerte.** « Des lots attendent une décision » — remonte en tête
quand la file n'est pas vide.

**États vides.** « Aucun délai mesurable » · « Aucune certification » · « Aucun
établissement n'a encore transmis » : trois vides *normaux* en début de
campagne, formulés pour ne pas ressembler à une panne.

### Lots reçus

**Composition.** File par lot, filtrable par statut. À l'ouverture d'un lot : le
tableau de synthèse des contrôles automatiques, les dossiers, et les pièces.

**Actions.** Prendre en charge · Instruire les pièces · **Statuer par tranches**
(les dossiers non désignés restent en attente) · Rejeter partiellement avec
motif · Clôturer · **Faire passer un dossier devant les autres** (motif écrit
exigé).

**États vides.** « Aucun lot dans cette file » (file réellement vide) et « Aucun
lot ne correspond à ce filtre » (filtre) — encore une fois distingués.

**Erreurs et blocages.**
- « Actes collectifs à régler avant toute décision » : le procès-verbal manque
  ou a été rejeté ; **rien** ne peut être validé tant qu'il manque, car il fonde
  la promotion entière.
- « Instruction des pièces après prise en charge » : une pièce obligatoire n'a
  pas été ouverte. Non examinée n'est pas acceptée.

### Dossiers reçus

**Composition.** Vue dossier par dossier, tous établissements, filtrable.

**Actions.** Examiner · Valider · Rejeter (**motif requis**, modale dédiée) ·
Certifier un dossier validé.

**États vides.** « Aucun dossier » · « Aucun dossier ne correspond à ce filtre ».

### Diplômes

**Composition.** Les diplômes certifiés, leur état, l'accès au PDF et au QR, la
vérification de signature.

**Actions.** Révoquer (motif) · Corriger (émet une **nouvelle version**).

**Encarts d'avertissement, avant l'acte.**
- « Le diplôme est retiré à son titulaire » — avant révocation.
- « Une correction émet un nouveau diplôme » — avant correction. La distinction
  révoqué / remplacé est portée par l'interface, pas seulement par le modèle :
  confondre les deux ferait passer une mariée pour une fraudeuse.
- « Signature conforme » — résultat du recontrôle.

**État vide.** « Aucun diplôme ».

### File d'ancrage

**Composition.** État de la file, progression, coût mesuré, ancrages abandonnés
(dead letter).

**États vides.** « Aucun ancrage abandonné » (**vide normal**) · « Aucun coût
mesuré », qui explique de lui-même : en mode `mock`, aucune écriture réelle n'est
émise, donc aucun gaz n'est consommé.

**Actions.** Rejouer un ancrage abandonné.

### Validations (contrôle à quatre yeux)

**Composition.** Les actions critiques en attente d'un second accord.

**Actions.** Approuver · Refuser (modale « Refuser la demande », motif).

**États vides.** « Aucune action critique n'attend de second accord » · « Aucune
demande dans cet état ».

**Encart.** « Contrôle à quatre yeux désactivé » — l'écran dit quand le
dispositif est inactif, plutôt que d'afficher une liste vide trompeuse.

### Demandes d'intégration

**Composition.** Les dossiers d'agrément transmis, leurs pièces, l'identité du
demandeur.

**Actions.** Instruire · Accepter · Refuser (motif).

**Encart.** « Cet acte crée l'établissement » — l'acceptation n'est pas une
formalité : elle crée l'institution et son premier agent.

**État vide.** « Aucune demande ».

### Établissements

**Composition.** L'annuaire des établissements agréés et leurs habilitations par
type de diplôme.

**États vides.** « Aucun établissement agréé » · « Aucune habilitation » — le
second sur la fiche, et il est bloquant : un établissement sans habilitation ne
peut rien transmettre.

### Années académiques

**Composition.** Les années et leurs sessions (normale, rattrapage,
exceptionnelle).

**Actions.** Créer une année · Ouvrir / clôturer · Créer une session.

**États vides.** « Aucune année académique » · « Aucune année académique
ouverte » — le second est **l'amont du blocage** vu côté établissement, formulé
dans les mêmes termes des deux côtés pour que les deux agents parlent de la même
chose au téléphone.

---

## 26.4.4 — Espace diplômé (3 écrans)

### Mon portefeuille

**Composition.** Vue d'ensemble des diplômes, tous établissements confondus —
c'est l'apport de l'identité nationale.

**État vide.** « Aucun diplôme pour l'instant ».

**Encarts.**
- « Enregistrement en blockchain en cours » — pendant l'ancrage asynchrone, le
  diplôme existe et le dit ; il n'est pas caché.
- « Un diplôme révoqué reste visible ici » — un portefeuille qui cacherait la
  révocation à son titulaire le laisserait présenter un document mort sans le
  savoir.

### Mes diplômes

**Composition.** Une fiche par diplôme : PDF, QR, lien de vérification publique,
compteur de consultations et date de la dernière.

**État vide.** « Aucun diplôme certifié ».

**Encart.** « Ce diplôme n'est plus valable » sur un diplôme révoqué.

> Le compteur ne révèle **jamais** qui a vérifié. Un candidat n'a pas à savoir
> quel employeur l'a contrôlé.

### Mon compte

**Composition.** Identité, changement de numéro, préférences de notification,
sessions actives par appareil.

**Actions.** Changer de numéro (**double confirmation** : un code sur l'ancien,
un sur le nouveau) · Fermer une session · Régler les notifications.

**États vides.** « Aucune session listée » · « Aucun autre appareil n'était
connecté » — après une fermeture globale, le message confirme l'acte plutôt que
d'afficher un tableau vide.

---

## 26.4.5 — Espace administrateur (6 écrans)

### Supervision

**Composition.** Santé du système, taux de succès blockchain, taille de file,
incidents.

**État vide.** « Aucun incident en cours ».

**Bandeaux d'alerte, par gravité croissante.**
- « Blockchain en mode simulation » — *« aucune transaction réelle n'est émise :
  les diplômes certifiés ne sont pas inscrits »*. L'écran refuse de laisser
  croire à un ancrage qui n'a pas lieu.
- « Portefeuille de service à recharger » — seuil bas atteint.
- « Solde du portefeuille illisible » — le RPC ne répond pas ; distingué du
  solde bas, car la conduite à tenir n'est pas la même.

### Utilisateurs

**Composition.** Comptes, rôles, rattachements, état d'activation.

**Actions.** Créer (cohérence rôle ↔ rattachement vérifiée) · Activer /
désactiver.

**Encart.** *« Aucun mot de passe n'est créé ni transmis : le titulaire se
connecte avec son numéro. »* — devance la question que pose tout formulaire de
création de compte sans champ mot de passe.

**États vides.** « Aucun compte » · « Aucun compte ne correspond à ces
critères ».

### Établissements

**Composition.** Création, suspension, effets.

**Encart.** « Ce que la suspension produit » — énumère les conséquences
(transmission gelée, sort des diplômes déjà certifiés, agents) **avant** l'acte,
parce qu'elles ne sont pas devinables.

**État vide.** « Aucun établissement ».

### Clés de signature

**Composition.** Le registre des clés, leur empreinte, les diplômes signés avec
chacune.

**Actions.** Déclarer une clé compromise (modale dédiée).

**Encarts.**
- « Clé hébergée par le serveur applicatif » — limite assumée, affichée là où
  elle se constate (L-09 : KMS/HSM non raccordé).
- *« Aucune signature n'est refaite automatiquement »* — après déclaration de
  compromission, l'écran dénombre les diplômes concernés et donne la marche à
  suivre, sans laisser croire à une réparation automatique.

**État vide.** « Aucune clé enregistrée ».

### Corbeille

**Composition.** Les suppressions réversibles en attente.

**Actions.** Restaurer · Purger.

**État vide.** « Corbeille vide — aucune suppression en attente. **C'est le cas
normal.** » Le plus explicite des vides normaux : ici, plein serait inquiétant.

### Configuration

**Composition.** Environnement, modes actifs, secrets attendus.

**Bandeaux.**
- « Production en mode simulation » — incohérence de configuration.
- « Secret de signature absent » — *« en production le serveur refuse de
  démarrer »*. L'écran énonce la conséquence, pas seulement le manque.

---

## 26.4.6 — Journal, notifications, récupérations (3 écrans communs)

### Journal

**Composition.** Qui a fait quoi : horodatage, auteur, rôle, action, entité,
valeurs avant/après, IP, user-agent, résultat. Filtres par acteur, action,
période. Droits de consultation variables selon le rôle.

**Actions.** Filtrer · Exporter.

**Encart.** « Transaction blockchain associée » — corrélation entre une écriture
du journal et son ancrage.

**États vides.** « Aucune entrée » · « Aucune action ne correspond à ces
filtres ».

### Notifications

**Composition.** Boîte de réception in-app et préférences par canal.

**États vides.** « Aucune notification » · « Aucun message non lu ».

**Encart.** « Certaines notifications ne se désactivent pas » — les avis de
sécurité ne sont pas optionnels, et l'écran le dit au lieu d'afficher un
interrupteur qui ne ferait rien.

### Récupérations de compte

**Composition.** Les demandes ERR-003 (perte du téléphone), leurs pièces, le
rapprochement d'identité.

**Actions.** Instruire · Accepter · Refuser.

**Encarts — les plus importants de l'application.**
- *« Aucune pièce du dossier ne fait preuve »* — la décision se prend **en
  voyant la personne**, pièce d'identité en main. L'écran refuse de faire croire
  qu'un justificatif téléversé suffit.
- « Aucun compte rapproché automatiquement » — le rapprochement est proposé,
  jamais appliqué seul.

**État vide.** « Aucune demande ».

---

## 26.4.7 — Front public (4 écrans)

### Accueil — vérification

**Composition.** Un champ unique acceptant une empreinte SHA-256 ou une
référence. Bandeau République Togolaise, identité du service, pied de page
institutionnel.

**Encart permanent.** « Ce que la vérification n'établit pas » — dit les limites
du dispositif sur la page où on s'en sert, et non dans une mention légale :
*« aucun compte n'est requis et aucune donnée personnelle n'est inscrite »*.

**Erreurs.** Code mal formé · limitation de débit atteinte.

### Résultat de vérification (`/verifier/:code`)

Cible des QR codes imprimés sur les diplômes.

**Composition.** Résultat (`authentique` / `revoque` / `remplace` /
`en_attente_ancrage` / `introuvable`), identité du titulaire, établissement,
filière, mention, date, et l'état d'ancrage blockchain.

**Encarts selon le cas.**
- « Motif de la révocation ».
- « Version en vigueur » — sur un diplôme remplacé, renvoie vers la version
  valable ; remplacé n'est pas révoqué.
- « Que peut signifier ce résultat ? » — sur `introuvable`, parce qu'un
  vérificateur a besoin de savoir si c'est un faux ou une faute de frappe.
- « Vérification blockchain non disponible » — la chaîne n'a pas répondu ; l'état
  base est donné, l'incertitude est nommée.

**État vide.** « Aucun diplôme correspondant — aucune inscription du registre ne
correspond à ce code. »

### Demande d'intégration (`/integration`)

**Composition.** Formulaire en deux étapes (identité du demandeur, puis pièces),
checklist des pièces obligatoires, transmission, et suivi par référence.

**Actions.** Ouvrir un dossier · Déposer les pièces · Transmettre · Suivre.

**États.** « Dossier incomplet » / « Dossier complet » — la checklist montre en
permanence ce qui manque, avant de tenter la transmission. « Dossier transmis au
ministère » après l'acte.

**Erreurs.** « Aucune demande ne porte cette référence » · jeton absent — la
référence (`DI-2026-00042`) se devine, elle ne peut pas tenir lieu de secret.

### Démonstration (`/demonstration`)

**Composition.** Les diplômes réellement ancrés sur Polygon Amoy, leur état
lu on-chain, leur QR, le lien vers l'explorateur.

**Encart.** « Pourquoi cette page » — assume la fonction : c'est un écran de
présentation, pas un service au public.

**Erreurs.** « Vérification indisponible ».

> La page n'expose aucune donnée nouvelle : chaque état provient de l'endpoint
> public qu'un employeur interroge, et les références sont fixées à la
> construction. Il n'existe pas d'endpoint qui « liste les diplômes », et il ne
> doit pas en exister — un registre national ne se parcourt pas, il se consulte
> pièce par pièce.

---

## 26.4.8 — Ce que ce chapitre a mis au jour

Trois régularités, qui valent comme règles pour les écrans à venir.

1. **Un vide se qualifie.** Rien-parce-que-c'est-normal, rien-parce-que-le-filtre
   est trop étroit, et rien-parce-qu'un-blocage-amont existe sont trois écrans
   différents. Les confondre transforme une information en inquiétude.

2. **L'avertissement précède l'acte, jamais l'inverse.** « Ce que la suspension
   produit », « Le diplôme est retiré à son titulaire », « Cet acte crée
   l'établissement » : les conséquences non devinables sont dites avant le clic,
   pas confirmées après.

3. **Une limite s'affiche là où elle se constate.** La clé hébergée par le
   serveur applicatif, le mode simulation, le fait qu'aucune pièce ne fasse
   preuve dans une récupération : ces aveux vivent dans l'écran concerné, pas
   dans une annexe que personne n'ouvre.
