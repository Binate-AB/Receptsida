-- Enable RLS on the V2 tables (matches the deny-all convention of all
-- earlier tables: no policies — PostgREST access denied, while the
-- Express backend connects as the table owner and is unaffected).
ALTER TABLE "dinner_assumptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household_ingredient_confidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dish_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "household_memberships" ENABLE ROW LEVEL SECURITY;
