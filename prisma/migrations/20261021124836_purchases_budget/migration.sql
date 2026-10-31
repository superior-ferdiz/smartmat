-- CreateEnum
CREATE TYPE "purchase_source" AS ENUM ('manual', 'receipt', 'barcode');

-- CreateEnum
CREATE TYPE "purchase_line_kind" AS ENUM ('food', 'non_food');

-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "purchase_line_id" UUID;

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "store_name" VARCHAR(100),
    "purchased_on" DATE NOT NULL,
    "total_ore" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NOK',
    "source" "purchase_source" NOT NULL DEFAULT 'manual',
    "dedupe_key" VARCHAR(100),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" VARCHAR(100) NOT NULL,
    "kind" "purchase_line_kind" NOT NULL,
    "category_key" VARCHAR(32),
    "amount_ore" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_budgets" (
    "household_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "amount_ore" INTEGER,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "food_budgets_pkey" PRIMARY KEY ("household_id","valid_from")
);

-- CreateIndex
CREATE INDEX "purchases_household_id_purchased_on_idx" ON "purchases"("household_id", "purchased_on");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_id_household_id_key" ON "purchases"("id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_household_id_dedupe_key_key" ON "purchases"("household_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "purchase_lines_household_id_idx" ON "purchase_lines"("household_id");

-- CreateIndex
CREATE INDEX "purchase_lines_purchase_id_idx" ON "purchase_lines"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_lines_id_household_id_key" ON "purchase_lines"("id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_purchase_line_id_household_id_key" ON "inventory_batches"("purchase_line_id", "household_id");

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_line_id_household_id_fkey" FOREIGN KEY ("purchase_line_id", "household_id") REFERENCES "purchase_lines"("id", "household_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_household_id_fkey" FOREIGN KEY ("purchase_id", "household_id") REFERENCES "purchases"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_category_key_fkey" FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_budgets" ADD CONSTRAINT "food_budgets_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rules Prisma cannot express (ADR-0003, ADR-0006, spec 04). The limits match packages/shared/src/schemas/purchases.ts.
ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_total_range" CHECK ("total_ore" BETWEEN 0 AND 100000000),
  ADD CONSTRAINT "purchases_currency_nok" CHECK ("currency" = 'NOK'),
  ADD CONSTRAINT "purchases_store_not_blank" CHECK ("store_name" IS NULL OR btrim("store_name") <> '');

ALTER TABLE "purchase_lines"
  ADD CONSTRAINT "purchase_lines_amount_range" CHECK ("amount_ore" BETWEEN 0 AND 10000000),
  ADD CONSTRAINT "purchase_lines_position_non_negative" CHECK ("position" >= 0),
  ADD CONSTRAINT "purchase_lines_description_not_blank" CHECK (btrim("description") <> ''),
  -- Food has a category, non-food has none.
  ADD CONSTRAINT "purchase_lines_category_for_food" CHECK (("kind" = 'food') = ("category_key" IS NOT NULL));

ALTER TABLE "food_budgets"
  ADD CONSTRAINT "food_budgets_amount_range" CHECK ("amount_ore" IS NULL OR "amount_ore" BETWEEN 100 AND 100000000),
  ADD CONSTRAINT "food_budgets_first_of_month" CHECK (EXTRACT(DAY FROM "valid_from") = 1);
