# Déroulé de démonstration — soutenance

Parcours minuté, répété de bout en bout sur la pile conteneurisée le
19 août 2026. Chaque étape indique **ce qu'on montre**, **ce qu'on dit**, et
ce qui casse si on s'en écarte.

Durée visée : **15 minutes**, hors questions.

---

## 0. Avant d'entrer dans la salle

### 0a. Le réseau, EN PREMIER (5 min, sur place)

**À faire une fois connecté au réseau que partagera le jury** — partage de
connexion depuis ton téléphone, de préférence : tu le maîtrises, le Wi-Fi d'une
école non.

```bash
cd backend && node scripts/preparer-demo.mjs   # détecte l'adresse, régénère les QR
cd .. && docker compose --profile complet up -d --build
docker cp backend/uploads/. certiftogo_api:/app/uploads/
```

> **Pourquoi ce n'est pas optionnel.** Les QR encodent l'adresse de la page de
> vérification. Par défaut `http://localhost:5174/…` — parfait sur la machine,
> **inutilisable ailleurs** : sur le téléphone du jury, `localhost` désigne le
> téléphone lui-même. Le QR ne mène nulle part, et l'argument le plus fort de la
> démonstration tombe. L'adresse change à chaque réseau, d'où un script qui la
> détecte plutôt qu'une valeur écrite en dur, garantie d'être fausse le jour J.
>
> Le `--build` n'est pas décoratif non plus : Vite fige l'adresse de l'API dans
> le bundle. Sans reconstruction, le téléphone qui ouvre la page appellerait
> « localhost:4000 », c'est-à-dire lui-même.

**Puis, DEPUIS UN TÉLÉPHONE du réseau**, ouvrir `http://<adresse>:5174`. Si la
machine y accède mais pas le téléphone, c'est le pare-feu Windows : autoriser
les ports 4000 et 5174 en entrée, profil « réseau privé », dans un terminal
administrateur.

```powershell
New-NetFirewallRule -DisplayName "CertifTOGO demo" -Direction Inbound `
  -Protocol TCP -LocalPort 4000,5173,5174 -Action Allow -Profile Private
```

> Pour revenir au fonctionnement local : `node scripts/preparer-demo.mjs --localhost`,
> puis le même `up -d --build`.

### 0b. Vérifications (2 min)

```bash
docker compose --profile complet ps                        # 4 conteneurs "healthy"
```

Puis vérifier que les trois piliers répondent :

```bash
curl -s localhost:4000/api/verification/DIP-2026-83470 | grep -o '"ancre":[a-z]*'
curl -s -o /dev/null -w '%{http_code}\n' localhost:4000/uploads/qr-DIP-2026-83470.png
curl -s -o /dev/null -w '%{http_code}\n' localhost:5174/demonstration
```

Attendus : `"ancre":true`, puis `200`, puis `200`. Remplacer `localhost` par
l'adresse réseau si l'étape 0a a été faite.

**Onglets à ouvrir d'avance**, dans cet ordre :

1. `http://localhost:5174` — vérification publique
2. `http://localhost:5174/demonstration` — diplômes réellement ancrés
3. `http://localhost:5173` — back-office (connexion)
4. `https://amoy.polygonscan.com/address/0x42d2e5EE482c365E5b4737C2d476D127732495F6#code`

> **Le code OTP s'affiche sur l'écran de connexion**, dans un encart, avec un
> bouton « Utiliser ce code ». Aucun besoin d'aller lire la console. C'est le
> drapeau `OTP_AFFICHE_CODE`, posé sur la seule pile de démonstration — si le
> jury interroge, la réponse tient dans [`SECURITE-DEPENDANCES.md`](SECURITE-DEPENDANCES.md).

---

## 1. Le problème, par la fin (2 min)

**Onglet 1 — vérification publique.** Taper `DIP-2026-83470`.

Ce qu'on montre : titulaire, filière, établissement, mention, et
`ancrage blockchain : ancré`.

Ce qu'on dit : *« Un employeur n'a besoin ni de compte, ni d'appeler
l'université. La réponse tient en deux secondes, et elle n'engage pas notre
parole — je vais le prouver. »*

**Onglet 4 — PolygonScan.** Le contrat, vérifié, sur un explorateur public.

> *« Ce hash est inscrit sur une chaîne que je ne contrôle pas. Si je truquais
> ma base ce soir, cette page-là ne bougerait pas. »*

---

## 2. Le diplôme révoqué (1 min)

Onglet 1, taper `DIP-2026-91564`.

Résultat : **révoqué**, avec son motif. Et on-chain : `valide = false`.

> *« La révocation est le cas qui sépare un registre d'une simple archive. Un
> diplôme retiré doit cesser de valoir immédiatement, partout, sans qu'on ait à
> prévenir qui que ce soit. »*

---

## 3. L'établissement prépare et transmet (4 min)

**Onglet 3**, connexion `+22890000002` (IAI Lomé). Le code s'affiche : cliquer
« Utiliser ce code ».

### 3a. Le contrôle qui bloque — à montrer AVANT celui qui passe

Ouvrir **Promotions**, choisir une promotion « Sciences de Gestion ». La
transmission refuse et **nomme les étudiants** dont les pièces manquent.

> *« Ce contrôle existait déjà, mais à la réception : le ministère rejetait, et
> l'établissement redéposait quelques jours plus tard un document qu'il avait
> sous la main depuis le début. Joué à l'émission, il ne coûte que le temps de
> le déposer. »*

### 3b. La transmission qui passe

Ouvrir **« Licence 3 Génie Logiciel (25-26) »** — 6 admis, dossiers complets.

Montrer la **grille des pièces** : une case par document attendu, pleine ou
vide, chacune avec son bouton de dépôt. Puis transmettre.

> *« Une liste ne montre que ce qui est là. L'agent qui avait fourni trois
> pièces sur quatre voyait trois lignes, et rien qui l'avertisse. La grille
> inverse la lecture. »*

L'écran de confirmation annonce l'effectif, les exclus, les prérequis manquants
et l'effet du gel, avant un bouton qui **porte le nombre**. Confirmer.

> ⚠️ **Seule étape non rejouable de la démonstration.** Une promotion transmise
> ne revient pas. Pour répéter, préparer une autre promotion :
> `node scripts/equiper-promotion.mjs --lister`, puis avec son identifiant.

---

## 4. Le ministère instruit (3 min)

Se déconnecter, se reconnecter en `+22890000001` (ministère).

**Lots reçus** : le lot qui vient d'arriver y est. L'ouvrir.

Montrer les **contrôles automatiques** passés à la réception : champs
obligatoires, doublons, cohérence des dates, habilitation de l'établissement,
type de diplôme autorisé, format du matricule, anomalies statistiques.

> *« Le lot est l'unité de transmission ; le dossier reste l'unité de décision.
> Sur 250 dossiers, trois anomalies ne doivent pas bloquer les 247 autres. »*

Statuer sur **une partie seulement** des dossiers : le lot reste `en_examen`
tant que le dernier n'est pas jugé.

> *« Valider exigeait autrefois d'avoir tout examiné. Sur 12 000 dossiers, cela
> suppose une séance ininterrompue — et le travail fait était perdu si l'agent
> devait s'arrêter. »*

---

## 5. La certification (2 min)

Sur un dossier validé : **Certifier**.

En une action : hash SHA-256 canonique → signature du ministère → écriture
blockchain → PDF → QR → activation du compte du diplômé.

Reprendre la référence produite, la coller dans **l'onglet 1**.

> *« Ce diplôme n'existait pas il y a trente secondes. Il est vérifiable
> publiquement, sans que j'aie rien configuré entre-temps. »*

> **Nuance à assumer si elle est vue.** La réponse indiquera `ancré : non`. Ce
> serveur certifie en mode `mock` — il n'a pas dépensé de POL. Mais il **lit**
> réellement la chaîne : c'est pourquoi il répond « non » au lieu de mentir.
> Les deux diplômes de l'onglet 2 sont, eux, réellement inscrits.
> *« Ancrer les 2 900 diplômes de démonstration coûterait une vingtaine de POL
> pour ne rien démontrer de plus : ce qui se démontre, c'est le mécanisme. »*

---

## 6. Le portefeuille du diplômé (2 min)

Se reconnecter en `+22890000013` — **Yao DOSSEH**, deux diplômes dont un
révoqué.

Montrer : les deux fiches, le PDF, le QR, le lien de vérification publique, et
le **compteur de consultations**.

> *« Il voit combien de fois son diplôme a été vérifié, et quand. Jamais par
> qui : un candidat n'a pas à savoir quel employeur l'a contrôlé. »*

Le diplôme révoqué apparaît **comme révoqué** dans son propre portefeuille.

> *« Un portefeuille qui cacherait la révocation à son titulaire le laisserait
> présenter un document mort sans le savoir. »*

---

## 7. Clôture (1 min)

**Onglet 2** — `/demonstration` : les deux diplômes réellement ancrés, leur QR,
et le lien vers l'explorateur.

> *« Vous pouvez scanner ces QR avec votre téléphone, maintenant. Ils pointent
> vers la vérification publique, et de là vers PolygonScan. Rien de ce que je
> viens de montrer ne repose sur le fait que vous me croyiez. »*

---

## Ce qu'il ne faut pas faire

| Ne pas | Pourquoi |
|---|---|
| Lancer `npm run db:demo` | Reconstruit la base : les deux diplômes vitrine disparaissent, et leurs hash restent sur la chaîne sans rien en face. |
| Lancer un fichier de test seul | `api.test.js` et `securite.test.js` dépendent de la base montée par la suite. Toujours `npm test`. |
| Montrer la CI GitHub | Les jobs échouent en 2 s, sans une seule étape exécutée : c'est le blocage de facturation Actions, pas le code. Montrer la sortie locale des 304 tests. |
| Improviser une référence | Les diplômes du seed sont ancrés en `mock` et répondront `ancré : non`. Utiliser celles de ce document. |
| Oublier `docker cp` après un `down -v` | Tous les PDF et QR repassent en 404 : portefeuille vide, QR cassés. |
| Changer de réseau sans rejouer l'étape 0a | Les QR gardent l'ancienne adresse et ne mènent plus nulle part. Un partage de connexion rouvert n'attribue pas forcément la même IP. |

## Aide-mémoire

| | |
|---|---|
| Établissement (IAI Lomé) | `+22890000002` |
| Ministère | `+22890000001` |
| Diplômé (2 diplômes) | `+22890000013` — Yao DOSSEH |
| Admin système | `+22890000003` |
| Ancré, valide | `DIP-2026-83470` |
| Ancré, révoqué | `DIP-2026-91564` |
| Promotion prête | Licence 3 Génie Logiciel (25-26) — 6 admis |
| Contrat | `0x42d2e5EE482c365E5b4737C2d476D127732495F6` (Amoy, chainId 80002) |
