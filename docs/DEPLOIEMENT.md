# Déploiement — CertifTOGO

Deux chemins, pour deux besoins différents :

| | Docker Compose | Render |
|---|---|---|
| Sert à | démonstration locale, répétition de soutenance | démonstration en ligne, QR scannables au téléphone |
| Dépend de | rien d'autre que Docker | un compte Render, une facturation GitHub active |
| Décrit par | [`docker-compose.yml`](../docker-compose.yml) + 3 `Dockerfile` | [`render.yaml`](../render.yaml) |

---

## 0. Chemin Docker — la pile entière en une commande

```bash
docker compose --profile complet up -d --build
```

Trois images sont construites et démarrées derrière PostgreSQL :

| Service | Image | Port | Contenu |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5433 | la base |
| `api` | `node:22-alpine` | 4000 | Express, en `NODE_ENV=production`, sous l'utilisateur `node` |
| `back-office` | `nginx:1.27-alpine` | 5173 | React construit, servi en statique |
| `public` | `nginx:1.27-alpine` | 5174 | React construit, servi en statique |

Chacun porte un `HEALTHCHECK`, et celui de l'API **interroge la base** : un
conteneur qui répond mais dont la connexion PostgreSQL est morte se déclare
`unhealthy` au lieu de mentir. `docker compose ps` suffit donc à savoir si la
démonstration est prête.

**Sans le profil**, `docker compose up -d` ne démarre que la base — c'est le
mode de travail quotidien, où l'on veut `npm run dev` et son rechargement à
chaud plutôt qu'une reconstruction d'image à chaque ligne écrite.

**Deux pièges, tous deux traités dans le fichier :**

- À l'intérieur du réseau Docker, la base ne s'appelle pas `localhost:5433`
  mais `postgres:5432`. Le bloc `environment` du service `api` écrase donc les
  valeurs héritées de `backend/.env`, et neutralise `DATABASE_URL` — laissée
  telle quelle, elle serait prioritaire dans le code et annulerait la
  correction.
- Vite fige `import.meta.env` **au moment du build** : les URLs de l'API et du
  front public sont des `ARG` de construction, pas des variables du conteneur.
  Changer d'adresse impose de reconstruire — c'est une propriété du produit,
  pas une limite de l'emballage.

Les PDF, QR codes et pièces justificatives vivent dans deux volumes nommés
(`certiftogo_uploads`, `certiftogo_stockage`) : ils survivent à la
reconstruction des images, puisque ce sont des données et non du code.

---

## 1. Créer le Blueprint

1. Sur [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connecter le dépôt `Madjide47/certiftogo`, branche `main`.
3. Render lit `render.yaml` et propose les 4 ressources. Valider.

**Vérifier les URLs attribuées.** Render expose chaque service sur
`https://<nom>.onrender.com`, mais **ajoute un suffixe si le nom est déjà pris
globalement**. Si les URLs réelles diffèrent, corriger dans `render.yaml` :
`PUBLIC_BASE_URL`, `PUBLIC_VERIFY_URL`, `CORS_ORIGINS`, `VITE_API_URL`,
`VITE_PUBLIC_URL` — puis redéployer. Une incohérence ici casse le CORS et les
QR codes.

---

## 2. Renseigner la clé blockchain

`BLOCKCHAIN_PRIVATE_KEY` est marquée `sync: false` : elle n'est **jamais**
versionnée. La saisir à la main dans le dashboard Render →
service `certiftogo-api` → **Environment**.

Utiliser la clé du déployeur du contrat (voir `blockchain/.env` en local) :
le constructeur de `RegistreDiplomes` autorise automatiquement le déployeur à
certifier, donc aucune transaction d'autorisation supplémentaire n'est requise.

---

## 3. Initialiser la base

`npm run migrate` joue les fichiers de `migrations/` dans l'ordre et note
chacun dans la table `schema_migrations` : un fichier déjà appliqué n'est
jamais rejoué. La commande est donc **sûre à relancer** — c'est elle qu'on
utilise aussi bien pour l'initialisation que pour les migrations suivantes.

Sur une base créée avant ce mécanisme, `001_init_schema.sql` est
automatiquement marqué comme déjà appliqué : ses `DROP TABLE` ne sont pas
rejoués et les données sont conservées.

> ⚠️ **`migrate:reset`, `db:reset` et `db:demo` reconstruisent la base
> intégralement** (les migrations commencent par des `DROP TABLE`). Ne jamais
> les mettre dans `buildCommand` ou `startCommand`.

Depuis un poste local, en visant la base Render (récupérer l'**External
Database URL** dans le dashboard) :

```bash
cd backend
DATABASE_URL="postgresql://…@…render.com/certiftogo" npm run migrate
DATABASE_URL="postgresql://…@…render.com/certiftogo" npm run seed
```

Pour un jeu de données de démonstration riche :

```bash
DATABASE_URL="…" npm run seed:demo
```

> `seed:demo` passe par les vrais services. Avec `BLOCKCHAIN_MODE=onchain`,
> **chaque diplôme déclenche une transaction réelle** (~0,0075 POL pièce).
> Pour éviter de vider le portefeuille, lancer le seed avec
> `BLOCKCHAIN_MODE=mock` et ne certifier on-chain que quelques diplômes vitrine.

---

## 4. Limites du plan gratuit

| Limite | Conséquence | Contournement |
|---|---|---|
| **Mise en veille après inactivité** | Le premier appel réveille le service : ~50 s de latence | Ouvrir l'app quelques minutes **avant** la soutenance |
| **Système de fichiers éphémère** | Les PDF et QR de `backend/uploads/` sont **perdus à chaque redéploiement** | Voir ci-dessous |
| **PostgreSQL gratuit expiré au bout de ~30 jours** | La base est supprimée | Noter la date de création ; sauvegarder avant échéance |

### Le point le plus gênant : les fichiers générés

L'API écrit les PDF de diplômes et les QR codes dans `backend/uploads/`
(voir `src/config/storage.js`). Sur Render, ce disque est **éphémère** : tout
redéploiement ou redémarrage efface ces fichiers.

**Ce qui casse :** les liens de téléchargement PDF et les images QR des
diplômes certifiés avant le redéploiement.

**Ce qui continue de marcher :** la vérification publique. Elle repose sur le
hash en base et l'ancrage on-chain, pas sur les fichiers. Un QR code déjà
imprimé ou photographié reste valide, puisqu'il encode une URL de vérification.

**Options :**
- *Court terme (démo)* — recertifier quelques diplômes après le déploiement
  final, et ne plus redéployer avant la soutenance.
- *Propre* — ajouter un disque persistant Render (plan payant Starter),
  monté sur `backend/uploads`.
- *Le plus robuste* — stocker les fichiers hors du disque : en base
  (colonne `bytea`) ou sur un stockage objet type S3/R2. Demande une
  modification de `storage.js`.

---

## 5. Vérifier le déploiement

```bash
curl https://certiftogo-api.onrender.com/health
```

Puis, dans un navigateur :

- Back-office : `https://certiftogo-back-office.onrender.com` — connexion OTP.
  ⚠️ **Le code OTP s'affiche dans les logs Render**, pas par WhatsApp
  (`whatsapp.service.js` est encore un mock). Dashboard → `certiftogo-api` →
  **Logs**.
- Front public : `https://certiftogo-public.onrender.com` — vérifier une
  référence `DIP-…` ou un hash. Le résultat doit inclure
  `ancrage_blockchain.ancre = true` pour les diplômes réellement ancrés.

---

## 6. Sécurité avant une vraie mise en production

- `JWT_SECRET` et `MINISTERE_SIGNING_SECRET` sont générés par Render
  (`generateValue: true`) — bien.
- ✅ **Aucun secret de signature n'est codé en dur.** `signature.service.js`
  n'accepte que `MINISTERE_SIGNING_SECRET` (16 caractères minimum) : en
  production, l'application **refuse de démarrer** s'il est absent ou trop
  court. Hors production, un secret aléatoire éphémère est généré à chaque
  démarrage, avec un avertissement dans les logs.
- Le portefeuille blockchain est un compte de **testnet**. Pour un déploiement
  réel, utiliser un compte dédié sur le mainnet et le protéger correctement
  (l'adresse du déployeur est propriétaire du contrat : elle peut certifier,
  révoquer, et autoriser d'autres comptes).
