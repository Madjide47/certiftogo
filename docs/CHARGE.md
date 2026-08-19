# Tenue à l'échelle — mesures (CDC §31.4, backlog P-03)

Le cahier des charges affirme partout que le dispositif tient l'échelle
nationale : 250 diplômés pour un institut, **jusqu'à 12 000 pour
l'Université de Lomé**. L'affirmation n'avait jamais été mesurée. Elle
l'est depuis le 16 août 2026, par `npm run charge`.

```bash
cd backend
npm run charge                    # 2 000 étudiants (défaut)
node scripts/charge.mjs --effectif=12000
node scripts/charge.mjs --garder  # conserve la base d'analyse
```

Le banc travaille sur une base jetable `certiftogo_charge`, recréée à
chaque exécution : il ne touche jamais aux données de démonstration.

---

## 1. Ce que la mesure a trouvé avant de mesurer quoi que ce soit

**La transmission d'une promotion de 2 000 étudiants était impossible.**
Pas lente : impossible. Elle échouait sur une violation d'unicité, après
avoir écrit ses premiers dossiers.

Les références `CT-AAAA-XXXXX` étaient tirées **au hasard sur cinq
chiffres**, soit 100 000 valeurs par an, et la transmission par lot
appelait le générateur une fois par dossier **sans aucun contrôle**. Le
paradoxe des anniversaires fait le reste : sur 2 000 tirages dans
100 000 valeurs, la probabilité qu'au moins deux se heurtent dépasse
99,99 %. À 12 000, elle est certaine.

Le cas d'usage affiché du cahier des charges — l'Université de Lomé — ne
pouvait donc pas fonctionner, et rien ne le disait : les 296 tests
passaient, parce qu'aucun n'engageait plus de quelques dizaines de
dossiers. C'est la justification la plus nette qu'on puisse donner à un
banc de charge : il ne mesure pas seulement la vitesse, il découvre les
limites que les tests fonctionnels ne voient pas.

Correction : compteur atomique par (préfixe, année) — migration 020 et
`services/reference.service.js`. Une promotion de 12 000 réserve sa plage
de références **en un aller-retour**.

---

## 2. Mesures — 2 000 étudiants

Poste de développement (Windows 11, PostgreSQL 17 en conteneur,
`BLOCKCHAIN_MODE=mock`). Ces chiffres décrivent CertifTOGO, pas Polygon :
le coût et la latence d'une transaction réelle sont mesurés séparément
(≈ 0,0075 POL et ≈ 4 s, CLAUDE.md §11).

| Phase | Durée | Débit |
|---|---:|---:|
| création des étudiants | 0,4 s | 4 651/s |
| inscriptions et délibération | 19,6 s | 102/s |
| dépôt des pièces justificatives | 108,1 s | 130/s |
| **contrôle préalable à la transmission** | **0,1 s** | — |
| transmission du lot | 3,0 s | 658/s |
| contrôles automatiques (ministère) | 0,2 s | 12 637/s |
| **examen des pièces (ministère)** | **235,1 s** | **60/s** |
| validation du lot | 2,7 s | 739/s |
| certification de masse | 91,2 s | 22/s |
| vidage de la file d'ancrage | 22,5 s | 89/s |
| **total** | **482,9 s** (8 min) | |

Résultat : 2 000 dossiers, 14 001 pièces, 2 000 diplômes actifs,
**zéro échec**, file vide.

---

## 3. Lecture

**Le contrôle préalable à la transmission tient en 0,1 s.** C'est le
chiffre qui compte pour l'agent : l'écran lui rend son verdict — pièces
manquantes, étudiants sans numéro — avant qu'il ne clique, sans qu'il
croie l'application figée. C'était le risque le plus concret d'une
vérification jouée à l'émission plutôt qu'à la réception.

**Les contrôles automatiques à la réception sont gratuits** (12 637/s).
Ils s'exécutent en SQL ensembliste, pas dossier par dossier.

**La phase la plus lente n'est pas la blockchain, c'est l'examen des
pièces** : 235 s, la moitié du total. Et le chiffre mesuré est un
plancher — il ne dit rien du **temps humain**. Un agent du ministère doit
ouvrir et juger chaque pièce (règle D-11) : à sept pièces par étudiant,
une promotion de 12 000 en compte 84 000. À dix secondes par pièce, cela
représente **plus de cent journées de travail**.

C'est la vraie limite du dispositif, et elle est organisationnelle, pas
technique. Trois sorties possibles, par ordre de coût croissant :

1. **Échantillonnage** — n'exiger l'examen que d'un tirage de dossiers,
   le reste étant accepté sous la responsabilité de l'établissement, qui
   a déjà engagé sa signature en transmettant.
2. **Validation en masse par type de pièce** — l'agent juge « tous les
   relevés de notes de cette promotion » plutôt que 12 000 fois le même
   document au même format.
3. **Contrôle automatique de forme** (page de garde présente, PDF non
   vide, empreinte distincte des autres) pour ne présenter à l'humain que
   les pièces suspectes.

Aucune n'est implémentée. Elles sont énoncées ici parce qu'un jury
demandera ce qui se passe à 12 000, et que la réponse honnête n'est pas
« ça tient », c'est « la machine tient, l'organisation doit changer ».

**La certification de masse (22/s) et l'ancrage (89/s) sont les phases
que l'asynchronisme protège déjà** : le ministère ne les attend pas. En
mode `onchain`, l'ancrage retombe au rythme du réseau — environ 4 s par
transaction, soit ~13 h pour 12 000, ce qui est précisément la raison
d'être de la file (migration 008).

---

## 4. Projection à 12 000

L'extrapolation linéaire donne ~48 min. Elle est indicative, pas
mesurée : les index, le cache PostgreSQL et la mémoire ne se comportent
pas linéairement, et le dépôt de 84 000 fichiers touche le disque bien
plus que 14 000.

Pour une mesure réelle : `node scripts/charge.mjs --effectif=12000`,
en prévoyant environ une heure.

---

## 5. Ce que le banc ne mesure pas

- **La charge concurrente.** Il déroule un parcours séquentiel ; il ne
  simule pas 40 établissements transmettant le même jour. Le compteur de
  références et les transactions sont conçus pour, et le test
  « deux réservations simultanées » le couvre, mais ce n'est pas une
  mesure de contention.
- **La latence réseau réelle** (blockchain, WhatsApp), volontairement
  neutralisée : elle masquerait le comportement du code.
- **Le temps humain**, qui est pourtant la contrainte dominante (§3).
- **Les tests de sécurité** (P-04), qui restent à écrire.
