import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { supabase, type Report, type TagReading } from './lib/supabase'
import { parseJalkheriExcel, type ParsedTag, type ParsedReport } from './lib/excelParser'

type ActiveReport = {
  report: Report
  readings: TagReading[]
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
      }))

      const { data: readingData, error: readingErr } = await supabase
        .from('tag_readings')
        .insert(readingRows)
        .select()

      if (readingErr) throw new Error(readingErr.message)

      setActive({ report, readings: readingData as TagReading[] })
      setSearch('')
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

  const filteredReadings = active
    ? active.readings.filter((r) =>
        (r.tag + ' ' + r.description).toLowerCase().includes(search.toLowerCase())
      )
    : []

  const summaryEntries = active ? Object.entries(active.report.summary) : []

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
          <h1>Report Automation Dashboard</h1>
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

        {active && (
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
                <h2>Tag Data</h2>
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
                      <th>Latest Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReadings.slice(0, 300).map((r) => (
                      <tr key={r.id}>
                        <td className="tag-cell">{r.tag}</td>
                        <td>{r.description}</td>
                        <td className="unit-cell">{r.unit}</td>
                        <td className="value-cell">
                          {r.value !== null ? r.value : r.raw_value}
                        </td>
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
      </main>
    </div>
  )
}
