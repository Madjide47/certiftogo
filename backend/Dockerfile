# ─────────────────────────────────────────────────────────────
# API CertifTOGO — image de production.
#
# Deux étages : le premier installe les dépendances, le second ne
# reçoit que ce qui sert à l'exécution. L'outillage de compilation des
# modules natifs reste dans l'étage jeté.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS dependances

WORKDIR /app

# Les manifestes seuls d'abord : tant qu'ils ne changent pas, Docker
# réutilise le cache de cette couche et ne réinstalle rien.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS execution

ENV NODE_ENV=production
WORKDIR /app

# `dumb-init` sert de PID 1 : sans lui, Node reçoit les signaux
# directement et `docker stop` devient un SIGKILL au bout de 10 s —
# une transaction blockchain en vol serait coupée sans trace.
RUN apk add --no-cache dumb-init

COPY --from=dependances /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
COPY seeds ./seeds
COPY scripts ./scripts

# Les deux répertoires de fichiers. Ils sont montés en volume par
# docker-compose ; on les crée quand même, pour que l'image tourne
# seule et que les droits soient posés avant le changement d'utilisateur.
RUN mkdir -p uploads stockage && chown -R node:node /app

# Jamais root : une faille d'écriture de fichier dans l'API ne doit pas
# donner la main sur le conteneur.
USER node

EXPOSE 4000

# La santé passe par la base : un conteneur qui répond mais dont la
# connexion PostgreSQL est morte n'est pas « sain », il est trompeur.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.json()).then(j=>process.exit(j?.data?.db?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
