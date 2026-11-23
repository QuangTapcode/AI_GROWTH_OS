# AI Growth OS API (Next.js) for the Windows host's Docker Desktop. Build context: repository root.
# Secrets are never baked in: compose passes apps/api/.env.local at run time.
FROM node:24.14.1-slim AS build
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/api/ ./
RUN npx next build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.14.1-slim
WORKDIR /app/apps/api
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/.next ./.next
COPY --from=build /app/apps/api/next.config.mjs ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "4000"]
