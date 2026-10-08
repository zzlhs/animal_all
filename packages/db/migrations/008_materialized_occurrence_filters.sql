-- Backfill previously imported snapshots; media counts count assets, has_audio counts records.
WITH counts AS (
  SELECT o.dataset_id, o.gbif_id,
    COUNT(m.id) FILTER (WHERE LOWER(COALESCE(m.media_type, '')) LIKE '%stillimage%' OR LOWER(COALESCE(m.format, '')) LIKE 'image/%') AS images,
    COUNT(m.id) FILTER (WHERE LOWER(COALESCE(m.media_type, '')) LIKE '%sound%' OR LOWER(COALESCE(m.format, '')) LIKE 'audio/%') AS audio,
    COUNT(m.id) FILTER (WHERE LOWER(COALESCE(m.media_type, '')) LIKE '%movingimage%' OR LOWER(COALESCE(m.media_type, '')) LIKE '%video%' OR LOWER(COALESCE(m.format, '')) LIKE 'video/%') AS video
  FROM occurrences o LEFT JOIN media m ON m.dataset_id = o.dataset_id AND m.occurrence_gbif_id = o.gbif_id
  GROUP BY o.dataset_id, o.gbif_id
)
UPDATE occurrences o SET has_audio = c.audio > 0, image_count = c.images, audio_count = c.audio, video_count = c.video
FROM counts c WHERE o.dataset_id = c.dataset_id AND o.gbif_id = c.gbif_id;

UPDATE occurrences o SET class_name_snapshot = COALESCE(NULLIF(o.raw_data->>'className', ''), s.class_name)
FROM species s WHERE s.species_key = o.species_key AND o.class_name_snapshot IS NULL;
UPDATE occurrences SET class_name_snapshot = NULLIF(raw_data->>'className', '') WHERE class_name_snapshot IS NULL;

UPDATE species_cells sc SET audio_occurrence_count = (
  SELECT COUNT(*) FROM occurrences o WHERE o.dataset_id = sc.dataset_id AND o.species_key = sc.species_key
    AND o.has_audio AND CASE sc.resolution WHEN 2 THEN o.h3_r2 WHEN 3 THEN o.h3_r3 WHEN 4 THEN o.h3_r4
      WHEN 5 THEN o.h3_r5 WHEN 6 THEN o.h3_r6 WHEN 7 THEN o.h3_r7 WHEN 8 THEN o.h3_r8 END = sc.cell_id
);
