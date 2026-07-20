# Notifications WhatsApp — configuration Meta Cloud API

Le service [`whatsapp.service.js`](../backend/src/services/whatsapp.service.js)
fonctionne en deux modes, pilotés par `WHATSAPP_MODE` :

| Mode | Comportement | Identifiants requis |
|---|---|---|
| `mock` *(défaut)* | Le code OTP s'affiche dans la console du serveur | aucun |
| `cloud` | Envoi réel via la WhatsApp Business Cloud API | oui |

Le projet reste donc **entièrement utilisable sans compte Meta**. Cette page
décrit la bascule en `cloud`.

---

## 1. Créer l'application Meta

1. [developers.facebook.com](https://developers.facebook.com) → **Mes applications**
   → **Créer une application** → type **Entreprise**.
2. Dans l'app : **Ajouter un produit** → **WhatsApp** → **Configurer**.
3. Meta crée automatiquement un **compte WhatsApp Business (WABA)** et un
   **numéro de test**.

Le numéro de test permet de tout valider gratuitement, mais il n'envoie qu'aux
**destinataires pré-enregistrés** (5 maximum, à déclarer dans *API Setup* →
*To*). Les numéros togolais s'ajoutent au format international `+228…`.

---

## 2. Créer le template d'authentification

> Meta **interdit** d'envoyer un message libre à quelqu'un qui n'a pas écrit en
> premier. Un OTP doit donc impérativement passer par un **template approuvé**
> de catégorie *authentication*.

**WhatsApp Manager** → **Modèles de messages** → **Créer un modèle** :

| Champ | Valeur |
|---|---|
| Catégorie | **Authentification** |
| Nom | `certiftogo_code_otp` |
| Langue | **Français** (`fr`) |
| Type de bouton | **Copier le code** |

Meta impose le texte des templates d'authentification (on ne choisit que les
options) ; le rendu est de la forme :

> *`<CODE>` est votre code de vérification. Pour votre sécurité, ne le partagez pas.*

L'approbation prend de quelques minutes à quelques jours. Le nom et la langue
choisis doivent correspondre à `WHATSAPP_TEMPLATE_NOM` et
`WHATSAPP_TEMPLATE_LANGUE`.

> Si le template est créé **sans** bouton de copie, passer
> `WHATSAPP_AVEC_BOUTON=false` — sinon Meta rejette l'envoi avec une erreur de
> composants.

---

## 3. Obtenir un token permanent

Le token affiché dans *API Setup* **expire au bout de 24 h** : inutilisable en
production. Générer un token permanent :

1. [business.facebook.com](https://business.facebook.com) → **Paramètres
   d'entreprise** → **Utilisateurs** → **Utilisateurs système**.
2. **Ajouter** un utilisateur système, rôle **Administrateur**.
3. **Ajouter des ressources** → l'application WhatsApp → autoriser
   **Gérer l'application**.
4. **Générer un nouveau token** → sélectionner l'app → cocher
   `whatsapp_business_messaging` et `whatsapp_business_management`
   → **Jamais** comme expiration.

Copier le token immédiatement : il n'est plus affiché ensuite.

---

## 4. Configurer le backend

Récupérer l'**identifiant du numéro de téléphone** (*Phone number ID*) dans
*WhatsApp* → *API Setup* — c'est un nombre, à ne pas confondre avec le numéro
lui-même.

```bash
WHATSAPP_MODE=cloud
WHATSAPP_TOKEN=EAAG…                    # token permanent, jamais versionné
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_TEMPLATE_NOM=certiftogo_code_otp
WHATSAPP_TEMPLATE_LANGUE=fr
WHATSAPP_AVEC_BOUTON=true
```

Sur Render, `WHATSAPP_TOKEN` et `WHATSAPP_PHONE_NUMBER_ID` sont déclarés
`sync: false` dans `render.yaml` : les saisir dans le dashboard.

---

## 5. Vérifier

```bash
curl -X POST http://localhost:4000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"telephone":"+22890000001"}'
```

Le message doit arriver sur WhatsApp. En mode `cloud`, la réponse de l'API
**ne contient plus `code_dev`** — ce champ n'est exposé qu'en mode `mock` hors
production, pour éviter de divulguer un code réellement envoyé.

En cas d'échec, l'API renvoie **502 `ENVOI_OTP_ECHEC`** et le code stocké est
invalidé (pas d'OTP fantôme en base). Le détail Meta est dans les logs serveur ;
le code OTP lui-même n'est jamais journalisé.

### Erreurs fréquentes

| Code Meta | Cause | Correction |
|---|---|---|
| `132001` | Template introuvable | Nom ou langue ne correspondent pas au template approuvé |
| `132000` | Nombre de paramètres incorrect | Ajuster `WHATSAPP_AVEC_BOUTON` |
| `131030` | Destinataire non autorisé | Ajouter le numéro aux destinataires de test |
| `190` | Token expiré | Utiliser un token d'utilisateur système permanent |
| `131026` | Message non délivrable | Le destinataire n'a pas WhatsApp |

---

## 6. Passer en production

Le numéro de test ne suffit pas au-delà de 5 destinataires. Pour un usage réel :

1. Ajouter un **vrai numéro** dans WhatsApp Manager (il ne doit pas déjà être
   associé à un compte WhatsApp classique).
2. Le vérifier par SMS ou appel.
3. Compléter la **vérification de l'entreprise** (Business Verification) —
   documents légaux de l'organisation, plusieurs jours de délai.

> Les conversations d'authentification sont **facturées** par Meta, à un tarif
> qui varie selon le pays du destinataire. Prévoir un moyen de paiement sur le
> compte professionnel avant la mise en service.
