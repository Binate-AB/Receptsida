-- CreateEnum
CREATE TYPE "CookingSkill" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "AgeCategory" AS ENUM ('BABY', 'CHILD', 'TEEN', 'ADULT', 'SENIOR');

-- CreateEnum
CREATE TYPE "SpiceTolerance" AS ENUM ('NONE', 'MILD', 'MEDIUM', 'HOT');

-- CreateEnum
CREATE TYPE "RecommendationSlot" AS ENUM ('NISSE', 'EASIEST', 'CHEAPEST');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ListStatus" AS ENUM ('ACTIVE', 'DONE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Mitt hushåll',
    "cooking_skill" "CookingSkill" NOT NULL DEFAULT 'INTERMEDIATE',
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age_category" "AgeCategory" NOT NULL DEFAULT 'ADULT',
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dietary_restrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disliked_ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spice_tolerance" "SpiceTolerance" NOT NULL DEFAULT 'MEDIUM',
    "portion_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "is_default_present" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_templates" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficulty" TEXT NOT NULL DEFAULT 'Enkel',
    "total_time_min" INTEGER NOT NULL,
    "active_time_min" INTEGER NOT NULL,
    "passive_time_min" INTEGER NOT NULL DEFAULT 0,
    "servings_base" INTEGER NOT NULL DEFAULT 4,
    "cost_per_portion_min" INTEGER NOT NULL,
    "cost_per_portion_max" INTEGER NOT NULL,
    "child_friendly" INTEGER NOT NULL DEFAULT 2,
    "effort_score" INTEGER NOT NULL DEFAULT 2,
    "dish_load" INTEGER NOT NULL DEFAULT 2,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dietary_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "equipment_required" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spice_level" INTEGER NOT NULL DEFAULT 0,
    "has_child_adult_branch" BOOLEAN NOT NULL DEFAULT false,
    "ingredients" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "variants" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_requests" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "raw_text" TEXT,
    "chips" JSONB,
    "parsed" JSONB NOT NULL,
    "parse_source" TEXT NOT NULL DEFAULT 'ai',
    "ai_confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_recommendations" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "slot" "RecommendationSlot" NOT NULL,
    "motivation" TEXT,
    "computed" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "recommendation_id" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Inköpslista',
    "status" "ListStatus" NOT NULL DEFAULT 'ACTIVE',
    "est_cost_min" INTEGER,
    "est_cost_max" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "aisle" TEXT NOT NULL DEFAULT 'Övrigt',
    "necessary" BOOLEAN NOT NULL DEFAULT true,
    "probably_home" BOOLEAN NOT NULL DEFAULT false,
    "est_price" INTEGER,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooking_sessions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "recommendation_id" TEXT,
    "template_id" TEXT,
    "recipe_data" JSONB NOT NULL,
    "timeline" JSONB NOT NULL,
    "current_step_index" INTEGER NOT NULL DEFAULT 0,
    "branch_state" JSONB,
    "conversation" JSONB NOT NULL DEFAULT '[]',
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cooking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_feedback" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "household_id" TEXT NOT NULL,
    "template_id" TEXT,
    "cooked" BOOLEAN NOT NULL DEFAULT true,
    "actual_time_min" INTEGER,
    "cook_again" BOOLEAN,
    "avoid" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "member_ratings" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "household_id" TEXT,
    "name" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "households_owner_id_key" ON "households"("owner_id");

-- CreateIndex
CREATE INDEX "household_members_household_id_idx" ON "household_members"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_household_id_canonical_key" ON "inventory_items"("household_id", "canonical");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_templates_slug_key" ON "recipe_templates"("slug");

-- CreateIndex
CREATE INDEX "recipe_templates_is_active_idx" ON "recipe_templates"("is_active");

-- CreateIndex
CREATE INDEX "meal_requests_household_id_created_at_idx" ON "meal_requests"("household_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "meal_recommendations_request_id_idx" ON "meal_recommendations"("request_id");

-- CreateIndex
CREATE INDEX "shopping_lists_household_id_status_idx" ON "shopping_lists"("household_id", "status");

-- CreateIndex
CREATE INDEX "shopping_list_items_list_id_idx" ON "shopping_list_items"("list_id");

-- CreateIndex
CREATE INDEX "cooking_sessions_household_id_status_idx" ON "cooking_sessions"("household_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "meal_feedback_session_id_key" ON "meal_feedback"("session_id");

-- CreateIndex
CREATE INDEX "meal_feedback_household_id_template_id_idx" ON "meal_feedback"("household_id", "template_id");

-- CreateIndex
CREATE INDEX "analytics_events_name_created_at_idx" ON "analytics_events"("name", "created_at" DESC);

-- CreateIndex
CREATE INDEX "analytics_events_household_id_created_at_idx" ON "analytics_events"("household_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_requests" ADD CONSTRAINT "meal_requests_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_recommendations" ADD CONSTRAINT "meal_recommendations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "meal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_recommendations" ADD CONSTRAINT "meal_recommendations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "recipe_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "meal_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "meal_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "recipe_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cooking_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
