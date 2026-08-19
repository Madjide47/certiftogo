# ─────────────────────────────────────────────────────────────
# Back-office CertifTOGO — espace privé (OTP), quatre rôles.
#
# Vite ne lit pas l'environnement à l'exécution : `import.meta.env` est
# remplacé par sa valeur au moment du build. Les URLs sont donc des ARG,
# pas des variables du conteneur.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=http://localhost:4000/api
ARG VITE_PUBLIC_URL=http://localhost:5174
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PUBLIC_URL=$VITE_PUBLIC_URL
RUN npm run build

# ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS execution

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
