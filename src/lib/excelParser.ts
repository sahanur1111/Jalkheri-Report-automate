import * as XLSX from 'xlsx'

export type ParsedTag = {
  tag: string
  description: string
  unit: string
  value: number | null
  raw_value: string
}

export type ParsedReport = {
  sheetName: string
  reportDate: string
  tagCount: number
  summary: Record<string, string | number>
  rows: ParsedTag[]
}

function findValue(rows: ParsedTag[], term: string): string | number {
  const match = rows.find(
    (r) =>
      (r.tag + ' ' + r.description).toLowerCase().includes(term.toLowerCase()) &&
      r.value !== null
  )
  return match ? (match.value as number) : '—'
}

export async function parseJalkheriExcel(file: File): Promise<ParsedReport> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const sheetName = wb.SheetNames.includes('Jalkheri') ? 'Jalkheri' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('No readable sheet found in the Excel file.')

  const rows: ParsedTag[] = []

  // Report date is at E5 (row 5, col 5)
  const dateCell = ws['E5']
  const reportDate = dateCell ? String(dateCell.v ?? '') : ''

  // Find the last column with data (scan from col G onward, rows 8+)
  // In xlsx, columns are 1-indexed; we'll use range
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  let lastCol = range.e.c
  for (let c = 6; c <= range.e.c; c++) {
    let hasData = false
    for (let r = 7; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell && cell.v !== null && cell.v !== undefined) {
        hasData = true
        break
      }
    }
    if (hasData) lastCol = c
  }

  // Tags start at row 8 (0-indexed row 7), tag in col C (idx 2), desc in col E (idx 4), unit in col F (idx 5)
  for (let r = 7; r <= range.e.r; r++) {
    const tagCell = ws[XLSX.utils.encode_cell({ r, c: 2 })]
    const tag = tagCell ? String(tagCell.v).trim() : ''
    if (!tag) continue

    const descCell = ws[XLSX.utils.encode_cell({ r, c: 4 })]
    const unitCell = ws[XLSX.utils.encode_cell({ r, c: 5 })]
    const desc = descCell ? String(descCell.v ?? '').trim() : ''
    const unit = unitCell ? String(unitCell.v ?? '').trim() : ''

    const valCell = ws[XLSX.utils.encode_cell({ r, c: lastCol })]
    const rawValue = valCell ? String(valCell.v ?? '') : ''
    const numVal = valCell && typeof valCell.v === 'number' ? valCell.v : null

    rows.push({
      tag,
      description: desc,
      unit,
      value: numVal,
      raw_value: rawValue,
    })
  }

  const summary = {
    'TG Load (MW)': findValue(rows, 'MW001'),
    'Main Steam Flow (TPH)': findValue(rows, 'MAIN STM FLOW 1'),
    'Live Steam Pressure': findValue(rows, 'LIVE STM PR'),
    'Main Steam Temperature': findValue(rows, 'LIVE STM TEMP'),
    'Furnace Draft': findValue(rows, 'FURNACE DRAFT'),
  }

  return {
    sheetName,
    reportDate,
    tagCount: rows.length,
    summary,
    rows,
  }
}
