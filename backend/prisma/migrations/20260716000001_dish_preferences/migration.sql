-- Smakförankring: dish preferences from onboarding quick-pick (Leverans C)

-- CreateEnum
CREATE TYPE "DishPreferenceSource" AS ENUM ('ONBOARDING', 'LEARNED');

-- CreateTable
CREATE TABLE "dish_preferences" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "source" "DishPreferenceSource" NOT NULL DEFAULT 'ONBOARDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dish_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dish_preferences_household_id_template_id_key" ON "dish_preferences"("household_id", "template_id");

-- AddForeignKey
ALTER TABLE "dish_preferences" ADD CONSTRAINT "dish_preferences_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_preferences" ADD CONSTRAINT "dish_preferences_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "recipe_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
