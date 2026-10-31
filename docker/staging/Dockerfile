# The closed test environment (ADR-0015): one image with the API and the built web app.
# Built from the repo root:  docker compose -f docker/staging/compose.yml build
FROM node:22.14.0-bookworm-slim

# Prisma's migration engine needs OpenSSL; ca-certificates for HTTPS to Open Food Facts; Tesseract with the
# Norwegian model for the receipt worker (spec 08, ADR-0017 – the same packages as docker/ocr).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tesseract-ocr tesseract-ocr-nor \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a code change does not reinstall them. postinstall runs `prisma generate`, which
# reads prisma.config.ts and needs DATABASE_URL to be set – it does not connect, so a placeholder is enough.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN DATABASE_URL=postgresql://build:unused@localhost:5432/build npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

# Build-time settings for the web app: the test environment banner, and no registration link.
ARG VITE_SMARTMAT_ENVIRONMENT=staging
ARG VITE_REGISTRATION_OPEN=false
RUN VITE_SMARTMAT_ENVIRONMENT=$VITE_SMARTMAT_ENVIRONMENT VITE_REGISTRATION_OPEN=$VITE_REGISTRATION_OPEN \
  npm run build -w @smartmat/web

ENV NODE_ENV=production \
  API_HOST=0.0.0.0 \
  API_PORT=3000 \
  WEB_DIST_DIR=/app/apps/web/dist

USER node
EXPOSE 3000
# Migrations, then the ingredient list (no recipes, see ADR-0016), then the API.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed -w @smartmat/api && npm start -w @smartmat/api"]
