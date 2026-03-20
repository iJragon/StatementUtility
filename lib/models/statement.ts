export interface LineItem {
  label: string;
  monthlyValues: Record<string, number | null>; // month label -> value
  annualTotal: number | null;
  rowNumber: number;
  accountCode?: string;
  isSubtotal: boolean;
  isHeader: boolean;
  indentLevel: number;
}

export interface SheetStructure {
  headerRowIndex: number;
  monthColumns: Array<{ colIndex: number; label: string }>;
  totalColIndex?: number;
  labelColIndex: number;
  accountColIndex?: number;
}

export interface ParserReportEntry {
  key: string;
  label: string | null;
  rowNumber: number | null;
  annualTotal: number | null;
}

export interface FinancialStatement {
  propertyName: string;
  period: string;
  bookType: string;
  months: string[]; // ordered month labels
  allRows: LineItem[];
  keyFigures: Record<string, LineItem>; // semantic key -> LineItem
  structure: SheetStructure;
  parserReport?: ParserReportEntry[]; // what the AI extractor found for each key figure
}

export const KEY_FIGURE_NAMES = [
  "gross_potential_rent", "vacancy_loss", "concession_loss",
  "bad_debt", "net_rental_revenue", "other_tenant_charges",
  "total_revenue", "controllable_expenses", "non_controllable_expenses",
  "total_operating_expenses", "noi", "total_payroll", "management_fees",
  "utilities", "real_estate_taxes", "insurance", "financial_expense",
  "replacement_expense", "total_non_operating", "net_income", "cash_flow"
] as const;

export type KeyFigureName = typeof KEY_FIGURE_NAMES[number];

export interface RatioResult {
  value: number | null;
  monthly: Record<string, number | null>;
  status: 'good' | 'warning' | 'bad' | 'unknown';
  benchmark: string;
  label: string;
  unit: '%' | 'x' | '$';
}

export interface RatioReport {
  oer: RatioResult;
  noiMargin: RatioResult;
  vacancyRate: RatioResult;
  concessionRate: RatioResult;
  badDebtRate: RatioResult;
  payrollPct: RatioResult;
  mgmtFeePct: RatioResult;
  controllablePct: RatioResult;
  breakEvenOccupancy: RatioResult;
  cashFlowMargin: RatioResult;
  dscr: RatioResult;
}

export interface Anomaly {
  type: 'missing_data' | 'sign_change' | 'outlier' | 'cashflow_vs_netincome' | 'negative_noi' | 'structural';
  severity: 'high' | 'medium' | 'low';
  label: string;
  cellRef: string;
  description: string;
  detected: string;
  expected: string;
  category: string;
  explanation?: string;
}

export interface TrendSeries {
  metric: string;
  label: string;
  values: Record<string, number | null>;
  momChanges: Record<string, number | null>;
  momPctChanges: Record<string, number | null>;
  trendDirection: 'improving' | 'worsening' | 'stable' | 'volatile';
  overallPctChange: number | null;
  peakMonth: string | null;
  troughMonth: string | null;
  avgValue: number | null;
}

export interface TrendReport {
  series: TrendSeries[];
}

export interface AnalysisResult {
  statement: FinancialStatement;
  ratios: RatioReport;
  anomalies: Anomaly[];
  trends: TrendReport;
  summaryText?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  fileName: string;
  fileHash: string;
  analyzedAt: string;
  fromCache?: boolean;
}
