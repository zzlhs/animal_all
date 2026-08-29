CREATE EXTENSION IF NOT EXISTS postgis;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS datasets (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  source_archive TEXT NOT NULL,
  kingdom_filter TEXT NOT NULL DEFAULT 'Animalia',
  status TEXT NOT NULL DEFAULT 'importing' CHECK (status IN ('importing', 'ready', 'failed')),
  occurrence_count BIGINT NOT NULL DEFAULT 0,
  plottable_count BIGINT NOT NULL DEFAULT 0,
  species_count BIGINT NOT NULL DEFAULT 0,
  media_count BIGINT NOT NULL DEFAULT 0,
  aves_count BIGINT NOT NULL DEFAULT 0,
  insecta_count BIGINT NOT NULL DEFAULT 0,
  audio_occurrence_count BIGINT NOT NULL DEFAULT 0,
  import_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS species (
  species_key BIGINT PRIMARY KEY,
  scientific_name TEXT NOT NULL,
  accepted_scientific_name TEXT,
  kingdom TEXT,
  phylum TEXT,
  class_name TEXT,
  order_name TEXT,
  family TEXT,
  genus TEXT,
  taxon_rank TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS occurrences (
  dataset_id BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  gbif_id BIGINT NOT NULL,
  occurrence_id TEXT,
  species_key BIGINT REFERENCES species(species_key),
  scientific_name TEXT NOT NULL,
  dataset_key UUID,
  dataset_name TEXT,
  country_code TEXT,
  continent TEXT,
  state_province TEXT,
  county TEXT,
  municipality TEXT,
  locality TEXT,
  decimal_latitude DOUBLE PRECISION,
  decimal_longitude DOUBLE PRECISION,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN decimal_latitude IS NULL OR decimal_longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(decimal_longitude, decimal_latitude), 4326)
    END
  ) STORED,
  coordinate_uncertainty_meters DOUBLE PRECISION,
  coordinate_precision DOUBLE PRECISION,
  event_date TEXT,
  event_year INTEGER,
  basis_of_record TEXT,
  occurrence_status TEXT,
  license TEXT,
  references_url TEXT,
  rights_holder TEXT,
  h3_r2 TEXT,
  h3_r3 TEXT,
  h3_r4 TEXT,
  h3_r5 TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (dataset_id, gbif_id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_geom_gix ON occurrences USING GIST (geom);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_dataset_species_idx ON occurrences (dataset_id, species_key, gbif_id);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r2_idx ON occurrences (dataset_id, h3_r2);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r3_idx ON occurrences (dataset_id, h3_r3);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r4_idx ON occurrences (dataset_id, h3_r4);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS occurrences_dataset_h3_r5_idx ON occurrences (dataset_id, h3_r5);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS media (
  id BIGSERIAL PRIMARY KEY,
  dataset_id BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  occurrence_gbif_id BIGINT NOT NULL,
  media_type TEXT,
  format TEXT,
  identifier TEXT NOT NULL,
  source_url TEXT,
  references_url TEXT,
  title TEXT,
  description TEXT,
  created TEXT,
  creator TEXT,
  contributor TEXT,
  publisher TEXT,
  license TEXT,
  rights_holder TEXT,
  imagekit_url TEXT,
  imagekit_file_id TEXT,
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (dataset_id, occurrence_gbif_id)
    REFERENCES occurrences(dataset_id, gbif_id)
    ON DELETE CASCADE,
  UNIQUE (dataset_id, occurrence_gbif_id, identifier)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS media_dataset_occurrence_idx ON media (dataset_id, occurrence_gbif_id);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS media_dataset_type_idx ON media (dataset_id, media_type);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS map_cells (
  dataset_id BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  resolution SMALLINT NOT NULL,
  cell_id TEXT NOT NULL,
  anchor geometry(Point, 4326) NOT NULL,
  representative_occurrence_id BIGINT NOT NULL,
  occurrence_count BIGINT NOT NULL,
  species_count BIGINT NOT NULL,
  image_count BIGINT NOT NULL DEFAULT 0,
  audio_count BIGINT NOT NULL DEFAULT 0,
  video_count BIGINT NOT NULL DEFAULT 0,
  aves_count BIGINT NOT NULL DEFAULT 0,
  insecta_count BIGINT NOT NULL DEFAULT 0,
  audio_occurrence_count BIGINT NOT NULL DEFAULT 0,
  first_year INTEGER,
  last_year INTEGER,
  PRIMARY KEY (dataset_id, resolution, cell_id)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS map_cells_anchor_gix ON map_cells USING GIST (anchor);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS species_cells (
  dataset_id BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  resolution SMALLINT NOT NULL,
  cell_id TEXT NOT NULL,
  species_key BIGINT NOT NULL REFERENCES species(species_key),
  anchor geometry(Point, 4326) NOT NULL,
  representative_occurrence_id BIGINT NOT NULL,
  occurrence_count BIGINT NOT NULL,
  image_count BIGINT NOT NULL DEFAULT 0,
  audio_count BIGINT NOT NULL DEFAULT 0,
  video_count BIGINT NOT NULL DEFAULT 0,
  first_year INTEGER,
  last_year INTEGER,
  PRIMARY KEY (dataset_id, resolution, cell_id, species_key)
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS species_cells_anchor_gix ON species_cells USING GIST (anchor);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS species_cells_dataset_species_idx ON species_cells (dataset_id, species_key, cell_id);
