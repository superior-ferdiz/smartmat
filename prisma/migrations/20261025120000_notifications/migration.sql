-- AlterTable
ALTER TABLE "household_members" ADD COLUMN     "shopping_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "notification_settings" (
    "user_id" UUID NOT NULL,
    "use_by" BOOLEAN NOT NULL DEFAULT true,
    "best_before" BOOLEAN NOT NULL DEFAULT true,
    "days_before" SMALLINT NOT NULL DEFAULT 1,
    "budget" BOOLEAN NOT NULL DEFAULT true,
    "shopping" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notification_states" (
    "user_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_states_pkey" PRIMARY KEY ("user_id","household_id","key")
);

-- CreateIndex
CREATE INDEX "notification_states_household_id_user_id_idx" ON "notification_states"("household_id", "user_id");

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_states" ADD CONSTRAINT "notification_states_household_id_user_id_fkey" FOREIGN KEY ("household_id", "user_id") REFERENCES "household_members"("household_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Spec 11 (FR-NOTIF-005): the "soon" notification starts 0–7 days before the date.
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_days_before_check" CHECK (
  "days_before" BETWEEN 0 AND 7
);

-- Spec 11 (FR-NOTIF-004): a key is "<kind>:<details>" in a fixed alphabet – never free text from a user.
ALTER TABLE "notification_states" ADD CONSTRAINT "notification_states_key_check" CHECK (
  "key" ~ '^[a-zA-Z]+:[a-zA-Z0-9:-]+$'
);
