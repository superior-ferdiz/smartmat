-- CreateEnum
CREATE TYPE "price_source" AS ENUM ('kassalapp');

-- CreateTable
CREATE TABLE "price_observations" (
    "id" UUID NOT NULL,
    "source" "price_source" NOT NULL,
    "gtin" VARCHAR(14) NOT NULL,
    "chain_code" VARCHAR(40) NOT NULL,
    "chain_name" VARCHAR(60) NOT NULL,
    "price_ore" INTEGER NOT NULL,
    "package_quantity_base" INTEGER,
    "package_unit" "base_unit",
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "source_url" VARCHAR(300),

    CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lookups" (
    "source" "price_source" NOT NULL,
    "gtin" VARCHAR(14) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "found" BOOLEAN NOT NULL,

    CONSTRAINT "price_lookups_pkey" PRIMARY KEY ("source","gtin")
);

-- CreateIndex
CREATE INDEX "price_observations_gtin_idx" ON "price_observations"("gtin");

-- CreateIndex
CREATE INDEX "price_observations_fetched_at_idx" ON "price_observations"("fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "price_observations_source_gtin_chain_code_key" ON "price_observations"("source", "gtin", "chain_code");

-- CreateIndex
CREATE INDEX "price_lookups_fetched_at_idx" ON "price_lookups"("fetched_at");

-- Spec 12: only a validated GTIN is stored, never free text.
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_gtin_check" CHECK (
  "gtin" ~ '^([0-9]{8}|[0-9]{13,14})$'
);
ALTER TABLE "price_lookups" ADD CONSTRAINT "price_lookups_gtin_check" CHECK (
  "gtin" ~ '^([0-9]{8}|[0-9]{13,14})$'
);

-- Spec 12: whole øre (ADR-0006), at most 100 000 kr.
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_price_check" CHECK (
  "price_ore" BETWEEN 0 AND 10000000
);

-- Spec 12: a pack size is a positive whole amount with its unit, or neither.
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_package_check" CHECK (
  ("package_quantity_base" IS NULL AND "package_unit" IS NULL)
  OR ("package_quantity_base" BETWEEN 1 AND 100000000 AND "package_unit" IS NOT NULL)
);

-- Spec 12: chain codes as Kassalapp writes them (MENY_NO, KIWI …).
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_chain_code_check" CHECK (
  "chain_code" ~ '^[A-Z0-9_]{1,40}$'
);
