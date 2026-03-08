import type { FinancialStatement, TrendReport, TrendSeries } from '../models/statement';

interface MetricConfig {
  key: string;
  label: string;
  higherIsBetter: boolean;
}

const TRACKED_METRICS: MetricConfig[] = [
  { key: 'total_revenue', label: 'Total Revenue', higherIsBetter: true },
  { key: 'total_operating_expenses', label: 'Total Operating Expenses', higherIsBetter: false },
  { key: 'noi', label: 'Net Operating Income', higherIsBetter: true },
  { key: 'vacancy_loss', label: 'Vacancy Loss', higherIsBetter: false },
  { key: 'controllable_expenses', label: 'Controllable Expenses', higherIsBetter: false },
  { key: 'non_controllable_expenses', label: 'Non-Controllable Expenses', higherIsBetter: false },
  { key: 'total_payroll', label: 'Total Payroll', higherIsBetter: false },
  { key: 'management_fees', label: 'Management Fees', higherIsBetter: false },
  { key: 'cash_flow', label: 'Cash Flow', higherIsBetter: true },
  { key: 'net_income', label: 'Net Income', higherIsBetter: true },
];

function linearRegressionSlope(xVals: number[], yVals: number[]): number {
  const n = xVals.length;
  if (n < 2) return 0;
  const xMean = xVals.reduce((a, b) => a + b, 0) / n;
  const yMean = yVals.reduce((a, b) => a + b, 0) / n;
  const numerator = xVals.reduce((sum, x, i) => sum + (x - xMean) * (yVals[i] - yMean), 0);
  const denominator = xVals.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0);
  return denominator === 0 ? 0 : numerator / denominator;
}

function calcMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calcStdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function determineTrendDirection(
  values: number[],
  months: string[],
  higherIsBetter: boolean,
): 'improving' | 'worsening' | 'stable' | 'volatile' {
  if (values.length < 2) return 'stable';

  const avg = calcMean(values);
  if (avg === 0) return 'stable';

  // Calculate MoM % changes for volatility
  const pctChanges: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) {
      pctChanges.push(((values[i] - values[i - 1]) / Math.abs(values[i - 1])) * 100);
    }
  }

  const xVals = months.map((_, i) => i);
  const slope = linearRegressionSlope(xVals, values);
  const slopePct = (slope / Math.abs(avg)) * 100;

  if (Math.abs(slopePct) < 1) return 'stable';

  if (pctChanges.length > 0) {
    const pctMean = calcMean(pctChanges);
    const pctStd = calcStdDev(pctChanges, pctMean);
    if (pctStd > 20) return 'volatile';
  }

  const isGrowing = slope > 0;
  if (higherIsBetter) {
    return isGrowing ? 'improving' : 'worsening';
  } else {
    return isGrowing ? 'worsening' : 'improving';
  }
}

export function analyzeTrends(statement: FinancialStatement): TrendReport {
  const { keyFigures, months } = statement;
  const series: TrendSeries[] = [];

  for (const { key, label, higherIsBetter } of TRACKED_METRICS) {
    const row = keyFigures[key];
    if (!row) continue;

    const values: Record<string, number | null> = {};
    for (const month of months) {
      values[month] = row.montlyValues[month] ?? null;
    }

    // MoM changes
    const momChanges: Record<string, number | null> = {};
    const momPctChanges: Record<string, number | null> = {};

    for (let i = 1; i < months.length; i++) {
      const prev = values[months[i - 1]];
      const curr = values[months[i]];
      if (prev !== null && curr !== null) {
        momChanges[months[i]] = curr - prev;
        momPctChanges[months[i]] = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null;
      } else {
        momChanges[months[i]] = null;
        momPctChanges[months[i]] = null;
      }
    }
    if (months.length > 0) {
      momChanges[months[0]] = null;
      momPctChanges[months[0]] = null;
    }

    // Filter non-null values for stats
    const nonNullMonths = months.filter(m => values[m] !== null);
    const nonNullVals = nonNullMonths.map(m => values[m] as number);

    const avgValue = nonNullVals.length > 0 ? calcMean(nonNullVals) : null;

    // Peak and trough
    let peakMonth: string | null = null;
    let troughMonth: string | null = null;
    if (nonNullVals.length > 0) {
      const maxVal = Math.max(...nonNullVals);
      const minVal = Math.min(...nonNullVals);
      peakMonth = nonNullMonths[nonNullVals.indexOf(maxVal)];
      troughMonth = nonNullMonths[nonNullVals.indexOf(minVal)];
    }

    // Overall % change (first to last non-null)
    let overallPctChange: number | null = null;
    if (nonNullVals.length >= 2) {
      const first = nonNullVals[0];
      const last = nonNullVals[nonNullVals.length - 1];
      overallPctChange = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null;
    }

    const trendDirection = nonNullVals.length >= 2
      ? determineTrendDirection(nonNullVals, nonNullMonths, higherIsBetter)
      : 'stable';

    series.push({
      metric: key,
      label,
      values,
      momChanges,
      momPctChanges,
      trendDirection,
      overallPctChange,
      peakMonth,
      troughMonth,
      avgValue,
    });
  }

  return { series };
}
