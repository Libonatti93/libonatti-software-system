FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY editorial-radar.js ./
COPY relevance-agent.js ./
COPY editor-agent.js ./
COPY public ./public

RUN addgroup -S lios && adduser -S lios -G lios \
  && mkdir -p /data \
  && chown -R lios:lios /app /data

USER lios
EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8091/healthz || exit 1

CMD ["node", "server.js"]
