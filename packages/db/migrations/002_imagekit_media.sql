ALTER TABLE media
  ADD COLUMN IF NOT EXISTS imagekit_file_id TEXT;
