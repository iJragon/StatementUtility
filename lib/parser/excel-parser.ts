import * as XLSX from 'xlsx';
import type { LineItem, SheetStructure, FinancialStatement } from '../models/statement';

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

const KEY_FIGURE_PATTERNS: Record<string, string[]> = {
  total_revenue: ["total revenue", "effective gross income", "total income"],
  gross_potential_rent: ["gross potential rent", "gross potential", "potential rental revenue", "scheduled rent"],
  vacancy_loss: ["vacancy loss", "vacancy", "physical vacancy", "economic vacancy"],
  concession_loss: ["concession", "concessions", "rent concession"],
  bad_debt: ["bad debt", "bad debts", "uncollectible"],
  net_rental_revenue: ["net rental revenue", "net rent", "net rental income"],
  other_tenant_charges: ["other tenant charges", "other income", "other revenue", "ancillary income"],
  controllable_expenses: ["controllable", "total controllable", "controllable total"],
  non_controllable_expenses: ["non-controllable", "non controllable", "fixed expenses", "total non-controllable"],
  total_operating_expenses: ["total operating expenses", "total expenses", "operating expenses total"],
  noi: ["net operating income", "noi", "net operating income (loss)"],
  total_payroll: ["payroll", "total payroll", "personnel", "labor"],
  management_fees: ["management fee", "management fees", "mgmt fee"],
  utilities: ["utilities", "total utilities", "utility expenses"],
  real_estate_taxes: ["real estate taxes", "property taxes", "re taxes"],
  insurance: ["insurance", "property insurance"],
  financial_expense: ["financial expense", "financial", "financing expense"],
  replacement_expense: ["replacement", "replacement reserve", "capital reserve"],
  total_non_operating: ["total non-operating", "non-operating", "below the line"],
  net_income: ["net income", "net income (loss)", "bottom line"],
  cash_flow: ["cash flow", "net cash flow", "cash flow from operations"],
};

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
}

function substringMatchScore(label: string, pattern: string): number {
  const normLabel = normalizeLabel(label);
  const normPattern = normalizeLabel(pattern);
  if (normLabel === normPattern) return 100;
  if (normLabel.includes(normPattern) || normPattern.includes(normLabel)) {
    const longerLen = Math.max(normLabel.length, normPattern.length);
    const shorterLen = Math.min(normLabel.length, normPattern.length);
    return (shorterLen / longerLen) > 0.6 ? 50 : 10;
  }
  // Word overlap
  const labelWords = normLabel.split(/\s+/);
  const patternWords = normPattern.split(/\s+/);
  const overlap = labelWords.filter(w => patternWords.includes(w)).length;
  if (overlap > 0) return Math.floor((overlap / patternWords.length) * 40);
  return 0;
}

function scoreRowForKeyFigure(row: LineItem, patterns: string[]): number {
  let maxScore = 0;
  for (const pattern of patterns) {
    const s = substringMatchScore(row.label, pattern);
    if (s > maxScore) maxScore = s;
  }
  if (maxScore === 0) return 0;

  let score = maxScore;
  // Has non-null values
  const hasValues = Object.values(row.montlyValues).some(v => v !== null);
  if (hasValues) score += 20;
  if (row.isSubtotal) score += 15;
  score += 10; // any match bonus
  return score;
}

function colIndexToLetter(colIndex: number): string {
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

function isHeaderRow(rawLabel: string): boolean {
  const norm = normalizeLabel(rawLabel);
  // Usually all caps or ends with colon
  return rawLabel === rawLabel.toUpperCase() || rawLabel.trim().endsWith(':');
}

function isSubtotalRow(rawLabel: string, colValues: (number | null)[]): boolean {
  const norm = normalizeLabel(rawLabel);
  const hasTotal = norm.startsWith('total') || norm.includes('subtotal') || norm.includes('total ');
  const hasValues = colValues.filter(v => v !== null).length > 0;
  return hasTotal && hasValues;
}

export async function parseExcel(data: Buffer | ArrayBuffer): Promise<FinancialStatement> {
  const workbook = XLSX.read(data, { type: 'buffer', cellStyles: true, cellDates: false });

  // Pick best sheet
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
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];

  if (rawRows.length === 0) {
    throw new Error('Empty sheet');
  }

  // Find header row: first row with >= 3 month-like values
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

  if (headerRowIndex === -1) {
    // Fallback: try to find any row with numbers in multiple columns
    for (let r = 0; r < Math.min(rawRows.length, 50); r++) {
      const row = rawRows[r];
      const numCount = row.filter(c => typeof c === 'number').length;
      if (numCount >= 3) {
        headerRowIndex = r > 0 ? r - 1 : r;
        // Generate synthetic month labels
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

  // Detect label column: find the column with widest/most text content in data rows
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

  // Exclude month columns and total column from label column candidates
  const excludedCols = new Set(monthColumns.map(m => m.colIndex));
  if (totalColIndex !== undefined) excludedCols.add(totalColIndex);

  let labelColIndex = 0;
  let maxTextLen = 0;
  for (let c = 0; c < colTextLengths.length; c++) {
    if (!excludedCols.has(c) && (colTextLengths[c] || 0) > maxTextLen) {
      maxTextLen = colTextLengths[c];
      labelColIndex = c;
    }
  }

  // Detect account code column
  let accountColIndex: number | undefined = undefined;
  for (let r = headerRowIndex + 1; r < Math.min(rawRows.length, headerRowIndex + 20); r++) {
    const row = rawRows[r];
    for (let c = 0; c < row.length; c++) {
      if (c === labelColIndex || excludedCols.has(c)) continue;
      const cell = String(row[c] ?? '').trim();
      if (ACCOUNT_CODE_REGEX.test(cell)) {
        accountColIndex = c;
        break;
      }
    }
    if (accountColIndex !== undefined) break;
  }

  // Extract metadata from rows above header
  let propertyName = '';
  let period = '';
  let bookType = '';

  for (let r = 0; r < headerRowIndex; r++) {
    const row = rawRows[r];
    for (const cell of row) {
      const val = String(cell ?? '').trim();
      if (!val) continue;
      const lower = val.toLowerCase();
      if (!propertyName && val.length > 3 && !lower.includes('report') && !lower.includes('period')) {
        propertyName = val;
      }
      if (!period && (lower.includes('20') || lower.includes('jan') || lower.includes('dec'))) {
        period = val;
      }
      if (!bookType && (lower.includes('accrual') || lower.includes('cash') || lower.includes('gaap'))) {
        bookType = val;
      }
    }
  }

  // Parse data rows into LineItems
  const allRows: LineItem[] = [];
  const months = monthColumns.map(m => m.label);

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every(c => c === null || c === '')) continue;

    const rawLabel = String(row[labelColIndex] ?? '').trim();
    if (!rawLabel) continue;

    const monthlyValues: Record<string, number | null> = {};
    for (const mc of monthColumns) {
      const val = parseNumericValue(row[mc.colIndex]);
      monthlyValues[mc.label] = val;
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
    const item: LineItem = {
      label: rawLabel,
      montlyValues: monthlyValues,
      annualTotal,
      rowNumber: r + 1,
      accountCode,
      isSubtotal: isSubtotalRow(rawLabel, colValues),
      isHeader: isHeaderRow(rawLabel) && colValues.every(v => v === null),
      indentLevel: detectIndentLevel(String(row[labelColIndex] ?? '')),
    };
    allRows.push(item);
  }

  // Extract key figures via fuzzy matching
  const keyFigures: Record<string, LineItem> = {};
  for (const [keyName, patterns] of Object.entries(KEY_FIGURE_PATTERNS)) {
    let bestScore = 0;
    let bestRow: LineItem | null = null;
    for (const row of allRows) {
      const score = scoreRowForKeyFigure(row, patterns);
      if (score > bestScore) {
        bestScore = score;
        bestRow = row;
      }
    }
    if (bestRow && bestScore >= 30) {
      keyFigures[keyName] = bestRow;
    }
  }

  const structure: SheetStructure = {
    headerRowIndex,
    monthColumns,
    totalColIndex,
    labelColIndex,
    accountColIndex,
  };

  return {
    propertyName: propertyName || 'Unknown Property',
    period: period || 'Unknown Period',
    bookType: bookType || 'Accrual',
    months,
    allRows,
    keyFigures,
    structure,
  };
}

export { colIndexToLetter };
