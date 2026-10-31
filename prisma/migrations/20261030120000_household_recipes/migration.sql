-- AlterEnum
ALTER TYPE "recipe_source" ADD VALUE 'household';

-- AlterTable
ALTER TABLE "recipe_ingredients" ADD COLUMN     "household_id" UUID,
ADD COLUMN     "input_amount" VARCHAR(12),
ADD COLUMN     "input_unit" VARCHAR(8),
ALTER COLUMN "ingredient_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "dedupe_key" UUID,
ADD COLUMN     "household_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "slug" DROP NOT NULL,
ALTER COLUMN "license" DROP NOT NULL;

-- CreateTable
CREATE TABLE "user_avoided_ingredients" (
    "user_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,

    CONSTRAINT "user_avoided_ingredients_pkey" PRIMARY KEY ("user_id","ingredient_id")
);

-- CreateIndex
CREATE INDEX "user_avoided_ingredients_ingredient_id_idx" ON "user_avoided_ingredients"("ingredient_id");

-- CreateIndex
CREATE INDEX "recipes_household_id_idx" ON "recipes"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_id_household_id_key" ON "recipes"("id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_household_id_dedupe_key_key" ON "recipes"("household_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_avoided_ingredients" ADD CONSTRAINT "user_avoided_ingredients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_avoided_ingredients" ADD CONSTRAINT "user_avoided_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------
-- ADR-0023 (spec 16): a household's own recipes live in the shared table. Compared as text: a new enum value
-- cannot be used in the same transaction that adds it.

-- ADR-0009 still holds for global recipes (who wrote it is recorded); a household's own recipe records who added
-- it in created_by instead.
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_has_authors";

ALTER TABLE "recipes"
  ADD CONSTRAINT "recipes_household_source" CHECK (("source"::text = 'household') = ("household_id" IS NOT NULL)),
  ADD CONSTRAINT "recipes_household_fields" CHECK (
    CASE WHEN "household_id" IS NOT NULL THEN
      "slug" IS NULL AND "license" IS NULL AND cardinality("authors") = 0
      AND "source_title" IS NULL AND "source_url" IS NULL AND "retrieved_on" IS NULL AND "adaptation" IS NULL
      AND "adaptation_note" IS NULL AND NOT "ai_assisted" AND cardinality("reviewed_by") = 0
    ELSE
      "slug" IS NOT NULL AND "license" IS NOT NULL AND cardinality("authors") >= 1 AND "dedupe_key" IS NULL
    END
  ),
  ADD CONSTRAINT "recipes_version_positive" CHECK ("version" >= 1);

-- A free-text line never counts, and is only allowed in a household's own recipe.
ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_free_text" CHECK (
    "ingredient_id" IS NOT NULL OR ("household_id" IS NOT NULL AND "quantity_base" IS NULL)
  ),
  ADD CONSTRAINT "recipe_ingredients_input_household" CHECK (
    "household_id" IS NOT NULL OR ("input_amount" IS NULL AND "input_unit" IS NULL)
  );

-- The line's household is always the recipe's: copied here, never trusted from the code.
CREATE FUNCTION "recipe_ingredients_household"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT r."household_id" INTO NEW."household_id" FROM "recipes" r WHERE r."id" = NEW."recipe_id";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "recipe_ingredients_household"
  BEFORE INSERT OR UPDATE ON "recipe_ingredients"
  FOR EACH ROW EXECUTE FUNCTION "recipe_ingredients_household"();

-- No meal plan entry or shopping list share may point at another household's recipe (FR-REC-009). The code checks
-- this too; this is the last line.
CREATE FUNCTION "recipe_household_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner uuid;
BEGIN
  IF NEW."recipe_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT r."household_id" INTO owner FROM "recipes" r WHERE r."id" = NEW."recipe_id";
  IF owner IS NOT NULL AND owner <> NEW."household_id" THEN
    RAISE EXCEPTION 'recipe belongs to another household' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "meal_plan_entries_recipe_household"
  BEFORE INSERT OR UPDATE OF "recipe_id", "household_id" ON "meal_plan_entries"
  FOR EACH ROW EXECUTE FUNCTION "recipe_household_guard"();
CREATE TRIGGER "shopping_list_item_recipes_recipe_household"
  BEFORE INSERT OR UPDATE OF "recipe_id", "household_id" ON "shopping_list_item_recipes"
  FOR EACH ROW EXECUTE FUNCTION "recipe_household_guard"();
