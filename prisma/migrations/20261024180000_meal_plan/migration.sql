-- CreateEnum
CREATE TYPE "meal" AS ENUM ('breakfast', 'lunch', 'dinner');

-- CreateTable
CREATE TABLE "meal_plan_entries" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "meal" "meal" NOT NULL,
    "recipe_id" UUID,
    "recipe_title" VARCHAR(120),
    "servings" INTEGER,
    "note" VARCHAR(100),
    "dedupe_key" VARCHAR(100),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "meal_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_item_meals" (
    "item_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "quantity_base" INTEGER,

    CONSTRAINT "shopping_list_item_meals_pkey" PRIMARY KEY ("item_id","entry_id")
);

-- CreateIndex
CREATE INDEX "meal_plan_entries_household_id_date_idx" ON "meal_plan_entries"("household_id", "date");

-- CreateIndex
CREATE INDEX "meal_plan_entries_recipe_id_idx" ON "meal_plan_entries"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_entries_id_household_id_key" ON "meal_plan_entries"("id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_entries_household_id_dedupe_key_key" ON "meal_plan_entries"("household_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "shopping_list_item_meals_entry_id_idx" ON "shopping_list_item_meals"("entry_id");

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_item_meals" ADD CONSTRAINT "shopping_list_item_meals_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_item_meals" ADD CONSTRAINT "shopping_list_item_meals_item_id_household_id_fkey" FOREIGN KEY ("item_id", "household_id") REFERENCES "shopping_list_items"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_item_meals" ADD CONSTRAINT "shopping_list_item_meals_entry_id_household_id_fkey" FOREIGN KEY ("entry_id", "household_id") REFERENCES "meal_plan_entries"("id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Spec 09: an entry is a recipe (title copy + servings) or a note, never both and never neither.
-- recipe_id may become NULL later (the recipe was removed); the title copy stays.
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_kind_check" CHECK (
  ("recipe_title" IS NOT NULL AND "servings" IS NOT NULL AND "note" IS NULL)
  OR ("note" IS NOT NULL AND "recipe_id" IS NULL AND "recipe_title" IS NULL AND "servings" IS NULL)
);
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_servings_check" CHECK (
  "servings" IS NULL OR "servings" BETWEEN 1 AND 50
);
ALTER TABLE "shopping_list_item_meals" ADD CONSTRAINT "shopping_list_item_meals_quantity_check" CHECK (
  "quantity_base" IS NULL OR "quantity_base" > 0
);
