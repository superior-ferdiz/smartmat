-- CreateEnum
CREATE TYPE "recipe_adaptation" AS ENUM ('none', 'translated', 'adapted');

-- AlterEnum
ALTER TYPE "recipe_source" ADD VALUE 'external';

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "adaptation" "recipe_adaptation",
ADD COLUMN     "adaptation_note" VARCHAR(1000),
ADD COLUMN     "ai_assisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retrieved_on" DATE,
ADD COLUMN     "reviewed_by" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reviewed_on" DATE,
ADD COLUMN     "source_title" VARCHAR(200),
ADD COLUMN     "source_url" VARCHAR(500);


-- ADR-0016 (spec 09): an external recipe always says where it comes from and what was done to it.
-- Compared as text: a new enum value cannot be used in the same transaction that adds it.
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_external_source_check" CHECK (
  "source"::text <> 'external'
  OR ("source_title" IS NOT NULL AND "source_url" IS NOT NULL AND "retrieved_on" IS NOT NULL
      AND "adaptation" IS NOT NULL)
);
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_reviewed_check" CHECK (
  (coalesce(cardinality("reviewed_by"), 0) = 0) = ("reviewed_on" IS NULL)
);
