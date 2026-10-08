ALTER TABLE occurrences
  ADD COLUMN IF NOT EXISTS h3_r6 TEXT,
  ADD COLUMN IF NOT EXISTS h3_r7 TEXT,
  ADD COLUMN IF NOT EXISTS h3_r8 TEXT;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r6_idx ON occurrences (dataset_id, h3_r6);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r7_idx ON occurrences (dataset_id, h3_r7);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r8_idx ON occurrences (dataset_id, h3_r8);

-- statement-breakpoint
ALTER TABLE media
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS sync_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- statement-breakpoint
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_sync_status_check;

-- statement-breakpoint
ALTER TABLE media
  ADD CONSTRAINT media_sync_status_check
  CHECK (sync_status IN ('pending', 'processing', 'failed', 'synced'));

-- statement-breakpoint
UPDATE media
SET sync_status = 'synced', synced_at = COALESCE(synced_at, NOW())
WHERE imagekit_url IS NOT NULL AND sync_status <> 'synced';

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS media_sync_queue_idx
  ON media (dataset_id, sync_status, sync_next_attempt_at, id)
  WHERE imagekit_url IS NULL;

-- statement-breakpoint
UPDATE occurrences o
SET raw_data = o.raw_data || jsonb_strip_nulls(jsonb_build_object(
  'kingdom', s.kingdom,
  'phylum', s.phylum,
  'className', s.class_name,
  'orderName', s.order_name,
  'family', s.family,
  'genus', s.genus,
  'speciesName', s.scientific_name,
  'taxonRank', s.taxon_rank
))
FROM species s
WHERE o.species_key = s.species_key;
