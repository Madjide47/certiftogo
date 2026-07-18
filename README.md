# CertifTOGO

Plateforme de **certification et de traçabilité des diplômes sur blockchain**,
inspirée du modèle administratif togolais. Les établissements transmettent les
dossiers, le ministère certifie les diplômes (signature + blockchain), et le
public vérifie leur authenticité par hash ou QR code.

> Projet de stage — Licence Génie Logiciel (GLSI). Développement **par phases**.
> État actuel : **Phase 1** (structure + authentification OTP).

---

## Prérequis

- **Node.js** ≥ 18 (testé avec Node 22)
- **PostgreSQL** ≥ 13 (testé avec PostgreSQL 17) — *ou* **Docker** (voir plus bas)

---

## Structure du projet

```
certiftogo/
├── backend/                # API REST (Express + PostgreSQL)
├── frontend-back-office/   # App React privée (établissement, ministère, candidat, admin)
├── frontend-public/        # App React publique de vérification (Phase 5)
├── blockchain/             # Smart contract Solidity (Phase 2)
└── docker-compose.yml      # PostgreSQL local (optionnel)
```

---

## Installation & lancement

### 1. Base de données

**Option A — Docker (le plus simple)**

À la racine du projet :

```bash
cp .env.example .env         # (facultatif) ajuster les identifiants
docker compose up -d
```

Le schéma et les données de test sont chargés automatiquement au premier démarrage.

**Option B — PostgreSQL installé localement**

Créez la base puis chargez schéma + données via les scripts npm du backend :

```bash
# 1. Créer un utilisateur et une base (exemple)
#    (adaptez le mot de passe puis reportez-le dans backend/.env)
createdb certiftogo

# 2. Charger le schéma et le seed
cd backend
cp .env.example .env         # renseignez vos identifiants PostgreSQL
npm install
npm run db:reset             # joue la migration puis le seed
```

### 2. Backend (API)

```bash
cd backend
npm install                  # si pas déjà fait
cp .env.example .env         # à faire une fois, puis renseigner les valeurs
npm run dev                  # → http://localhost:4000
```

Vérifiez : `GET http://localhost:4000/health` doit répondre `{ "success": true, ... }`.

### 3. Frontend back-office

```bash
cd frontend-back-office
npm install
cp .env.example .env
npm run dev                  # → http://localhost:5173
```

---

## Se connecter (authentification OTP)

L'OTP est **simulé** en Phase 1 : le code à 6 chiffres **s'affiche dans la console
du backend** (pas d'envoi WhatsApp réel).

1. Ouvrez http://localhost:5173
2. Saisissez un numéro de test, par ex. **`+22890000001`** (ministère)
3. Regardez la **console du backend** : le code OTP y est affiché
4. Saisissez ce code → vous êtes connecté

### Comptes de test

| Rôle | Téléphone |
|------|-----------|
| Ministère | `+22890000001` |
| Établissement (IAI Lomé) | `+22890000002` |
| Admin système | `+22890000003` |
| Candidat (Koffi) | `+22890000011` |
| Candidat (Ama) | `+22890000012` |
| Candidat (Yao) | `+22890000013` |

---

## API — endpoints Phase 1

| Méthode | Route | Description |
|---------|-------|-------------|
| GET  | `/health` | État du serveur + base |
| POST | `/api/auth/request-otp` | Demande un code OTP (`{ telephone }`) |
| POST | `/api/auth/verify-otp` | Vérifie le code, renvoie un JWT (`{ telephone, code }`) |
| GET  | `/api/auth/me` | Infos de l'utilisateur connecté (JWT requis) |

---

## Documentation

Voir [`CLAUDE.md`](./CLAUDE.md) pour l'architecture détaillée, les conventions et
le plan des 8 phases.
