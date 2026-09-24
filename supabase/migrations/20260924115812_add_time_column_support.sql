/*
# Add Time Column Support to Reports and Tag Readings

## Purpose
The Jalkheri Excel sheet contains multiple hourly time columns. Previously only the
last column was stored. This migration adds support for reading ALL time columns so
the user can select any hour and view the corresponding tag values dynamically.

## Changes

### reports table
- Added `time_columns` (jsonb) — array of time column labels detected from the
  Excel header row (e.g. ["01:00", "02:00", ...]). Defaults to empty array.

### tag_readings table
- Added `values_by_time` (jsonb) — object mapping each time label to the tag's
  value at that time, e.g. {"01:00": 45.2, "02:00": 46.1}. Defaults to empty object.

## Important Notes
1. Non-destructive — no data is lost. Existing reports keep working with empty
   time_columns and values_by_time.
2. New uploads will populate all fields including per-time values.
*/

ALTER TABLE reports ADD COLUMN IF NOT EXISTS time_columns jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tag_readings ADD COLUMN IF NOT EXISTS values_by_time jsonb NOT NULL DEFAULT '{}'::jsonb;
