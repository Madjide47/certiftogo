# ─────────────────────────────────────────────────────────────
# Front-office public CertifTOGO — vérification sans compte.
#
# Vite ne lit pas l'environnement à l'exécution : `import.meta.env` est
# remplacé par sa valeur au moment du build. L'URL de l'API est donc un
# ARG, pas une variable du conteneur — changer d'API impose de
# reconstruire l'image, et c'est la vérité du produit, pas une limite
# de l'emballage.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=http://localhost:4000/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS execution

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
