# Front-office public — CertifTOGO

Application React **publique** de vérification des diplômes (par hash, référence
ou QR code), accessible **sans compte**.

## Démarrage

```bash
cd frontend-public
npm install
npm run dev   # http://localhost:5174
```

Le backend doit tourner sur `http://localhost:4000` (voir `VITE_API_URL`).

## Contenu

- `pages/HomePage.jsx` — saisie d'une empreinte SHA-256 ou d'une référence `DIP-AAAA-XXXXX`.
- `pages/VerificationPage.jsx` — résultat (`/verifier/:code`, cible des QR codes) :
  **authentique** · **révoqué** · **introuvable**.
- `services/verification.service.js` — appel de l'endpoint public
  `GET /api/verification/:code`.

> Le scan de QR par la caméra (html5-qrcode) pourra être ajouté ultérieurement ;
> les QR codes générés encodent directement l'URL `/verifier/<hash>`.
