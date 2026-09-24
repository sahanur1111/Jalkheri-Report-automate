import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Report = {
  id: string
  sheet_name: string
  report_date: string | null
  tag_count: number
  summary: Record<string, string | number>
  time_columns: string[]
  created_at: string
}

export type TagReading = {
  id: string
  report_id: string
  tag: string
  description: string
  unit: string
  value: number | null
  raw_value: string | null
  values_by_time: Record<string, number | string>
  created_at: string
}

export type ReportWithReadings = Report & {
  tag_readings: TagReading[]
}
