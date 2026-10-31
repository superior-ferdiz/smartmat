-- CreateEnum
CREATE TYPE "ingredient_match" AS ENUM ('auto', 'manual', 'none');

-- CreateEnum
CREATE TYPE "allergen" AS ENUM ('gluten', 'crustaceans', 'egg', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs');

-- CreateEnum
CREATE TYPE "recipe_source" AS ENUM ('team', 'test');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "ingredient_id" UUID,
ADD COLUMN     "ingredient_match" "ingredient_match" NOT NULL DEFAULT 'auto';

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "base_unit" "base_unit" NOT NULL,
    "is_staple" BOOLEAN NOT NULL DEFAULT false,
    "category_key" VARCHAR(32),

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_aliases" (
    "alias" VARCHAR(60) NOT NULL,
    "ingredient_id" UUID NOT NULL,

    CONSTRAINT "ingredient_aliases_pkey" PRIMARY KEY ("alias")
);

-- CreateTable
CREATE TABLE "ingredient_allergens" (
    "ingredient_id" UUID NOT NULL,
    "allergen" "allergen" NOT NULL,

    CONSTRAINT "ingredient_allergens_pkey" PRIMARY KEY ("ingredient_id","allergen")
);

-- CreateTable
CREATE TABLE "unit_conversions" (
    "ingredient_id" UUID NOT NULL,
    "unit" "base_unit" NOT NULL,
    "unit_qty" INTEGER NOT NULL,
    "base_qty" INTEGER NOT NULL,

    CONSTRAINT "unit_conversions_pkey" PRIMARY KEY ("ingredient_id","unit")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "servings" INTEGER NOT NULL,
    "prep_minutes" INTEGER NOT NULL,
    "cook_minutes" INTEGER NOT NULL,
    "steps" TEXT[],
    "tags" TEXT[],
    "source" "recipe_source" NOT NULL,
    "license" VARCHAR(50) NOT NULL,
    "authors" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "recipe_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity_base" INTEGER,
    "display_text" VARCHAR(120) NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("recipe_id","position")
);

-- CreateTable
CREATE TABLE "user_allergens" (
    "user_id" UUID NOT NULL,
    "allergen" "allergen" NOT NULL,

    CONSTRAINT "user_allergens_pkey" PRIMARY KEY ("user_id","allergen")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_key_key" ON "ingredients"("key");

-- CreateIndex
CREATE INDEX "ingredient_aliases_ingredient_id_idx" ON "ingredient_aliases"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_slug_key" ON "recipes"("slug");

-- CreateIndex
CREATE INDEX "recipe_ingredients_ingredient_id_idx" ON "recipe_ingredients"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_recipe_id_ingredient_id_key" ON "recipe_ingredients"("recipe_id", "ingredient_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_category_key_fkey" FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_allergens" ADD CONSTRAINT "user_allergens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Rules Prisma cannot express (ADR-0003, ADR-0006, spec 05). The limits match packages/shared/src/recipes/seed.ts.
ALTER TABLE "inventory_items"
  -- An ingredient is stored only when the user chose it; auto/none never carry one.
  ADD CONSTRAINT "inventory_items_ingredient_only_manual" CHECK (("ingredient_match" = 'manual') = ("ingredient_id" IS NOT NULL));

ALTER TABLE "ingredients"
  ADD CONSTRAINT "ingredients_key_format" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "ingredients_name_not_blank" CHECK (btrim("name") <> '');

ALTER TABLE "ingredient_aliases"
  ADD CONSTRAINT "ingredient_aliases_normalised" CHECK ("alias" = lower("alias") AND btrim("alias") = "alias" AND "alias" <> '');

ALTER TABLE "unit_conversions"
  ADD CONSTRAINT "unit_conversions_unit_qty_range" CHECK ("unit_qty" BETWEEN 1 AND 100000),
  ADD CONSTRAINT "unit_conversions_base_qty_range" CHECK ("base_qty" BETWEEN 1 AND 100000);

ALTER TABLE "recipes"
  ADD CONSTRAINT "recipes_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "recipes_title_not_blank" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "recipes_servings_range" CHECK ("servings" BETWEEN 1 AND 50),
  ADD CONSTRAINT "recipes_minutes_range" CHECK ("prep_minutes" BETWEEN 0 AND 1440 AND "cook_minutes" BETWEEN 0 AND 1440),
  ADD CONSTRAINT "recipes_has_steps" CHECK (cardinality("steps") >= 1),
  -- ADR-0009: who wrote the recipe must be recorded.
  ADD CONSTRAINT "recipes_has_authors" CHECK (cardinality("authors") >= 1);

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_position_non_negative" CHECK ("position" >= 0),
  ADD CONSTRAINT "recipe_ingredients_quantity_range" CHECK ("quantity_base" IS NULL OR "quantity_base" BETWEEN 1 AND 100000000),
  ADD CONSTRAINT "recipe_ingredients_text_not_blank" CHECK (btrim("display_text") <> '');
