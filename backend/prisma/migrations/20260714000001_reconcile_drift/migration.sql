-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PRIVACY_POLICY', 'COOKIES', 'LOCATION', 'MARKETING');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('LUNCH', 'DINNER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auth_provider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "deletion_requested_at" TIMESTAMP(3),
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gdpr_consent_at" TIMESTAMP(3),
ADD COLUMN     "location_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboarding_done" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider_id" TEXT,
ADD COLUMN     "reset_expires" TIMESTAMP(3),
ADD COLUMN     "reset_token" TEXT,
ADD COLUMN     "verify_expires" TIMESTAMP(3),
ADD COLUMN     "verify_token" TEXT,
ADD COLUMN     "welcome_mail_sent" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "week_start" TIMESTAMP(3) NOT NULL,
    "household_size" INTEGER NOT NULL DEFAULT 2,
    "preferences" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_days" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "day_index" INTEGER NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "title" TEXT NOT NULL,
    "recipe_data" JSONB NOT NULL,
    "recipe_id" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraped_recipes" (
    "id" TEXT NOT NULL,
    "url_hash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_url" TEXT NOT NULL,
    "source_domain" TEXT NOT NULL,
    "image_url" TEXT,
    "total_time" INTEGER,
    "prep_time" INTEGER,
    "cook_time" INTEGER,
    "servings" TEXT,
    "servings_num" INTEGER,
    "category" TEXT,
    "cuisine" TEXT,
    "tags" TEXT[],
    "rating" DOUBLE PRECISION,
    "rating_count" INTEGER,
    "author" TEXT,
    "raw_json_ld" JSONB,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraped_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraped_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" TEXT,
    "unit" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scraped_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraped_steps" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scraped_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "synonyms" TEXT[],
    "related_words" TEXT[],
    "emoji" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_jobs" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_urls" INTEGER NOT NULL DEFAULT 0,
    "scraped_urls" INTEGER NOT NULL DEFAULT 0,
    "failed_urls" INTEGER NOT NULL DEFAULT 0,
    "new_recipes" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_records_user_id_type_idx" ON "consent_records"("user_id", "type");

-- CreateIndex
CREATE INDEX "meal_plans_user_id_week_start_idx" ON "meal_plans"("user_id", "week_start" DESC);

-- CreateIndex
CREATE INDEX "meal_plan_days_plan_id_idx" ON "meal_plan_days"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "scraped_recipes_url_hash_key" ON "scraped_recipes"("url_hash");

-- CreateIndex
CREATE UNIQUE INDEX "scraped_recipes_source_url_key" ON "scraped_recipes"("source_url");

-- CreateIndex
CREATE INDEX "scraped_recipes_source_domain_idx" ON "scraped_recipes"("source_domain");

-- CreateIndex
CREATE INDEX "scraped_recipes_category_idx" ON "scraped_recipes"("category");

-- CreateIndex
CREATE INDEX "scraped_recipes_scraped_at_idx" ON "scraped_recipes"("scraped_at");

-- CreateIndex
CREATE INDEX "scraped_ingredients_recipe_id_idx" ON "scraped_ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "scraped_ingredients_name_idx" ON "scraped_ingredients"("name");

-- CreateIndex
CREATE INDEX "scraped_steps_recipe_id_idx" ON "scraped_steps"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_words_word_key" ON "recipe_words"("word");

-- CreateIndex
CREATE INDEX "recipe_words_canonical_idx" ON "recipe_words"("canonical");

-- CreateIndex
CREATE INDEX "recipe_words_category_idx" ON "recipe_words"("category");

-- CreateIndex
CREATE INDEX "recipe_words_frequency_idx" ON "recipe_words"("frequency" DESC);

-- CreateIndex
CREATE INDEX "scrape_jobs_domain_idx" ON "scrape_jobs"("domain");

-- CreateIndex
CREATE INDEX "scrape_jobs_status_idx" ON "scrape_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_verify_token_key" ON "users"("verify_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_key" ON "users"("reset_token");

-- CreateIndex
CREATE INDEX "users_auth_provider_provider_id_idx" ON "users"("auth_provider", "provider_id");

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_days" ADD CONSTRAINT "meal_plan_days_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_days" ADD CONSTRAINT "meal_plan_days_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraped_ingredients" ADD CONSTRAINT "scraped_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "scraped_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraped_steps" ADD CONSTRAINT "scraped_steps_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "scraped_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

