-- Phase 8: receipt OCR (spec 08, ADR-0017). Generated with prisma migrate diff; CHECK constraints added by hand.

-- CreateEnum
CREATE TYPE "receipt_status" AS ENUM ('queued', 'processing', 'review', 'failed', 'confirmed');

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "status" "receipt_status" NOT NULL DEFAULT 'queued',
    "failure_code" VARCHAR(30),
    "image_sha256" CHAR(64),
    "uploaded_by" UUID,
    "purchase_id" UUID,
    "delete_after" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_images" (
    "receipt_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_images_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateTable
CREATE TABLE "receipt_extractions" (
    "receipt_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "engine" VARCHAR(60) NOT NULL,
    "raw_text" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "mean_confidence" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_extractions_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateIndex
CREATE INDEX "receipts_household_id_status_idx" ON "receipts"("household_id", "status");

-- CreateIndex
CREATE INDEX "receipts_delete_after_idx" ON "receipts"("delete_after");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_id_household_id_key" ON "receipts"("id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_purchase_id_key" ON "receipts"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_purchase_id_household_id_key" ON "receipts"("purchase_id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_images_receipt_id_household_id_key" ON "receipt_images"("receipt_id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_extractions_receipt_id_household_id_key" ON "receipt_extractions"("receipt_id", "household_id");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_purchase_id_household_id_fkey" FOREIGN KEY ("purchase_id", "household_id") REFERENCES "purchases"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_images" ADD CONSTRAINT "receipt_images_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_images" ADD CONSTRAINT "receipt_images_receipt_id_household_id_fkey" FOREIGN KEY ("receipt_id", "household_id") REFERENCES "receipts"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_receipt_id_household_id_fkey" FOREIGN KEY ("receipt_id", "household_id") REFERENCES "receipts"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints Prisma cannot express (spec 08).
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_failure_code_check"
    CHECK ("failure_code" IS NULL OR "failure_code" IN ('timeout', 'unavailable', 'invalidResponse', 'noText')),
  -- A failure code exactly when the status is "failed".
  ADD CONSTRAINT "receipts_failed_has_code_check"
    CHECK (("status" = 'failed') = ("failure_code" IS NOT NULL)),
  -- Confirmed exactly when there is a purchase and a time; a confirmed receipt has no image hash left.
  ADD CONSTRAINT "receipts_confirmed_check"
    CHECK (("status" = 'confirmed') = ("purchase_id" IS NOT NULL AND "confirmed_at" IS NOT NULL)
           AND ("status" <> 'confirmed' OR "image_sha256" IS NULL)),
  ADD CONSTRAINT "receipts_image_sha256_check"
    CHECK ("image_sha256" IS NULL OR "image_sha256" ~ '^[0-9a-f]{64}$');

ALTER TABLE "receipt_images"
  ADD CONSTRAINT "receipt_images_size_check"
    CHECK (octet_length("bytes") BETWEEN 1 AND 10485760 AND "width" > 0 AND "height" > 0);

ALTER TABLE "receipt_extractions"
  ADD CONSTRAINT "receipt_extractions_numbers_check"
    CHECK ("mean_confidence" BETWEEN 0 AND 100 AND "duration_ms" >= 0 AND char_length("raw_text") <= 100000);
