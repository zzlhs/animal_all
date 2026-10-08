ALTER TABLE datasets
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision UUID NOT NULL DEFAULT gen_random_uuid();

-- statement-breakpoint
ALTER TABLE datasets DROP CONSTRAINT IF EXISTS datasets_status_check;

-- statement-breakpoint
ALTER TABLE datasets
  ADD CONSTRAINT datasets_status_check
  CHECK (status IN ('importing', 'ready', 'failed', 'retired'));

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS datasets_revision_uidx
  ON datasets (revision);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS datasets_retired_at_idx
  ON datasets (retired_at)
  WHERE status = 'retired';
