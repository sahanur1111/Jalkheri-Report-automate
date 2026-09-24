/*
# Create Jalkheri Reports Schema

## Purpose
Persist Jalkheri DCS Excel uploads and their extracted tag readings so reports
are saved across sessions and can be viewed historically instead of being lost
when the page is reloaded.

## New Tables

### 1. reports
Stores one row per uploaded Excel file.
- `id` (uuid, primary key)
- `sheet_name` (text) — name of the sheet processed, e.g. "Jalkheri"
- `report_date` (text) — date extracted from the Excel header cell (row 5, col E)
- `tag_count` (integer) — number of tags extracted
- `summary` (jsonb) — KPI summary object (TG Load, Main Steam Flow, etc.)
- `created_at` (timestamptz) — when the upload was processed

### 2. tag_readings
Stores individual tag data rows belonging to a report.
- `id` (uuid, primary key)
- `report_id` (uuid, foreign key → reports.id, ON DELETE CASCADE)
- `tag` (text) — the tag identifier, e.g. "MW001"
- `description` (text) — human-readable description
- `unit` (text) — unit of measurement, e.g. "MW", "TPH"
- `value` (numeric, nullable) — the latest hourly value; nullable for non-numeric tags
- `raw_value` (text, nullable) — original value as text (preserves non-numeric values)
- `created_at` (timestamptz)

## Indexes
- `tag_readings_report_id_idx` — fast lookup of all readings for a given report
- `tag_readings_tag_idx` — fast searching/filtering by tag name

## Security
- Row Level Security enabled on both tables.
- This is a single-tenant app with NO sign-in screen, so policies allow both
  `anon` and `authenticated` roles to perform all CRUD operations (data is
  intentionally shared/public).

## Important Notes
1. The `value` column is numeric for KPI calculations; `raw_value` preserves
   the original string for tags that are not numeric.
2. Deleting a report automatically removes its tag readings via CASCADE.
3. Policies use `USING (true)` / `WITH CHECK (true)` because this is a
   no-auth single-tenant app where all data is intentionally public.
*/

CREATE TABLE IF NOT EXISTS reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_name  text NOT NULL,
  report_date text,
  tag_count   integer NOT NULL DEFAULT 0,
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tag_readings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  tag         text NOT NULL,
  description text NOT NULL DEFAULT '',
  unit        text NOT NULL DEFAULT '',
  value       numeric,
  raw_value   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tag_readings_report_id_idx ON tag_readings(report_id);
CREATE INDEX IF NOT EXISTS tag_readings_tag_idx ON tag_readings(tag);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_readings ENABLE ROW LEVEL SECURITY;

-- reports policies (single-tenant, no auth — data is intentionally public)
DROP POLICY IF EXISTS "anon_select_reports" ON reports;
CREATE POLICY "anon_select_reports" ON reports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reports" ON reports;
CREATE POLICY "anon_insert_reports" ON reports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_reports" ON reports;
CREATE POLICY "anon_update_reports" ON reports FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_reports" ON reports;
CREATE POLICY "anon_delete_reports" ON reports FOR DELETE
  TO anon, authenticated USING (true);

-- tag_readings policies (single-tenant, no auth — data is intentionally public)
DROP POLICY IF EXISTS "anon_select_tag_readings" ON tag_readings;
CREATE POLICY "anon_select_tag_readings" ON tag_readings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_tag_readings" ON tag_readings;
CREATE POLICY "anon_insert_tag_readings" ON tag_readings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_tag_readings" ON tag_readings;
CREATE POLICY "anon_update_tag_readings" ON tag_readings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_tag_readings" ON tag_readings;
CREATE POLICY "anon_delete_tag_readings" ON tag_readings FOR DELETE
  TO anon, authenticated USING (true);
