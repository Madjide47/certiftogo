# CertifTOGO — Prompts Google Stitch (maquettes UI)

Objectif : redesign moderne du produit **en conservant strictement la palette
actuelle**. Chaque écran = 1 génération Stitch. Colle d'abord le **bloc Design
System**, puis ajoute le **prompt de l'écran** voulu.

Palette (à ne PAS changer) :
- Vert principal `#006A4E` · Vert foncé `#00543E`
- Jaune accent `#FFCE00` · Rouge (erreur/révoqué) `#D21034`
- Fond `#F8FAFC` · Texte `#0F172A` · Bordures `#E2E8F0`

---

## 0) BLOC DESIGN SYSTEM (à coller en tête de chaque prompt)

```
Design a modern, trustworthy web app UI for "CertifTOGO", a blockchain-based
diploma certification platform for the Togolese government (fight against diploma
fraud). Tone: official yet modern, clean, reassuring, high-tech but sober.

STRICT color palette (do not deviate):
- Primary green #006A4E, dark green #00543E (headers, sidebar, primary buttons)
- Accent yellow #FFCE00 (used sparingly: highlights, active accents)
- Alert red #D21034 (errors, revoked state)
- Background #F8FAFC, surfaces white #FFFFFF, text #0F172A, muted text #64748B,
  borders #E2E8F0
- Status colors (soft tinted backgrounds + saturated text):
  submitted=blue, in-review=amber, validated/certified=emerald/green,
  rejected/revoked=red, draft=slate

Visual language (modern):
- Typography: geometric sans-serif (Inter / Manrope), strong hierarchy, large
  bold page titles, comfortable line-height
- Rounded-2xl cards (16px radius), soft layered shadows, generous whitespace
- Subtle depth: light glassmorphism on the sidebar/header, faint green gradient
  accents, thin 1px borders
- Pill-shaped status badges with soft tinted backgrounds
- Clean data tables and stat cards, clear empty states, subtle hover states
- Iconography: line icons, consistent stroke
- Language: French UI labels
- Fully responsive (desktop-first for back-office, mobile-first for public site)
- Accessible contrast (WCAG AA)
```

---

## Écrans complémentaires

### A) Configuration (admin système)
```
Inside the app shell (role: Administrateur). Page "Configuration", subtitle
"Paramètres généraux de la plateforme". Organize as grouped setting cards:
- "Certification" : mode blockchain (segmented control: Mock / Local / Amoy),
  adresse du contrat RegistreDiplomes (read-only field + copy), statut de
  connexion au nœud (green/red dot + "Connecté / Hors ligne").
- "Notifications" : canal OTP (WhatsApp / SMS / Console), champ token masqué,
  bouton "Tester l'envoi".
- "Sécurité" : durée de validité de l'OTP (minutes), durée de session JWT (heures).
- "Établissements" : lien rapide vers la gestion.
Each card: title, short helper text, inputs/toggles, a "Enregistrer" button.
Modern settings console, calm, lots of whitespace, clear section separation.
```

### B) Paramètres (candidat)
```
Inside the app shell (role: Candidat). Page "Paramètres", subtitle "Votre compte".
Cards:
- "Profil" : nom, prénom (read-only, issus de l'état civil), numéro de téléphone
  (masqué partiellement), avec une note "Contactez votre établissement pour toute
  correction".
- "Notifications" : toggles pour être alerté par WhatsApp lors d'une certification
  ou d'une révocation de diplôme.
- "Confidentialité" : toggle "Rendre mes diplômes vérifiables publiquement par
  référence" (info: la vérification par QR/hash reste toujours possible).
- "Session" : bouton "Se déconnecter" (outline red).
Personal, clean, reassuring. Cards rounded-2xl, soft shadows.
```

> Thème sombre : à ajouter plus tard (décliner le bloc Design System avec fond
> `#0B1220`, surfaces `#111C2E`, texte clair, vert conservé comme accent).

---


### Conseils d'usage Stitch
- Génère **écran par écran** (colle le bloc Design System + un prompt).
- Après une première génération, itère en langage naturel : « rends la sidebar plus
  fine », « ajoute un état vide », « badges plus doux », etc.
- Garde une capture de l'écran validé comme référence de style pour les suivants
  (cohérence du design system).
- Décline chaque écran en version **desktop** (back-office) et **mobile** (public).
```
