-- Map releases and atomic release pointer table
CREATE TABLE IF NOT EXISTS map_releases (
  id BIGSERIAL PRIMARY KEY,
  dataset_revision UUID NOT NULL REFERENCES datasets(revision),
  pmtiles_url TEXT NOT NULL,
  source_layer TEXT NOT NULL,
  feature_schema_version INTEGER NOT NULL,
  object_sha256 TEXT NOT NULL,
  object_size_bytes BIGINT NOT NULL CHECK (object_size_bytes > 0),
  manifest JSONB NOT NULL,
  validated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS active_map_release (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  release_id BIGINT NOT NULL REFERENCES map_releases(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- New fields on occurrences for materializing filter indicators & snapshots
ALTER TABLE occurrences
  ADD COLUMN IF NOT EXISTS class_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS has_audio BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_count INTEGER NOT NULL DEFAULT 0;

-- New audio occurrence count on species_cells for accurate occurrence-level count
ALTER TABLE species_cells
  ADD COLUMN IF NOT EXISTS audio_occurrence_count BIGINT NOT NULL DEFAULT 0;

-- High-performance composite indexes
CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r8_gbif_idx
  ON occurrences (dataset_id, h3_r8, gbif_id);

CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r8_species_gbif_idx
  ON occurrences (dataset_id, h3_r8, species_key, gbif_id);

CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r8_audio_gbif_idx
  ON occurrences (dataset_id, h3_r8, gbif_id)
  WHERE has_audio;
