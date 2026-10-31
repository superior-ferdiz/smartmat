-- AlterTable
ALTER TABLE "household_members" ADD COLUMN     "share_allergens" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active_household_id" UUID;

-- CreateTable
CREATE TABLE "household_invitations" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "used_by" UUID,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "household_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "household_invitations_token_hash_key" ON "household_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "household_invitations_household_id_created_at_idx" ON "household_invitations"("household_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_active_household_id_fkey" FOREIGN KEY ("active_household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Spec 10 (FR-HH-003): exactly one owner per household. An ownership transfer demotes the old owner first.
CREATE UNIQUE INDEX "household_members_one_owner" ON "household_members"("household_id") WHERE "role" = 'owner';

-- Spec 10 (FR-HH-001): an invitation is used or revoked, never both.
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_state_check" CHECK (
  "used_at" IS NULL OR "revoked_at" IS NULL
);
-- used_by without used_at is impossible; used_by may become NULL later (the account was deleted).
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_used_check" CHECK (
  "used_at" IS NOT NULL OR "used_by" IS NULL
);
