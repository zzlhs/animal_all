CREATE TABLE audio_download_jobs (
  id BIGSERIAL PRIMARY KEY,
  source_hash TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  media_id BIGINT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL CHECK (priority IN (50, 100)),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'downloading', 'uploading', 'ready', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  received_bytes BIGINT NOT NULL DEFAULT 0,
  total_bytes BIGINT,
  stored_bytes BIGINT NOT NULL DEFAULT 0,
  playback_url TEXT,
  imagekit_file_id TEXT,
  error_code TEXT,
  error_message TEXT,
  next_attempt_at TIMESTAMPTZ,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (status <> 'ready' OR playback_url IS NOT NULL)
);

CREATE INDEX audio_download_jobs_claim_idx ON audio_download_jobs (priority DESC, created_at, id)
  WHERE status IN ('queued', 'downloading', 'uploading');

CREATE INDEX media_audio_source_idx ON media (identifier)
  WHERE LOWER(COALESCE(format, '')) LIKE 'audio/%' OR LOWER(COALESCE(media_type, '')) IN ('sound', 'audio');
