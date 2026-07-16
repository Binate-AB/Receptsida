-- Assumption economy + robustness (Leverans B)
-- Additive only: new column with default, two new tables.

-- AlterTable
ALTER TABLE "recipe_templates" ADD COLUMN "robustness" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "dinner_assumptions" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 2,
    "value" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "corrected_value" JSONB,
    "corrected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dinner_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_ingredient_confidence" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_ingredient_confidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dinner_assumptions_request_id_key_key" ON "dinner_assumptions"("request_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "household_ingredient_confidence_household_id_canonical_key" ON "household_ingredient_confidence"("household_id", "canonical");

-- AddForeignKey
ALTER TABLE "dinner_assumptions" ADD CONSTRAINT "dinner_assumptions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "meal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_ingredient_confidence" ADD CONSTRAINT "household_ingredient_confidence_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
