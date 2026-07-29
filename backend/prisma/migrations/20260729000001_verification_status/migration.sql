-- Verification gate (§22/§23): only human-VERIFIED dishes enter the
-- candidate pool. Additive + grandfather backfill: every template that
-- exists at migration time belongs to the 24-dish set covered by the
-- G0 allergen review sign-off (Jonas, 2026-07-29) and is grandfathered
-- as VERIFIED. New templates default to DRAFT.

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('DRAFT', 'VERIFIED', 'RETIRED');

-- AlterTable
ALTER TABLE "recipe_templates"
  ADD COLUMN "verification_status" "VerificationStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "verified_at" TIMESTAMP(3),
  ADD COLUMN "verified_by" TEXT;

-- CreateIndex
CREATE INDEX "recipe_templates_verification_status_idx" ON "recipe_templates"("verification_status");

-- Grandfather backfill (documented in docs/NISSE_CURRENT_STATE_AUDIT.md §23)
UPDATE "recipe_templates"
SET "verification_status" = 'VERIFIED',
    "verified_at" = TIMESTAMP '2026-07-29 00:00:00',
    "verified_by" = 'Jonas';
