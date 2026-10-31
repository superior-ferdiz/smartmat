-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "text" VARCHAR(100) NOT NULL,
    "ingredient_id" UUID,
    "quantity_base" INTEGER,
    "unit" "base_unit",
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMPTZ(3),
    "dedupe_key" VARCHAR(100),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_item_recipes" (
    "item_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "quantity_base" INTEGER,

    CONSTRAINT "shopping_list_item_recipes_pkey" PRIMARY KEY ("item_id","recipe_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopping_lists_household_id_key" ON "shopping_lists"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_lists_id_household_id_key" ON "shopping_lists"("id", "household_id");

-- CreateIndex
CREATE INDEX "shopping_list_items_list_id_idx" ON "shopping_list_items"("list_id");

-- CreateIndex
CREATE INDEX "shopping_list_items_ingredient_id_idx" ON "shopping_list_items"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_list_items_id_household_id_key" ON "shopping_list_items"("id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_list_items_household_id_dedupe_key_key" ON "shopping_list_items"("household_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "shopping_list_item_recipes_recipe_id_idx" ON "shopping_list_item_recipes"("recipe_id");

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_list_id_household_id_fkey" FOREIGN KEY ("list_id", "household_id") REFERENCES "shopping_lists"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_item_recipes" ADD CONSTRAINT "shopping_list_item_recipes_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_item_recipes" ADD CONSTRAINT "shopping_list_item_recipes_item_id_household_id_fkey" FOREIGN KEY ("item_id", "household_id") REFERENCES "shopping_list_items"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_item_recipes" ADD CONSTRAINT "shopping_list_item_recipes_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rules Prisma cannot express (ADR-0003, ADR-0006, spec 06). The limits match packages/shared/src/schemas/shopping.ts.
ALTER TABLE "shopping_list_items"
  ADD CONSTRAINT "shopping_list_items_text_not_blank" CHECK (btrim("text") <> ''),
  -- A quantity always has its unit, and a unit is never stored without a quantity.
  ADD CONSTRAINT "shopping_list_items_quantity_with_unit" CHECK (("quantity_base" IS NULL) = ("unit" IS NULL)),
  ADD CONSTRAINT "shopping_list_items_quantity_range" CHECK ("quantity_base" IS NULL OR "quantity_base" BETWEEN 1 AND 100000000),
  ADD CONSTRAINT "shopping_list_items_checked_at" CHECK ("checked" = ("checked_at" IS NOT NULL));

ALTER TABLE "shopping_list_item_recipes"
  ADD CONSTRAINT "shopping_list_item_recipes_quantity_range" CHECK ("quantity_base" IS NULL OR "quantity_base" BETWEEN 1 AND 100000000);

-- FR-SHOP-002: at most one OPEN line per ingredient. Merging relies on it: two requests at the same time can
-- never leave two open lines for "melk". Checked lines and lines without an ingredient are not limited.
CREATE UNIQUE INDEX "shopping_list_items_one_open_per_ingredient"
  ON "shopping_list_items" ("list_id", "ingredient_id")
  WHERE NOT "checked" AND "ingredient_id" IS NOT NULL;

-- Decision 1: every household has exactly one list. New households get it at registration; existing ones here.
INSERT INTO "shopping_lists" ("id", "household_id")
SELECT gen_random_uuid(), "id" FROM "households";
