-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "dedupe_key" VARCHAR(80);

-- CreateTable
CREATE TABLE "products" (
    "gtin" VARCHAR(14) NOT NULL,
    "name" VARCHAR(100),
    "brand" VARCHAR(100),
    "package_quantity_base" INTEGER,
    "package_unit" "base_unit",
    "category_key" VARCHAR(32),
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("gtin")
);

-- CreateTable
CREATE TABLE "product_lookup_misses" (
    "gtin" VARCHAR(14) NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_lookup_misses_pkey" PRIMARY KEY ("gtin")
);

-- CreateTable
CREATE TABLE "household_barcodes" (
    "household_id" UUID NOT NULL,
    "gtin" VARCHAR(14) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category_key" VARCHAR(32) NOT NULL,
    "unit" "base_unit" NOT NULL,
    "quantity_base" INTEGER,
    "ingredient_match" "ingredient_match" NOT NULL DEFAULT 'auto',
    "ingredient_id" UUID,
    "location_id" UUID,
    "expiry_kind" "expiry_kind",
    "item_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "household_barcodes_pkey" PRIMARY KEY ("household_id","gtin")
);

-- CreateIndex
CREATE INDEX "household_barcodes_item_id_idx" ON "household_barcodes"("item_id");

-- CreateIndex
CREATE INDEX "household_barcodes_location_id_idx" ON "household_barcodes"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_household_id_dedupe_key_key" ON "inventory_batches"("household_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_key_fkey" FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_barcodes" ADD CONSTRAINT "household_barcodes_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_barcodes" ADD CONSTRAINT "household_barcodes_category_key_fkey" FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_barcodes" ADD CONSTRAINT "household_barcodes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_barcodes" ADD CONSTRAINT "household_barcodes_item_id_household_id_fkey" FOREIGN KEY ("item_id", "household_id") REFERENCES "inventory_items"("id", "household_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_barcodes" ADD CONSTRAINT "household_barcodes_location_id_household_id_fkey" FOREIGN KEY ("location_id", "household_id") REFERENCES "storage_locations"("id", "household_id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- CHECK constraints (Prisma cannot express them, ADR-0003). Spec 07.
ALTER TABLE "products"
  ADD CONSTRAINT "products_gtin_format" CHECK ("gtin" ~ '^([0-9]{8}|[0-9]{13,14})$'),
  ADD CONSTRAINT "products_package_both_or_none" CHECK (("package_quantity_base" IS NULL) = ("package_unit" IS NULL)),
  ADD CONSTRAINT "products_package_positive" CHECK ("package_quantity_base" IS NULL OR "package_quantity_base" > 0);

ALTER TABLE "product_lookup_misses"
  ADD CONSTRAINT "product_lookup_misses_gtin_format" CHECK ("gtin" ~ '^([0-9]{8}|[0-9]{13,14})$');

ALTER TABLE "household_barcodes"
  ADD CONSTRAINT "household_barcodes_gtin_format" CHECK ("gtin" ~ '^([0-9]{8}|[0-9]{13,14})$'),
  ADD CONSTRAINT "household_barcodes_name_not_blank" CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "household_barcodes_quantity_positive" CHECK ("quantity_base" IS NULL OR "quantity_base" > 0),
  ADD CONSTRAINT "household_barcodes_ingredient_only_manual" CHECK (("ingredient_match" = 'manual') = ("ingredient_id" IS NOT NULL));
