import Groq from 'groq-sdk';
import type { FinancialStatement, RatioReport, Anomaly, TrendReport } from '../models/statement';

export function getGroqClient(): Groq {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

export const DEFAULT_MODEL = 'llama-3.1-8b-instant';

function formatDollar(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatRatioValue(value: number | null, unit: string): string {
  if (value === null) return 'N/A';
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'x') return `${value.toFixed(2)}x`;
  return `$${value.toFixed(0)}`;
}

export function buildFinancialContext(
  statement: FinancialStatement,
  ratios: RatioReport,
  anomalies: Anomaly[],
  trends: TrendReport,
): string {
  const lines: string[] = [];

  lines.push('=== FINANCIAL STATEMENT CONTEXT ===');
  lines.push(`Property: ${statement.propertyName}`);
  lines.push(`Period: ${statement.period}`);
  lines.push(`Book Type: ${statement.bookType}`);
  lines.push('');

  lines.push('── KEY ANNUAL FIGURES ──');
  const keyOrder = [
    'gross_potential_rent', 'vacancy_loss', 'concession_loss', 'bad_debt',
    'net_rental_revenue', 'other_tenant_charges', 'total_revenue',
    'controllable_expenses', 'non_controllable_expenses', 'total_operating_expenses',
    'noi', 'total_payroll', 'management_fees', 'utilities',
    'real_estate_taxes', 'insurance', 'financial_expense',
    'replacement_expense', 'total_non_operating', 'net_income', 'cash_flow',
  ];
  for (const key of keyOrder) {
    const item = statement.keyFigures[key];
    if (item) {
      lines.push(`${item.label}: ${formatDollar(item.annualTotal)}`);
    }
  }
  lines.push('');

  lines.push('── FINANCIAL RATIOS ──');
  const ratioEntries = [
    { key: 'oer', r: ratios.oer },
    { key: 'noiMargin', r: ratios.noiMargin },
    { key: 'vacancyRate', r: ratios.vacancyRate },
    { key: 'concessionRate', r: ratios.concessionRate },
    { key: 'badDebtRate', r: ratios.badDebtRate },
    { key: 'payrollPct', r: ratios.payrollPct },
    { key: 'mgmtFeePct', r: ratios.mgmtFeePct },
    { key: 'controllablePct', r: ratios.controllablePct },
    { key: 'breakEvenOccupancy', r: ratios.breakEvenOccupancy },
    { key: 'cashFlowMargin', r: ratios.cashFlowMargin },
    { key: 'dscr', r: ratios.dscr },
  ];
  for (const { r } of ratioEntries) {
    const val = formatRatioValue(r.value, r.unit);
    lines.push(`${r.label}: ${val} [${r.status.toUpperCase()}] (benchmark: ${r.benchmark})`);
  }
  lines.push('');

  lines.push('── MONTHLY REVENUE ──');
  const revRow = statement.keyFigures['total_revenue'];
  if (revRow) {
    for (const month of statement.months) {
      const val = revRow.monthlyValues[month];
      lines.push(`${month}: ${formatDollar(val)}`);
    }
  }
  lines.push('');

  lines.push('── ANOMALIES ──');
  const topAnomalies = anomalies.slice(0, 10);
  if (topAnomalies.length === 0) {
    lines.push('No anomalies detected.');
  } else {
    for (const a of topAnomalies) {
      lines.push(`[${a.severity.toUpperCase()}] ${a.label} (${a.cellRef}): ${a.description}`);
    }
  }
  lines.push('');

  lines.push('── TRENDS ──');
  for (const series of trends.series) {
    const pct = series.overallPctChange !== null ? `${series.overallPctChange.toFixed(1)}%` : 'N/A';
    lines.push(`${series.label}: ${series.trendDirection} (overall: ${pct})`);
  }

  return lines.join('\n');
}
