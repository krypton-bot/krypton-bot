FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm install (not ci): a lockfile written on Windows or macOS lacks some Linux-only optional packages.
RUN npm install --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 STANDALONE=1
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 DATA_DIR=/data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/drizzle ./drizzle
# The database and the encryption key live in /data: mount a volume there. Never run as root.
RUN mkdir /data && chown -R node:node /app /data
USER node
VOLUME /data
EXPOSE 3000
# Migrations run on first request / boot from src/db. Publish the port on localhost only (see docker-compose.yml).
CMD ["node", "server.js"]
