import * as XLSX from 'xlsx'

export type ParsedTag = {
  tag: string
  description: string
  unit: string
  value: number | null
  raw_value: string
  values_by_time: Record<string, number | string>
}

export type ParsedReport = {
  sheetName: string
  reportDate: string
  tagCount: number
  timeColumns: string[]
  summary: Record<string, string | number>
  rows: ParsedTag[]
}

function findValueAtTime(
  rows: ParsedTag[],
  term: string,
  timeLabel: string
): string | number {
  const match = rows.find(
    (r) =>
      (r.tag + ' ' + r.description).toLowerCase().includes(term.toLowerCase()) &&
      r.values_by_time[timeLabel] !== undefined &&
      r.values_by_time[timeLabel] !== null
  )
  if (!match) return '—'
  const v = match.values_by_time[timeLabel]
  if (typeof v === 'number') return parseFloat(v.toFixed(2))
  const n = parseFloat(String(v))
  return isNaN(n) ? '—' : parseFloat(n.toFixed(2))
}

function getDefaultTimeLabel(times: string[]): string {
  if (times.length === 0) return ''
  const avg = times.find((t) => t.toLowerCase().includes('avg') || t.toLowerCase().includes('average'))
  return avg || times[times.length - 1]
}

export async function parseJalkheriExcel(file: File): Promise<ParsedReport> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const sheetName = wb.SheetNames.includes('Jalkheri') ? 'Jalkheri' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('No readable sheet found in the Excel file.')

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  // Report date at E5 (0-indexed: row 4, col 4)
  const dateCell = ws[XLSX.utils.encode_cell({ r: 4, c: 4 })]
  const reportDate = dateCell ? String(dateCell.v ?? '') : ''

  // Detect time column headers: try row 7 (0-indexed 6) first, then row 8 (0-indexed 7)
  let headerRow = 6
  let hasTimeHeader = false
  for (let c = 6; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 6, c })]
    if (cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim()) {
      hasTimeHeader = true
      break
    }
  }
  if (!hasTimeHeader) headerRow = 7

  const timeColumns: string[] = []
  const timeColIndices: number[] = []

  for (let c = 6; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })]
    if (cell && cell.v !== null && cell.v !== undefined) {
      const label = String(cell.v).trim()
      if (label) {
        timeColumns.push(label)
        timeColIndices.push(c)
      }
    }
  }

  // Fallback: if no header labels found, use column letters as labels
  if (timeColIndices.length === 0) {
    for (let c = 6; c <= range.e.c; c++) {
      let hasData = false
      for (let r = 7; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell && cell.v !== null && cell.v !== undefined) {
          hasData = true
          break
        }
      }
      if (hasData) {
        timeColumns.push(XLSX.utils.encode_col(c))
        timeColIndices.push(c)
      }
    }
  }

  const lastColIdx =
    timeColIndices.length > 0 ? timeColIndices[timeColIndices.length - 1] : range.e.c
  const lastTimeLabel = timeColumns.length > 0 ? timeColumns[timeColumns.length - 1] : ''

  // Tags start at row 8 (0-indexed 7): tag in col C (idx 2), desc in col E (idx 4), unit in col F (idx 5)
  const rows: ParsedTag[] = []
  for (let r = 7; r <= range.e.r; r++) {
    const tagCell = ws[XLSX.utils.encode_cell({ r, c: 2 })]
    const tag = tagCell ? String(tagCell.v).trim() : ''
    if (!tag) continue

    const descCell = ws[XLSX.utils.encode_cell({ r, c: 4 })]
    const unitCell = ws[XLSX.utils.encode_cell({ r, c: 5 })]
    const desc = descCell ? String(descCell.v ?? '').trim() : ''
    const unit = unitCell ? String(unitCell.v ?? '').trim() : ''

    // Extract value for every time column
    const valuesByTime: Record<string, number | string> = {}
    for (let i = 0; i < timeColIndices.length; i++) {
      const colIdx = timeColIndices[i]
      const label = timeColumns[i]
      const valCell = ws[XLSX.utils.encode_cell({ r, c: colIdx })]
      if (valCell && valCell.v !== null && valCell.v !== undefined) {
        if (typeof valCell.v === 'number') {
          valuesByTime[label] = parseFloat(valCell.v.toFixed(2))
        } else {
          const n = parseFloat(String(valCell.v))
          valuesByTime[label] = isNaN(n) ? String(valCell.v) : parseFloat(n.toFixed(2))
        }
      }
    }

    // Latest value (last time column) for backward compat
    const valCell = ws[XLSX.utils.encode_cell({ r, c: lastColIdx })]
    const rawValue = valCell ? String(valCell.v ?? '') : ''
    const numVal = valCell && typeof valCell.v === 'number' ? valCell.v : null

    rows.push({
      tag,
      description: desc,
      unit,
      value: numVal,
      raw_value: rawValue,
      values_by_time: valuesByTime,
    })
  }

  // Summary computed from the Average column (or last column as fallback)
  const summaryTime = getDefaultTimeLabel(timeColumns)
  const summary = {
    'TG Load (MW)': findValueAtTime(rows, 'MW001', summaryTime),
    'Main Steam Flow (TPH)': findValueAtTime(rows, 'MAIN STM FLOW 1', summaryTime),
    'Live Steam Pressure': findValueAtTime(rows, 'LIVE STM PR', summaryTime),
    'Main Steam Temperature': findValueAtTime(rows, 'LIVE STM TEMP', summaryTime),
    'Furnace Draft': findValueAtTime(rows, 'FURNACE DRAFT', summaryTime),
  }

  return {
    sheetName,
    reportDate,
    tagCount: rows.length,
    timeColumns,
    summary,
    rows,
  }
}
