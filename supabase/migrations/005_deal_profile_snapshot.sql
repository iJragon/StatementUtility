-- Store the investor profile values used when a deal was last analyzed.
-- Allows detecting when the current profile has drifted from the analysis snapshot.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS profile_snapshot JSONB;
