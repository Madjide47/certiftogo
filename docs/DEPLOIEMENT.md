# Déploiement — CertifTOGO sur Render

Le fichier [`render.yaml`](../render.yaml) à la racine décrit l'infrastructure
complète : PostgreSQL managé, API Express, et les deux frontends React.

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

## 3. Initialiser la base — une seule fois

> ⚠️ **`migrations/001_init_schema.sql` commence par `DROP TABLE` sur les
> 10 tables.** Ne jamais le mettre dans `buildCommand` ou `startCommand` :
> la base serait vidée à chaque déploiement.

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
