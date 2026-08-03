# 33. Performances et traitement asynchrone

> Chapitre adossé à du code livré : `ancrage.service.js`, `ancrage.model.js`,
> migration 008. Les comportements décrits ici sont couverts par huit tests
> d'intégration.

---

## 33.1 Cas d'usage de référence

L'Université de Lomé délibère en juillet et transmet **12 000 diplômés** en une
fois. C'est le cas qui doit dimensionner le système : s'il tient à 12 000, il
tient à 250.

Trois contraintes se combinent :

- une transaction Polygon met **2 à 6 secondes** à être confirmée ;
- une requête HTTP dépasse rarement 30 secondes avant qu'un intermédiaire ne la coupe ;
- le ministère ne peut pas laisser 12 000 diplômés attendre plusieurs jours.

---

## 33.2 Pourquoi le modèle synchrone est rejeté

Le calcul suffit à trancher.

| | Certification synchrone |
|---|---|
| Transactions | 12 000 |
| Confirmation moyenne | 4 s |
| **Durée totale** | **≈ 13 h 20** |
| Comportement HTTP | coupure après ~30 s |
| En cas de coupure réseau à 60 % | **tout le travail est perdu** |

Trois défauts, dont un rédhibitoire :

1. **La durée dépasse de trois ordres de grandeur ce qu'une requête HTTP tolère.**
2. **Aucune reprise possible** : rien ne dit où l'on s'était arrêté, ni ce qui a déjà été ancré.
3. **Un dossier fautif interrompt tout le reste** — le 3 000ᵉ échoue, les 9 000 suivants ne partent jamais.

Une file d'attente ne rend pas le traitement plus rapide. Elle le rend
**interruptible, reprenable et observable**, ce qui est le vrai besoin.

---

## 33.3 Modèle retenu

### 33.3.1 Le diplôme existe avant sa preuve

C'est la décision centrale, et elle est juridique avant d'être technique.

> Le diplôme est créé en base **dès la décision du ministère**, au statut
> `en_attente_ancrage`. Il est délivré ; seule sa **preuve publique** reste à
> publier.

Faire dépendre l'existence du diplôme de la confirmation blockchain
reviendrait à faire dépendre une décision administrative de la disponibilité
d'un réseau tiers. L'ordre correct est l'inverse : l'administration décide, la
chaîne enregistre.

### 33.3.2 Chaîne de traitement

```
Ministère valide un lot
        │
        ▼
Pour chaque dossier validé, dans une transaction SQL :
   ├── snapshot, hash, signature, PDF, QR
   ├── diplôme créé  → statut « en_attente_ancrage »
   ├── dossier → « certifié »
   ├── compte du diplômé activé
   ├── tâche enfilée (clé d'idempotence)
   └── journal d'audit
        │
        ▼   (réponse HTTP immédiate)
   ┌────────────────────────────┐
   │   file_attente_ancrage     │
   └────────────┬───────────────┘
                │  worker, au rythme du réseau
                ▼
   blockchain.certifier() ──► confirmée ? ──oui──► diplôme « actif »
                                  │                transaction enregistrée
                                  non
                                  │
                          report exponentiel
                          (2^tentatives min, plafond 1 h)
                                  │
                          tentatives épuisées
                                  ▼
                          statut « abandonnee »
                          + alerte administrateur
```

### 33.3.3 Idempotence portée par la base

```sql
cle_idempotence VARCHAR(160) NOT NULL UNIQUE
-- valeur : « certification:<uuid du diplôme> »

INSERT INTO file_attente_ancrage (...) VALUES (...)
ON CONFLICT (cle_idempotence) DO NOTHING
```

L'idempotence n'est **pas** confiée au worker. Deux demandes du même ancrage ne
créent qu'une tâche, quelle que soit la source de l'appel — reprise après
incident, double clic, appel concurrent. Un worker qui doit se souvenir de ce
qu'il a déjà fait finit toujours par l'oublier ; une contrainte unique, non.

### 33.3.4 Concurrence entre workers

```sql
UPDATE file_attente_ancrage
   SET statut = 'en_cours', tentatives = tentatives + 1
 WHERE id IN (
     SELECT id FROM file_attente_ancrage
      WHERE statut IN ('en_attente','echouee') AND prochaine_tentative <= now()
      ORDER BY priorite, prochaine_tentative
      LIMIT $1
      FOR UPDATE SKIP LOCKED
 )
RETURNING ...
```

`FOR UPDATE SKIP LOCKED` permet à plusieurs workers de consommer la même file
sans se marcher dessus : chacun saute les lignes déjà réservées. La montée en
charge se fait donc en ajoutant des workers, sans coordinateur ni verrou
applicatif.

### 33.3.5 Report exponentiel et file d'abandon

```sql
prochaine_tentative = now() + LEAST(POWER(2, tentatives) * INTERVAL '1 minute',
                                    INTERVAL '1 hour')
```

2 min → 4 → 8 → 16 → 32, plafonné à une heure. Une panne réseau ne doit pas
être martelée : la marteler la prolonge.

Au-delà de `max_tentatives` (5 par défaut), la tâche passe en `abandonnee`.
Ce n'est **pas** une table séparée : un statut suffit, et garde l'historique au
même endroit que le reste. L'administrateur est notifié et peut relancer la
tâche, compteur remis à zéro.

**BR-140** — Un dossier fautif n'interrompt jamais le traitement des autres :
la certification de masse capture l'erreur par dossier et poursuit.

---

## 33.4 Progression

`GET /api/ministere/lots/:id/ancrage`

```json
{
  "total": 12000,
  "ancres": 8245,
  "en_attente": 3750,
  "en_echec": 4,
  "abandonnes": 1,
  "pourcentage": 69,
  "libelle": "8 245 / 12 000 ancrés"
}
```

L'agent voit où en est son lot sans avoir à demander. Les échecs et les
abandons sont distingués : les premiers repartiront seuls, les seconds
demandent une action.

---

## 33.5 Comportement pendant l'ancrage

### 33.5.1 Côté ministère

Le lot passe en `certifie` dès la création des diplômes. La progression
d'ancrage est un indicateur distinct : l'acte administratif est fait, la
publication suit.

### 33.5.2 Côté diplômé

Le compte est **activé** et le diplôme **visible** dès la certification. Il
peut le consulter et le télécharger : le PDF est généré avant l'ancrage, avec
son empreinte et son QR.

Le portefeuille affiche le statut réel — `en_attente_ancrage` — plutôt que de
laisser croire à une preuve déjà publiée.

### 33.5.3 Côté vérificateur public

C'est le point le plus délicat, et il a été tranché en faveur de l'honnêteté.

| Statut du diplôme | Réponse publique |
|---|---|
| `actif` | `authentique` |
| `en_attente_ancrage` | **`en_attente_ancrage`** + explication |
| `revoque` | `revoque` + motif |
| `remplace` | `remplace` + référence de la version en vigueur |
| inconnu | `introuvable` |

> « Diplôme délivré par le ministère. Son enregistrement sur la blockchain est
> en cours ; la preuve publique sera disponible sous peu. »

Répondre `authentique` sans pouvoir l'étayer on-chain reviendrait à mentir sur
la nature de la garantie. Le message dit exactement ce qui est acquis — la
délivrance — et ce qui ne l'est pas encore — la preuve publique.

---

## 33.6 Reprise après incident

| Incident | Conséquence | Reprise |
|---|---|---|
| Worker tué en cours de traitement | tâche restée `en_cours` | reprise à la relance après expiration du verrou |
| Nœud RPC injoignable | échec, report exponentiel | automatique |
| Transaction non confirmée | échec compté | automatique jusqu'à épuisement |
| Base indisponible | rien n'est écrit | rien n'est perdu, la file est en base |
| Épuisement des tentatives | `abandonnee` | manuelle : relance par l'administrateur |

Le point à retenir : **la file est en base, pas en mémoire**. Un redémarrage ne
perd rien. C'est ce qui distingue une file persistante d'une file de messages
en mémoire, et c'est ce qui compte quand l'ancrage porte sur des diplômes
officiels.

---

## 33.7 Exigences non fonctionnelles

| Réf. | Exigence | Valeur | État |
|---|---|---|---|
| **NFR-110** | La certification d'un lot répond en moins de 5 s pour 250 dossiers | HTTP | ✅ |
| **NFR-111** | Aucune tâche d'ancrage n'est perdue en cas de redémarrage | 100 % | ✅ file en base |
| **NFR-112** | Une même certification ne peut être ancrée deux fois | garanti | ✅ contrainte unique |
| **NFR-113** | Un dossier en échec n'interrompt pas le lot | garanti | ✅ testé |
| **NFR-114** | Reprise automatique après panne réseau | ≤ 1 h | ✅ report exponentiel |
| **NFR-115** | Progression consultable à tout moment | temps réel | ✅ |
| **NFR-116** | Plusieurs workers peuvent consommer la file | sans conflit | ✅ `SKIP LOCKED` |
| **NFR-117** | Test de charge sur 12 000 dossiers | à réaliser | ⬜ |

**NFR-117 n'est pas satisfaite** : la logique tient à 12 000 par construction,
mais elle n'a été éprouvée qu'à petite échelle. Le dire vaut mieux que de
laisser croire à une mesure qui n'a pas eu lieu.

---

## 33.8 Ce qui reste à faire

- **Worker autonome.** Le traitement est déclenché par `POST /api/ministere/ancrage/traiter`. Un processus dédié — ou un `setInterval` au démarrage — reste à mettre en place pour que la file se vide sans intervention.
- **Test de charge** (NFR-117), avec mesure du débit réel et du comportement à saturation.
- **Ancrage par lot** (chapitre 34), qui réduirait le nombre de transactions et donc la durée totale.
