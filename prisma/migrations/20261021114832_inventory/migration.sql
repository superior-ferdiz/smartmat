-- CreateEnum
CREATE TYPE "location_kind" AS ENUM ('fridge', 'freezer', 'pantry', 'other');

-- CreateEnum
CREATE TYPE "expiry_kind" AS ENUM ('best_before', 'use_by');

-- CreateEnum
CREATE TYPE "inventory_event_type" AS ENUM ('add', 'consume', 'discard', 'move', 'adjust', 'undo');

-- CreateEnum
CREATE TYPE "waste_reason" AS ENUM ('expired', 'spoiled', 'leftovers', 'too_much', 'other');

-- CreateEnum
CREATE TYPE "waste_value_basis" AS ENUM ('actual', 'estimated', 'unknown');

-- CreateEnum
CREATE TYPE "base_unit" AS ENUM ('g', 'ml', 'stk');

-- CreateTable
CREATE TABLE "categories" (
    "key" VARCHAR(32) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "storage_locations" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "kind" "location_kind" NOT NULL,
    "name" VARCHAR(50),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category_key" VARCHAR(32) NOT NULL,
    "unit" "base_unit" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity_base" INTEGER NOT NULL,
    "initial_quantity_base" INTEGER NOT NULL,
    "expiry_kind" "expiry_kind",
    "expiry_date" DATE,
    "price_ore" INTEGER,
    "purchased_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_events" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_id" UUID,
    "type" "inventory_event_type" NOT NULL,
    "delta_base" INTEGER NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "actor_id" UUID,
    "reverts_event_id" UUID,
    "waste_reason" "waste_reason",
    "waste_value_ore" INTEGER,
    "waste_value_basis" "waste_value_basis",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage_locations_household_id_idx" ON "storage_locations"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_locations_id_household_id_key" ON "storage_locations"("id", "household_id");

-- CreateIndex
CREATE INDEX "inventory_items_household_id_idx" ON "inventory_items"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_id_household_id_key" ON "inventory_items"("id", "household_id");

-- CreateIndex
CREATE INDEX "inventory_batches_household_id_idx" ON "inventory_batches"("household_id");

-- CreateIndex
CREATE INDEX "inventory_batches_item_id_idx" ON "inventory_batches"("item_id");

-- CreateIndex
CREATE INDEX "inventory_batches_location_id_idx" ON "inventory_batches"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_events_reverts_event_id_key" ON "inventory_events"("reverts_event_id");

-- CreateIndex
CREATE INDEX "inventory_events_household_id_created_at_idx" ON "inventory_events"("household_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_events_item_id_created_at_idx" ON "inventory_events"("item_id", "created_at");

-- AddForeignKey
ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_key_fkey" FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_item_id_household_id_fkey" FOREIGN KEY ("item_id", "household_id") REFERENCES "inventory_items"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_location_id_household_id_fkey" FOREIGN KEY ("location_id", "household_id") REFERENCES "storage_locations"("id", "household_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_item_id_household_id_fkey" FOREIGN KEY ("item_id", "household_id") REFERENCES "inventory_items"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_reverts_event_id_fkey" FOREIGN KEY ("reverts_event_id") REFERENCES "inventory_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules Prisma cannot express (ADR-0003, spec 03).
ALTER TABLE "storage_locations"
  ADD CONSTRAINT "storage_locations_name_not_blank" CHECK ("name" IS NULL OR btrim("name") <> '');

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_name_not_blank" CHECK (btrim("name") <> '');

ALTER TABLE "inventory_batches"
  ADD CONSTRAINT "inventory_batches_quantity_non_negative" CHECK ("quantity_base" >= 0),
  ADD CONSTRAINT "inventory_batches_initial_positive" CHECK ("initial_quantity_base" > 0),
  ADD CONSTRAINT "inventory_batches_price_non_negative" CHECK ("price_ore" IS NULL OR "price_ore" >= 0),
  -- One kind of date per batch, and a kind only together with a date (decision 2).
  ADD CONSTRAINT "inventory_batches_expiry_pair" CHECK (("expiry_kind" IS NULL) = ("expiry_date" IS NULL));

ALTER TABLE "inventory_events"
  -- Waste fields belong to discards, and every discard has a reason and a value basis.
  ADD CONSTRAINT "inventory_events_waste_only_on_discard" CHECK (
    ("type" = 'discard') = ("waste_reason" IS NOT NULL AND "waste_value_basis" IS NOT NULL)
  ),
  ADD CONSTRAINT "inventory_events_waste_value" CHECK (
    ("waste_value_ore" IS NULL OR "waste_value_ore" >= 0)
    AND (("waste_value_basis" = 'unknown') = ("waste_value_ore" IS NULL) OR "waste_value_basis" IS NULL)
  ),
  ADD CONSTRAINT "inventory_events_undo_has_target" CHECK (("type" = 'undo') = ("reverts_event_id" IS NOT NULL)),
  ADD CONSTRAINT "inventory_events_move_has_no_delta" CHECK ("type" <> 'move' OR "delta_base" = 0);

-- Categories (same keys and order as CATEGORY_KEYS in packages/shared; a test compares them).
INSERT INTO "categories" ("key", "sort_order") VALUES
  ('dairy', 1), ('meat', 2), ('fish', 3), ('fruitVeg', 4), ('bread', 5), ('dryGoods', 6),
  ('canned', 7), ('frozen', 8), ('spreads', 9), ('spicesSauces', 10), ('drinks', 11), ('other', 12);

-- Households that existed before this migration get the three default locations too.
-- gen_random_uuid() is v4; new rows from the app are v7. Both are valid UUIDs.
INSERT INTO "storage_locations" ("id", "household_id", "kind", "name")
SELECT gen_random_uuid(), h."id", k."kind"::"location_kind", NULL
FROM "households" h
CROSS JOIN (VALUES ('fridge'), ('freezer'), ('pantry')) AS k("kind")
WHERE NOT EXISTS (SELECT 1 FROM "storage_locations" s WHERE s."household_id" = h."id");
