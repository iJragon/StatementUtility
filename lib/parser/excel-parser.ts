import * as XLSX from 'xlsx';
import type { LineItem, SheetStructure, FinancialStatement } from '../models/statement';
import { extractKeyFiguresWithAI } from './ai-extractor';

const MONTH_REGEX = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

const MONTH_ABBREVIATIONS: Record<string, string> = {
  january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr',
  may: 'May', june: 'Jun', july: 'Jul', august: 'Aug',
  september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec',
  jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr',
  jun: 'Jun', jul: 'Jul', aug: 'Aug',
  sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec',
};

const ACCOUNT_CODE_REGEX = /^\d{3,5}-\d{3,5}$/;

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
}

export function colIndexToLetter(colIndex: number): string {
  let result = '';
  let col = colIndex;
  while (col >= 0) {
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26) - 1;
  }
  return result;
}

function isMonthHeader(value: string): boolean {
  return MONTH_REGEX.test(String(value));
}

function normalizeMonthLabel(raw: string): string {
  const match = raw.match(MONTH_REGEX);
  if (!match) return raw.trim();
  const key = match[1].toLowerCase();
  return MONTH_ABBREVIATIONS[key] || raw.trim();
}

function isTotalColumn(value: string): boolean {
  const norm = String(value).toLowerCase().trim();
  return norm === 'total' || norm === 'annual' || norm === 'ytd' || norm === 'year total';
}

function parseNumericValue(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  const str = String(val).replace(/[$,%\s]/g, '').replace(/\(([^)]+)\)/, '-$1');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function detectIndentLevel(rawLabel: string): number {
  const leading = rawLabel.match(/^(\s+)/);
  if (!leading) return 0;
  return Math.floor(leading[1].length / 2);
}

function isSubtotalRow(rawLabel: string, colValues: (number | null)[]): boolean {
  const norm = normalizeLabel(rawLabel);
  const hasTotal = norm.startsWith('total') || norm.includes('subtotal');
  const hasValues = colValues.some(v => v !== null);
  return hasTotal && hasValues;
}

function isHeaderRow(rawLabel: string, colValues: (number | null)[]): boolean {
  // A header/section label row has no numeric data in any month column
  const hasValues = colValues.some(v => v !== null);
  if (hasValues) return false;
  return rawLabel === rawLabel.toUpperCase() || rawLabel.trim().endsWith(':');
}

export async function parseExcel(data: Buffer | ArrayBuffer): Promise<FinancialStatement> {
  const workbook = XLSX.read(data, { type: 'buffer', cellStyles: true, cellDates: false });

  // Pick the most relevant sheet
  const preferredPatterns = ['report', "p&l", 'income', 'statement', 'pl'];
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    const lower = name.toLowerCase();
    if (preferredPatterns.some(p => lower.includes(p))) {
      sheetName = name;
      break;
    }
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  if (rawRows.length === 0) throw new Error('Empty sheet');

  // ── 1. Detect header row: first row containing ≥ 3 month names ──────────────
  let headerRowIndex = -1;
  let monthColumns: Array<{ colIndex: number; label: string }> = [];
  let totalColIndex: number | undefined = undefined;

  for (let r = 0; r < Math.min(rawRows.length, 30); r++) {
    const row = rawRows[r];
    const foundMonths: Array<{ colIndex: number; label: string }> = [];
    let foundTotal: number | undefined = undefined;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '').trim();
      if (isMonthHeader(cell)) {
        foundMonths.push({ colIndex: c, label: normalizeMonthLabel(cell) });
      } else if (isTotalColumn(cell)) {
        foundTotal = c;
      }
    }

    if (foundMonths.length >= 3) {
      headerRowIndex = r;
      monthColumns = foundMonths;
      totalColIndex = foundTotal;
      break;
    }
  }

  // Fallback: look for rows with many numeric values
  if (headerRowIndex === -1) {
    for (let r = 0; r < Math.min(rawRows.length, 50); r++) {
      const row = rawRows[r];
      const numCount = row.filter(c => typeof c === 'number').length;
      if (numCount >= 3) {
        headerRowIndex = r > 0 ? r - 1 : r;
        const numRow = rawRows[headerRowIndex + 1] ?? rawRows[headerRowIndex];
        for (let c = 0; c < numRow.length; c++) {
          if (typeof numRow[c] === 'number') {
            monthColumns.push({ colIndex: c, label: `Col${c}` });
          }
        }
        break;
      }
    }
  }

  if (headerRowIndex === -1 || monthColumns.length === 0) {
    throw new Error('Could not detect month columns in the Excel file');
  }

  // ── 2. Detect label column (highest cumulative text length, excluding data cols) ──
  const excludedCols = new Set(monthColumns.map(m => m.colIndex));
  if (totalColIndex !== undefined) excludedCols.add(totalColIndex);

  const colTextLengths: number[] = [];
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (typeof cell === 'string' && cell.trim().length > 0) {
        colTextLengths[c] = (colTextLengths[c] || 0) + cell.trim().length;
      }
    }
  }

  let labelColIndex = 0;
  let maxTextLen = 0;
  for (let c = 0; c < colTextLengths.length; c++) {
    if (!excludedCols.has(c) && (colTextLengths[c] || 0) > maxTextLen) {
      maxTextLen = colTextLengths[c];
      labelColIndex = c;
    }
  }

  // ── 3. Detect account code column ──────────────────────────────────────────
  let accountColIndex: number | undefined = undefined;
  for (let r = headerRowIndex + 1; r < Math.min(rawRows.length, headerRowIndex + 20); r++) {
    const row = rawRows[r];
    for (let c = 0; c < row.length; c++) {
      if (c === labelColIndex || excludedCols.has(c)) continue;
      if (ACCOUNT_CODE_REGEX.test(String(row[c] ?? '').trim())) {
        accountColIndex = c;
        break;
      }
    }
    if (accountColIndex !== undefined) break;
  }

  // ── 4. Build header text for AI metadata context ───────────────────────────
  const headerLines: string[] = [];
  for (let r = 0; r < headerRowIndex; r++) {
    const vals = rawRows[r]
      .filter(c => c !== null && c !== '')
      .map(c => String(c).trim())
      .filter(Boolean);
    if (vals.length > 0) headerLines.push(vals.join(' | '));
  }
  const headerText = headerLines.join(' — ');

  // ── 5. Parse all data rows into LineItems ──────────────────────────────────
  const allRows: LineItem[] = [];
  const months = monthColumns.map(m => m.label);

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every(c => c === null || c === '')) continue;

    const rawLabel = String(row[labelColIndex] ?? '').trim();
    if (!rawLabel) continue;

    const monthlyValues: Record<string, number | null> = {};
    for (const mc of monthColumns) {
      monthlyValues[mc.label] = parseNumericValue(row[mc.colIndex]);
    }

    const annualTotal = totalColIndex !== undefined
      ? parseNumericValue(row[totalColIndex])
      : Object.values(monthlyValues).reduce((sum: number | null, v) => {
          if (v === null) return sum;
          return (sum ?? 0) + v;
        }, null);

    const accountCode = accountColIndex !== undefined
      ? String(row[accountColIndex] ?? '').trim() || undefined
      : undefined;

    const colValues = Object.values(monthlyValues);
    allRows.push({
      label: rawLabel,
      monthlyValues: monthlyValues,
      annualTotal,
      rowNumber: r + 1,
      accountCode,
      isSubtotal: isSubtotalRow(rawLabel, colValues),
      isHeader: isHeaderRow(rawLabel, colValues),
      indentLevel: detectIndentLevel(String(row[labelColIndex] ?? '')),
    });
  }

  // ── 6. AI-based key figure extraction ─────────────────────────────────────
  // The AI receives the full numbered row list and identifies which row
  // corresponds to each financial concept, regardless of naming or layout.
  const { keyFigures, parserReport, propertyName, period, bookType } =
    await extractKeyFiguresWithAI(allRows, headerText);

  return {
    propertyName,
    period,
    bookType,
    months,
    allRows,
    keyFigures,
    parserReport,
    structure: {
      headerRowIndex,
      monthColumns,
      totalColIndex,
      labelColIndex,
      accountColIndex,
    },
  };
}
