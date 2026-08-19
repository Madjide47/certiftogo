# 34. Coûts blockchain et gestion du gas

> Le coût était jusqu'ici **invisible** : la colonne `gas_used` restait `NULL`
> depuis l'origine du projet, le service blockchain ne remontant pas
> `receipt.gasUsed`. Corrigé — le coût est désormais mesuré, stocké et ventilé.

---

## 34.1 Coût unitaire mesuré

**Sur Polygon Amoy (testnet)**, mesure réelle du déploiement du projet :

| Opération | Coût observé |
|---|---|
| `certifier(hash, reference)` | ≈ **0,0075 POL** |
| `revoquer(hash, motif)` | ≈ **0,0075 POL** |
| Remplacement (révocation + certification) | ≈ **0,015 POL** |

Le POL de testnet s'obtient gratuitement par faucet : le coût est nul en
pratique, ce qui rend le MVP finançable — mais aussi trompeur si l'on n'en
projette pas la version réelle.

**Projection mainnet.** Le prix dépend de deux variables que l'État ne
contrôle pas : le cours du POL et la congestion du réseau. À titre d'ordre de
grandeur, pour un volume national de **50 000 diplômes par an** :

| Hypothèse | Transactions/an | Coût annuel en POL |
|---|---|---|
| Une transaction par diplôme | 50 000 | ≈ 375 POL |
| + révocations et corrections (≈ 2 %) | 51 000 | ≈ 383 POL |
| Avec regroupement par 100 (§34.3) | 500 | ≈ 4 POL |
| Avec racine de Merkle par promotion (§34.4) | ≈ 200 | ≈ 1,5 POL |

> **Avertissement méthodologique** : ces projections extrapolent une mesure
> faite sur testnet. Le coût du gas en mainnet dépend de la congestion et le
> cours du POL est volatil. Ces chiffres donnent un ordre de grandeur — ils ne
> constituent pas un budget.

L'écart entre la première et la dernière ligne — **un facteur 250** — est ce qui
justifie de traiter l'optimisation comme un sujet, et non comme un raffinement.

---

## 34.2 Le portefeuille de service

### Qui paie

Le backend signe avec **la même clé que celle du déploiement du contrat**. Le
constructeur de `RegistreDiplomes` autorise automatiquement le déployeur à
certifier : aucun appel d'autorisation supplémentaire n'est nécessaire.

Ce portefeuille est **le portefeuille de service du ministère**. Il ne détient
aucune valeur au-delà du gas nécessaire aux opérations.

### Alimentation et seuil d'alerte

| Élément | Valeur retenue |
|---|---|
| Seuil d'alerte bas | **30 jours de consommation moyenne** |
| Seuil critique | 7 jours |
| Procédure de recharge | virement vers l'adresse de service, validé à deux personnes |
| Surveillance | tableau de bord administrateur |

**Un portefeuille vide arrête la certification du pays.** C'est un risque
d'exploitation, pas un risque technique, et il se traite comme tel : alerte
anticipée et procédure de recharge écrite. Le seuil est exprimé en **jours de
consommation** plutôt qu'en montant, parce que c'est ce qui laisse le temps
d'agir.

**État** : le suivi du coût cumulé est implémenté ; la lecture du solde on-chain
et l'alerte automatique restent à faire.

### Ventilation

`GET /api/ministere/ancrage` renvoie le coût cumulé **par établissement** :

```json
{ "code": "IAI001", "nom": "…", "transactions": 128,
  "gas_total": "15360000", "cout_wei": "460800000000000" }
```

Cette ventilation n'est pas un raffinement comptable : elle permet de savoir
qui consomme, donc d'objectiver une éventuelle refacturation ou un plafond par
établissement.

---

## 34.3 Optimisation par regroupement

**Principe.** Une transaction ancre plusieurs empreintes au lieu d'une.

```solidity
function certifierLot(bytes32[] calldata hashes, string[] calldata references) external
```

**Gain.** Le coût fixe d'une transaction (21 000 gas) est amorti sur N diplômes.
Pour N = 100, la facture chute d'environ 80 %.

**Coût.**

- **Le contrat doit évoluer**, donc être redéployé : l'adresse actuelle et sa vérification Polygonscan deviendraient obsolètes, et les diplômes déjà ancrés resteraient sur l'ancien contrat. Il faudrait interroger les deux.
- La limite de gas par bloc borne la taille du lot — au-delà, la transaction échoue entièrement.
- **Granularité perdue** : si une empreinte du lot est invalide, c'est tout le lot qui échoue.

---

## 34.4 Optimisation par arbre de Merkle

**Principe.** Une seule racine est ancrée pour toute une promotion. Chaque
diplôme reçoit une **preuve d'inclusion** — une poignée de hashes — qui permet
de démontrer qu'il appartient bien à l'arbre.

```
              racine ancrée on-chain
                    ╱        ╲
                 h12          h34
                ╱   ╲        ╱   ╲
              h1     h2    h3     h4
              │      │     │      │
          diplôme  diplôme … …
```

Le vérificateur recalcule l'empreinte du diplôme, applique la preuve, et
compare le résultat à la racine publiée. Il obtient la même garantie qu'avec un
ancrage individuel.

**Gain.** Une transaction par promotion. Pour 12 000 diplômés répartis en 200
promotions : **200 transactions au lieu de 12 000**.

**Le coût caché, décisif.**

> Une racine de Merkle prouve l'**appartenance**, pas le **statut**.

Le contrat ne connaît plus les empreintes individuelles. Révoquer un diplôme
devient impossible sans re-publier quelque chose — or la révocation unitaire est
un besoin central du système (ERR-002, changement de mention, fraude
constatée).

**Compromis retenu, s'il fallait trancher aujourd'hui :**

| Opération | Mécanisme |
|---|---|
| Certification de masse | **racine de Merkle** par promotion |
| Révocation ou remplacement | **ancre individuelle**, ponctuelle |

Les révocations sont rares — quelques pourcents — donc leur coût unitaire reste
marginal, tandis que le volume de certification bénéficie du facteur 250.

**État** : non implémenté. Documenté ici parce que la question sera posée, et
parce que le coût caché est exactement ce qu'un jury attend qu'on ait vu.

---

## 34.5 Planification hors heures de pointe

Le coût du gas varie avec la congestion du réseau. La file d'ancrage permet
d'exploiter cette variation sans complexité supplémentaire : la colonne
`prochaine_tentative` sert déjà à différer une tâche.

Une politique simple suffirait : ancrer en priorité entre 2 h et 6 h UTC, sauf
si la promotion est marquée urgente — le champ `priorite` existe déjà.

**État** : non implémenté. La brique nécessaire est en place, seule la règle
d'ordonnancement manque.

---

## 34.6 Compromis lisibilité on-chain contre coût

| Ce qu'on écrit | Coût | Vérifiable seul ? | Retenu |
|---|---|---|---|
| Diplôme complet | très élevé | oui | ❌ — données personnelles publiques à vie |
| Empreinte + signature + statut | faible | non, mais suffisant | ✅ **actuel** |
| Racine de Merkle par promotion | très faible | avec preuve | ⏳ envisagé |
| Rien on-chain | nul | non | ❌ — le système perd sa raison d'être |

Le choix actuel est le seul qui réunit trois conditions : coût acceptable,
aucune donnée personnelle publiée, et vérifiabilité par un tiers sans accès au
serveur du ministère. Voir [ADR-006](35-decisions-architecture.md#adr-006).

---

## 34.7 Exigences

| Réf. | Exigence | État |
|---|---|---|
| **NFR-120** | Le gas consommé est mesuré et stocké pour chaque transaction | ✅ |
| **NFR-121** | Le coût cumulé est ventilé par établissement | ✅ |
| **NFR-122** | Le solde du portefeuille de service est surveillé | ⬜ |
| **NFR-123** | Une alerte est émise sous 30 jours de consommation restante | ⬜ |
| **NFR-124** | Le coût par diplôme est réduit d'au moins un facteur 10 avant mainnet | ⬜ Merkle |
| **NFR-125** | Aucune donnée personnelle n'est écrite on-chain | ✅ par construction |
