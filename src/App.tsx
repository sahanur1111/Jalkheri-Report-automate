import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Upload,
  Search,
  FileSpreadsheet,
  Trash2,
  Loader2,
  Gauge,
  Clock,
  Tag,
  TrendingUp,
  AlertCircle,
  History,
  ChevronRight,
  Clock3,
  ClipboardList,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { supabase, type Report, type TagReading } from './lib/supabase'
import { parseJalkheriExcel, type ParsedTag, type ParsedReport } from './lib/excelParser'

type ActiveReport = {
  report: Report
  readings: TagReading[]
}

type PlantKpiRow = {
  tag: string
  plant: string
  unit: string
  fallback: number
  computed?: 'turbine_ssc'
}

type EconomizerRow = {
  parameter: string
  unit: string
  fallback: number
  terms?: string[]
  computed?: 'feed_delta' | 'flue_delta' | 'effectiveness'
}

const PLANT_KPI_ROWS: PlantKpiRow[] = [
  { tag: 'MW001', plant: 'TG Load', unit: 'MW', fallback: 10.31 },
  { tag: 'LBA10FF001_TON', plant: 'Boiler MS flow', unit: 'TNE/H', fallback: 43.8 },
  { tag: 'LBA10CP001XQ01', plant: 'Boiler MS Pressure', unit: 'kg/cm²', fallback: 61.2 },
  { tag: 'LBA10CT001XQ01', plant: 'Boiler MS Temperature', unit: '°C', fallback: 447 },
  { tag: 'LAA10CT001XQ01', plant: 'Final feed water temperature', unit: '°C', fallback: 116 },
  { tag: 'HAH30CT703CXQ01', plant: 'Steam temperature after SH3', unit: '°C', fallback: 435 },
  { tag: 'LBA10CP011XQ01', plant: 'TG I/L Steam Pr.', unit: 'kg/cm²', fallback: 58.9 },
  { tag: 'LBA10CT011XQ01', plant: 'TG I/L Steam Temp', unit: '°C', fallback: 445 },
  { tag: 'PI109', plant: 'Wheel chamber Pressure', unit: 'kg/cm²', fallback: 36.1 },
  { tag: '', plant: 'Turbine SSC', unit: 'TNE/H', fallback: 4.25, computed: 'turbine_ssc' },
  { tag: 'PI522A', plant: 'Turbine vacuum-Avg', unit: 'kg/cm²', fallback: -0.88 },
  { tag: 'HLA30CP001XQ01', plant: 'Combustion air pressure after APH', unit: 'MMWC', fallback: 395.5 },
  { tag: 'HLA30CT001XQ01', plant: 'Combustion air temperature after APH', unit: '°C', fallback: 200 },
  { tag: 'HNA10CO901', plant: 'Oxygen %', unit: '%', fallback: 8.4 },
  { tag: 'HBK12CT001XQ01', plant: '3rd Pass Flue gas temperature', unit: '°C', fallback: 479 },
  { tag: 'HBK15CT001XQ01', plant: 'SH 1.2 oultate Temp', unit: '°C', fallback: 356 },
  { tag: 'HAH30CT748XQ01', plant: 'MTM SH3 (Max)', unit: '°C', fallback: 497 },
  { tag: 'HAH40CT748XQ01', plant: 'MTM SH4 (Max)', unit: '°C', fallback: 482 },
]

const ECONOMIZER_ROWS: EconomizerRow[] = [
  { parameter: 'TG- Load', unit: 'MW', fallback: 10.31, terms: ['MW001'] },
  { parameter: 'Feed Water temp ECO O/L', unit: '°C', fallback: 228, terms: ['ECO O/L', 'ECONOMIZER O/L'] },
  { parameter: 'Boiler Drum steam O/L temp', unit: '°C', fallback: 283, terms: ['DRUM STM TEMP', 'DRUM STEAM'] },
  { parameter: 'Feed Water temp at ECO I/L', unit: '°C', fallback: 140, terms: ['ECO I/L', 'ECONOMIZER I/L'] },
  { parameter: 'Feedwater Delta T', unit: '°C', fallback: 88, computed: 'feed_delta' },
  { parameter: 'Flue Gas inlet Temp. to ECO & HP FGC 4,5', unit: '°C', fallback: 347, terms: ['FLUE GAS INLET', 'FGC 4,5 INLET'] },
  { parameter: 'Flue Gas Outlet Temp. to ECO & HP FGC 4,5', unit: '°C', fallback: 182, terms: ['FLUE GAS OUTLET', 'FGC 4,5 OUTLET'] },
  { parameter: 'Flue Gas Delta T', unit: '°C', fallback: 165, computed: 'flue_delta' },
  { parameter: 'Calculated Effectiveness', unit: '%', fallback: 42.71, computed: 'effectiveness' },
]

const KPI_TERMS: Record<string, string> = {
  'TG Load (MW)': 'MW001',
  'Main Steam Flow (TPH)': 'MAIN STM FLOW 1',
  'Live Steam Pressure': 'LIVE STM PR',
  'Main Steam Temperature': 'LIVE STM TEMP',
  'Furnace Draft': 'FURNACE DRAFT',
}

function formatValue(v: string | number): string | number {
  if (typeof v === 'number') {
    return parseFloat(v.toFixed(2))
  }
  const n = parseFloat(v)
  if (!isNaN(n)) {
    return parseFloat(n.toFixed(2))
  }
  return v
}

function getDefaultTime(times: string[]): string {
  if (times.length === 0) return ''
  const avg = times.find((t) => t.toLowerCase().includes('avg') || t.toLowerCase().includes('average'))
  return avg || times[times.length - 1]
}

export default function App() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<ActiveReport | null>(null)
  const [search, setSearch] = useState('')
  const [history, setHistory] = useState<Report[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'plant-kpi' | 'economizer'>('dashboard')

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    const { data, error: err } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
    } else {
      setHistory(data as Report[])
    }
    setLoadingHistory(false)
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const parsed: ParsedReport = await parseJalkheriExcel(file)

      const { data: reportData, error: reportErr } = await supabase
        .from('reports')
        .insert({
          sheet_name: parsed.sheetName,
          report_date: parsed.reportDate || null,
          tag_count: parsed.tagCount,
          summary: parsed.summary,
          time_columns: parsed.timeColumns,
        })
        .select()
        .single()

      if (reportErr) throw new Error(reportErr.message)

      const report = reportData as Report

      const readingRows = parsed.rows.map((r: ParsedTag) => ({
        report_id: report.id,
        tag: r.tag,
        description: r.description,
        unit: r.unit,
        value: r.value,
        raw_value: r.raw_value,
        values_by_time: r.values_by_time,
      }))

      const { data: readingData, error: readingErr } = await supabase
        .from('tag_readings')
        .insert(readingRows)
        .select()

      if (readingErr) throw new Error(readingErr.message)

      setActive({ report, readings: readingData as TagReading[] })
      setSearch('')
      setSelectedTime(getDefaultTime(parsed.timeColumns))
      await loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process the Excel file')
    } finally {
      setUploading(false)
    }
  }

  const loadReport = async (report: Report) => {
    setError(null)
    const { data, error: err } = await supabase
      .from('tag_readings')
      .select('*')
      .eq('report_id', report.id)
      .order('tag', { ascending: true })
    if (err) {
      setError(err.message)
      return
    }
    setActive({ report, readings: data as TagReading[] })
    setSearch('')
    const times = report.time_columns || []
    setSelectedTime(getDefaultTime(times))
    setShowHistory(false)
  }

  const deleteReport = async (id: string) => {
    const { error: err } = await supabase.from('reports').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    if (active?.report.id === id) setActive(null)
    await loadHistory()
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const timeColumns = active?.report.time_columns || []

  // Recompute KPIs dynamically based on the selected time
  const dynamicSummary = useMemo(() => {
    if (!active || !selectedTime) return active ? active.report.summary : {}
    const readings = active.readings
    const result: Record<string, string | number> = {}
    for (const [label, term] of Object.entries(KPI_TERMS)) {
      const match = readings.find(
        (r) =>
          (r.tag + ' ' + r.description).toLowerCase().includes(term.toLowerCase()) &&
          r.values_by_time &&
          r.values_by_time[selectedTime] !== undefined &&
          r.values_by_time[selectedTime] !== null
      )
      if (match) {
        const v = match.values_by_time[selectedTime]
        result[label] = formatValue(v)
      } else {
        result[label] = '—'
      }
    }
    return result
  }, [active, selectedTime])

  // Get value for a reading at the selected time
  const getValueAtTime = (r: TagReading): string | number => {
    if (!selectedTime || !r.values_by_time) {
      return r.value !== null ? r.value : r.raw_value || '—'
    }
    const v = r.values_by_time[selectedTime]
    if (v === undefined || v === null) return '—'
    return formatValue(v)
  }

  const filteredReadings = active
    ? active.readings.filter((r) =>
        (r.tag + ' ' + r.description).toLowerCase().includes(search.toLowerCase())
      )
    : []

  const summaryEntries = active ? Object.entries(dynamicSummary) : []

  const plantKpiDate = active?.report.report_date || '—'

  const findReadingByTerms = (terms: string[]): TagReading | undefined =>
    active?.readings.find((item) =>
      terms.some((term) => `${item.tag} ${item.description}`.toLowerCase().includes(term.toLowerCase()))
    )

  const getNumericReadingValue = (terms: string[], fallback: number): number => {
    const reading = findReadingByTerms(terms)
    if (!reading) return fallback
    const value = getValueAtTime(reading)
    const numericValue = typeof value === 'number' ? value : parseFloat(String(value))
    return isNaN(numericValue) ? fallback : numericValue
  }

  const getNumericValue = (tag: string): number => {
    const reading = active?.readings.find((item) => item.tag.toLowerCase() === tag.toLowerCase())
    if (!reading) return 0
    const v = getValueAtTime(reading)
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return isNaN(n) ? 0 : n
  }

  const plantKpiRows = PLANT_KPI_ROWS.map((row) => {
    if (row.computed === 'turbine_ssc') {
      const msFlow = getNumericValue('LBA10FF001_TON')
      const tgLoad = getNumericValue('MW001')
      const ssc = tgLoad !== 0 ? msFlow / tgLoad : row.fallback
      return { ...row, value: formatValue(ssc) }
    }
    const reading = active?.readings.find((item) => item.tag.toLowerCase() === row.tag.toLowerCase())
    const selectedValue = reading ? getValueAtTime(reading) : row.fallback
    return { ...row, value: selectedValue }
  })

  const economizerBaseValues = {
    feedWaterOutlet: getNumericReadingValue(ECONOMIZER_ROWS[1].terms || [], ECONOMIZER_ROWS[1].fallback),
    drumSteamOutlet: getNumericReadingValue(ECONOMIZER_ROWS[2].terms || [], ECONOMIZER_ROWS[2].fallback),
    feedWaterInlet: getNumericReadingValue(ECONOMIZER_ROWS[3].terms || [], ECONOMIZER_ROWS[3].fallback),
    flueGasInlet: getNumericReadingValue(ECONOMIZER_ROWS[5].terms || [], ECONOMIZER_ROWS[5].fallback),
    flueGasOutlet: getNumericReadingValue(ECONOMIZER_ROWS[6].terms || [], ECONOMIZER_ROWS[6].fallback),
  }

  const economizerRows = ECONOMIZER_ROWS.map((row) => {
    if (row.computed === 'feed_delta') {
      return { ...row, value: economizerBaseValues.feedWaterOutlet - economizerBaseValues.feedWaterInlet }
    }
    if (row.computed === 'flue_delta') {
      return { ...row, value: economizerBaseValues.flueGasInlet - economizerBaseValues.flueGasOutlet }
    }
    if (row.computed === 'effectiveness') {
      const denominator = economizerBaseValues.drumSteamOutlet - economizerBaseValues.feedWaterInlet
      const effectiveness = denominator !== 0
        ? ((economizerBaseValues.feedWaterOutlet - economizerBaseValues.feedWaterInlet) / denominator) * 100
        : row.fallback
      return { ...row, value: effectiveness }
    }
    const fallback = row.parameter === 'TG- Load'
      ? PLANT_KPI_ROWS[0].fallback
      : row.fallback
    const value = row.terms ? getNumericReadingValue(row.terms, fallback) : fallback
    return { ...row, value }
  })

  const [editingDate, setEditingDate] = useState(false)
  const [dateInput, setDateInput] = useState('')

  const startEditDate = () => {
    setDateInput(active?.report.report_date || '')
    setEditingDate(true)
  }

  const saveDate = async () => {
    if (!active) return
    const { error: err } = await supabase
      .from('reports')
      .update({ report_date: dateInput || null })
      .eq('id', active.report.id)
    if (err) {
      setError(err.message)
    } else {
      setActive({ ...active, report: { ...active.report, report_date: dateInput || null } })
      await loadHistory()
    }
    setEditingDate(false)
  }

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Gauge size={24} />
            <span>Jalkheri DCS</span>
          </div>
          <button
            className="toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse' : 'Expand'}
          >
            <ChevronRight size={18} className={sidebarOpen ? 'rotated' : ''} />
          </button>
        </div>

        <div className="sidebar-section">
          <button
            className="history-toggle"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={16} />
            <span>Report History</span>
            <span className="badge">{history.length}</span>
          </button>

          {showHistory && (
            <div className="history-list">
              {loadingHistory && (
                <div className="history-empty">
                  <Loader2 size={16} className="spin" />
                </div>
              )}
              {!loadingHistory && history.length === 0 && (
                <div className="history-empty-text">No reports uploaded yet</div>
              )}
              {history.map((r) => (
                <div
                  key={r.id}
                  className={`history-item ${active?.report.id === r.id ? 'active' : ''}`}
                  onClick={() => loadReport(r)}
                >
                  <FileSpreadsheet size={15} />
                  <div className="history-item-info">
                    <div className="history-item-date">
                      {r.report_date || 'No date'}
                    </div>
                    <div className="history-item-meta">
                      {r.tag_count} tags · {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteReport(r.id)
                    }}
                    title="Delete report"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{currentPage === 'dashboard' ? 'Report Automation Dashboard' : currentPage === 'plant-kpi' ? 'Plant KPI Report' : 'Economizer Effectiveness Report'}</h1>
            <div className="page-tabs">
              <button
                className={`page-tab ${currentPage === 'dashboard' ? 'active' : ''}`}
                onClick={() => setCurrentPage('dashboard')}
              >
                <Gauge size={15} />
                Dashboard
              </button>
              <button
                className={`page-tab ${currentPage === 'plant-kpi' ? 'active' : ''}`}
                onClick={() => setCurrentPage('plant-kpi')}
              >
                <ClipboardList size={15} />
                Plant KPI
              </button>
              <button
                className={`page-tab ${currentPage === 'economizer' ? 'active' : ''}`}
                onClick={() => setCurrentPage('economizer')}
              >
                <ClipboardList size={15} />
                Economizer
              </button>
            </div>
          </div>
          <div className="upload-area">
            <label className="upload-btn">
              {uploading ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Upload Excel
                </>
              )}
              <input
                type="file"
                accept=".xlsx,.xlsm"
                onChange={onFileChange}
                disabled={uploading}
                hidden
              />
            </label>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!active && !error && (
          <div className="empty-state">
            <FileSpreadsheet size={64} />
            <h2>No Report Loaded</h2>
            <p>
              Upload a Jalkheri Excel file to extract tag data, view KPIs, and save
              the report to history.
            </p>
          </div>
        )}

        {active && currentPage === 'dashboard' && (
          <div className="dashboard">
            <div className="report-info">
              <div className="report-info-item">
                <Tag size={15} />
                <span>{active.report.sheet_name}</span>
              </div>
              <div className="report-info-item">
                <Clock size={15} />
                <span>{active.report.report_date || 'No date'}</span>
              </div>
              <div className="report-info-item">
                <FileSpreadsheet size={15} />
                <span>{active.report.tag_count} tags</span>
              </div>
              <div className="report-info-item">
                <Clock size={15} />
                <span>{new Date(active.report.created_at).toLocaleString()}</span>
              </div>
            </div>

            {timeColumns.length > 0 && (
              <div className="time-selector-bar">
                <div className="time-selector-label">
                  <Clock3 size={18} />
                  <span>Select Time:</span>
                </div>
                <select
                  className="time-select"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                >
                  {timeColumns.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="time-current">
                  Showing data for: <strong>{selectedTime || '—'}</strong>
                </span>
              </div>
            )}

            <div className="kpi-grid">
              {summaryEntries.map(([label, value]) => (
                <div className="kpi-card" key={label}>
                  <div className="kpi-icon">
                    <TrendingUp size={20} />
                  </div>
                  <div className="kpi-label">{label}</div>
                  <div className="kpi-value">{value}</div>
                </div>
              ))}
            </div>

            <div className="table-section">
              <div className="table-header">
                <h2>Tag Data {selectedTime && <span className="time-badge">{selectedTime}</span>}</h2>
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search tag or description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th>Value {selectedTime && `@ ${selectedTime}`}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReadings.slice(0, 300).map((r) => (
                      <tr key={r.id}>
                        <td className="tag-cell">{r.tag}</td>
                        <td>{r.description}</td>
                        <td className="unit-cell">{r.unit}</td>
                        <td className="value-cell">{getValueAtTime(r)}</td>
                      </tr>
                    ))}
                    {filteredReadings.length === 0 && (
                      <tr>
                        <td colSpan={4} className="no-results">
                          No tags match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredReadings.length > 300 && (
                <div className="results-note">
                  Showing first 300 of {filteredReadings.length} matching tags.
                </div>
              )}
            </div>
          </div>
        )}

        {currentPage === 'plant-kpi' && (
          <div className="plant-kpi-page">
            <div className="plant-kpi-sheet">
              <div className="plant-kpi-title">Jalkheri Power Plant (SAEL) KPI-Report</div>
              <div className="plant-kpi-meta">
                <span>Plant performance indicators</span>
                <div className="plant-kpi-date-area">
                  <span>Report date:</span>
                  {editingDate ? (
                    <div className="date-edit-row">
                      <input
                        className="date-input"
                        type="text"
                        value={dateInput}
                        onChange={(e) => setDateInput(e.target.value)}
                        placeholder="DD-MM-YYYY"
                        autoFocus
                      />
                      <button className="date-btn save" onClick={saveDate} title="Save date">
                        <Check size={14} />
                      </button>
                      <button className="date-btn cancel" onClick={() => setEditingDate(false)} title="Cancel">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="date-display-row">
                      <strong>{plantKpiDate}</strong>
                      {active && (
                        <button className="date-edit-icon" onClick={startEditDate} title="Change date">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="plant-kpi-table-wrapper">
                <table className="plant-kpi-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Plant</th>
                      <th>UOM</th>
                      <th>{selectedTime || plantKpiDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plantKpiRows.map((row, index) => (
                      <tr key={`${row.tag}-${row.plant}`}>
                        <td>{index + 1}</td>
                        <td>{row.plant}</td>
                        <td>{row.unit}</td>
                        <td className="plant-kpi-value">{formatValue(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!active && (
                <div className="plant-kpi-note">
                  Upload a report to replace the reference values with live report readings.
                </div>
              )}
            </div>
          </div>
        )}

        {currentPage === 'economizer' && (
          <div className="plant-kpi-page">
            <div className="plant-kpi-sheet">
              <div className="plant-kpi-title">Effectiveness of Economizer</div>
              <div className="plant-kpi-meta">
                <span>Jalkheri Power Plant (SAEL)</span>
                <span>Report date: <strong>{plantKpiDate}</strong></span>
              </div>
              <div className="plant-kpi-table-wrapper">
                <table className="plant-kpi-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Parameter</th>
                      <th>UOM</th>
                      <th>{selectedTime || plantKpiDate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {economizerRows.map((row, index) => (
                      <tr
                        key={row.parameter}
                        className={`${row.computed ? 'economizer-computed-row' : ''} ${row.computed === 'effectiveness' ? 'economizer-final-row' : ''}`}
                      >
                        <td>{index + 1}</td>
                        <td className="economizer-param">{row.parameter}</td>
                        <td>{row.unit}</td>
                        <td className={`plant-kpi-value ${row.computed ? 'economizer-value' : ''}`}>{formatValue(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="economizer-remarks">
                Remarks- ( &lt; 25 Means is Very Poor of ECO Effectiveness )
              </div>
              {!active && (
                <div className="plant-kpi-note">
                  Upload a report to replace the reference values with live report readings.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
