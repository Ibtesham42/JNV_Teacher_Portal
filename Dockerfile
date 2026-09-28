# JNV Teacher Routine Portal
FROM node:20-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM base AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/data/uploads TESSDATA_DIR=/data/tessdata
COPY --from=build /app ./
RUN mkdir -p /data/uploads /data/tessdata && chown -R node:node /data /app/.next
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.mjs && exec npm start"]
