-- Hushållsdelning: multi-adult households via memberships (Leverans E)
-- Additive + backfill: existing owners become OWNER members.

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADULT');

-- AlterTable
ALTER TABLE "households" ADD COLUMN "invite_code" TEXT;

-- CreateTable
CREATE TABLE "household_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'ADULT',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "households_invite_code_key" ON "households"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "household_memberships_user_id_key" ON "household_memberships"("user_id");

-- CreateIndex
CREATE INDEX "household_memberships_household_id_idx" ON "household_memberships"("household_id");

-- AddForeignKey
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing household owner becomes an OWNER member
INSERT INTO "household_memberships" ("id", "user_id", "household_id", "role")
SELECT 'hm_' || md5("id" || "owner_id"), "owner_id", "id", 'OWNER'::"MembershipRole"
FROM "households"
ON CONFLICT DO NOTHING;
