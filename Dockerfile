FROM node:24.19.0-alpine3.23 AS build

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.19.0-alpine3.23 AS runtime

RUN apk add --no-cache ffmpeg poppler-utils unzip \
  && mkdir -p /app/data \
  && chown -R node:node /app

WORKDIR /app
ENV NODE_ENV=production \
  NODE_OPTIONS=--disable-proto=throw \
  PORT=8787 \
  INTERVIEWPREP_DATA_DIR=/app/data \
  INTERVIEWPREP_BACKUP_DIR=/app/data/backups

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server

USER node
EXPOSE 8787
VOLUME ["/app/data"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "dist-server/gateway.js"]
