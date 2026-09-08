-- Rename image URL columns to be storage-agnostic
ALTER TABLE cards RENAME COLUMN front_s3_url TO front_image_url;
ALTER TABLE cards RENAME COLUMN back_s3_url TO back_image_url;
