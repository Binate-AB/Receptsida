-- §28: optional per-dish override of the age-default portion factor for
-- BABY/CHILD eaters (member-explicit factors always win). Additive.
ALTER TABLE "recipe_templates" ADD COLUMN "child_portion_factor" DOUBLE PRECISION;
