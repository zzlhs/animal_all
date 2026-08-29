CREATE INDEX IF NOT EXISTS occurrences_dataset_coordinates_gbif_idx
  ON occurrences (dataset_id, decimal_latitude, decimal_longitude, gbif_id)
  WHERE decimal_latitude IS NOT NULL AND decimal_longitude IS NOT NULL;
