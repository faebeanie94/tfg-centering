-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_name ON submissions(name);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);

-- Cards table
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  card_number INT NOT NULL,
  front_s3_url VARCHAR(512),
  back_s3_url VARCHAR(512),
  front_local_path VARCHAR(512),
  back_local_path VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, card_number)
);

CREATE INDEX IF NOT EXISTS idx_cards_submission_id ON cards(submission_id);
CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);

-- Card metadata table
CREATE TABLE IF NOT EXISTS card_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
  front_grade VARCHAR(50),
  back_grade VARCHAR(50),
  condition VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure unique constraint on card_id for ON CONFLICT support
-- Drop old index if it exists to avoid conflicts
DROP INDEX IF EXISTS idx_card_metadata_card_id;
-- Create unique index for ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_metadata_card_id ON card_metadata(card_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_submissions_updated_at ON submissions;
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cards_updated_at ON cards;
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_card_metadata_updated_at ON card_metadata;
CREATE TRIGGER update_card_metadata_updated_at BEFORE UPDATE ON card_metadata
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add centering measurements to card_metadata
ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS front_left_mm NUMERIC(10, 2);
ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS front_right_mm NUMERIC(10, 2);
ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS front_top_mm NUMERIC(10, 2);
ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS front_bottom_mm NUMERIC(10, 2);
ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS back_left_mm NUMERIC(10, 2);
ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS back_right_mm NUMERIC(10, 2);
ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS back_top_mm NUMERIC(10, 2);
ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS back_bottom_mm NUMERIC(10, 2);
