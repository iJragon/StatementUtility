-- Add notes field to deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS notes TEXT;
