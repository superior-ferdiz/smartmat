-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "browser" VARCHAR(20) NOT NULL DEFAULT 'other',
ADD COLUMN     "login_notice_dismissed_at" TIMESTAMPTZ(3),
ADD COLUMN     "os" VARCHAR(20) NOT NULL DEFAULT 'other';


-- Spec 13 (FR-AUTH-009): only the fixed lists in packages/shared/src/account/device.ts.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_browser_check"
  CHECK ("browser" IN ('edge', 'samsung', 'opera', 'firefox', 'chrome', 'safari', 'other'));
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_os_check"
  CHECK ("os" IN ('android', 'ios', 'windows', 'macos', 'chromeos', 'linux', 'other'));
-- Spec 13 (FR-BUD-006).
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_version_check" CHECK ("version" >= 1);
