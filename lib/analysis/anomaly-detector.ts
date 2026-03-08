import type { FinancialStatement, Anomaly, LineItem } from '../models/statement';

function colIndexToLetter(colIndex: number): string {
  let result = '';
  let col = colIndex;
  while (col >= 0) {
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26) - 1;
  }
  return result;
}

function cellRef(colIndex: number, rowNumber: number): string {
  return `${colIndexToLetter(colIndex)}${rowNumber}`;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function isBalanceSheetAccount(accountCode: string | undefined): boolean {
  if (!accountCode) return false;
  const prefix = accountCode.match(/^(\d)/);
  if (!prefix) return false;
  const firstDigit = parseInt(prefix[1]);
  return firstDigit === 1 || firstDigit === 2 || firstDigit === 3;
}

const CRITICAL_KEYS = new Set(['noi', 'total_revenue', 'net_income', 'cash_flow', 'total_operating_expenses']);

export function detectAnomalies(statement: FinancialStatement): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const { allRows, keyFigures, structure, months } = statement;

  // Build a map of key figure row labels for severity boosting
  const criticalLabels = new Set(
    Object.entries(keyFigures)
      .filter(([k]) => CRITICAL_KEYS.has(k))
      .map(([, v]) => v.label),
  );

  // 1. Missing data detection
  for (const row of allRows) {
    const vals = months.map(m => row.montlyValues[m]);
    const nullCount = vals.filter(v => v === null).length;

    if (nullCount === vals.length && !row.isHeader) {
      anomalies.push({
        type: 'missing_data',
        severity: 'low',
        label: row.label,
        cellRef: cellRef(structure.labelColIndex, row.rowNumber),
        description: `Row "${row.label}" has no values across all months`,
        detected: 'All nulls',
        expected: 'Numeric values',
        category: 'Data Quality',
      });
    } else if (nullCount > 0 && nullCount < vals.length && !row.isHeader) {
      const missingMonths = months.filter(m => row.montlyValues[m] === null);
      const severity = criticalLabels.has(row.label) ? 'high' : nullCount >= vals.length / 2 ? 'medium' : 'low';
      anomalies.push({
        type: 'missing_data',
        severity,
        label: row.label,
        cellRef: cellRef(structure.labelColIndex, row.rowNumber),
        description: `Row "${row.label}" is missing data for: ${missingMonths.join(', ')}`,
        detected: `Missing ${nullCount} of ${vals.length} months`,
        expected: 'Complete monthly data',
        category: 'Data Quality',
      });
    }
  }

  // 2. Sign change detection (skip balance sheet accounts)
  for (const row of allRows) {
    if (isBalanceSheetAccount(row.accountCode)) continue;
    if (row.isHeader) continue;

    const vals = months.map(m => row.montlyValues[m]).filter((v): v is number => v !== null);
    if (vals.length < 2) continue;

    const positiveCount = vals.filter(v => v > 0).length;
    const negativeCount = vals.filter(v => v < 0).length;

    if (positiveCount > 0 && negativeCount > 0) {
      // Find where sign changes happen
      const signChanges: string[] = [];
      const nonNullMonths = months.filter(m => row.montlyValues[m] !== null);
      for (let i = 1; i < nonNullMonths.length; i++) {
        const prev = row.montlyValues[nonNullMonths[i - 1]]!;
        const curr = row.montlyValues[nonNullMonths[i]]!;
        if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
          signChanges.push(`${nonNullMonths[i - 1]} → ${nonNullMonths[i]}`);
        }
      }

      if (signChanges.length > 0) {
        const isCritical = criticalLabels.has(row.label);
        anomalies.push({
          type: 'sign_change',
          severity: isCritical ? 'high' : 'medium',
          label: row.label,
          cellRef: cellRef(structure.labelColIndex, row.rowNumber),
          description: `"${row.label}" changes sign between months: ${signChanges.join('; ')}`,
          detected: `Sign changes at: ${signChanges.join(', ')}`,
          expected: 'Consistent sign throughout period',
          category: 'Sign Anomaly',
        });
      }
    }
  }

  // 3. Outlier detection: values > 2.5 std deviations from monthly mean per row
  for (const row of allRows) {
    if (row.isHeader || row.isSubtotal) continue;
    const vals = months.map(m => row.montlyValues[m]).filter((v): v is number => v !== null);
    if (vals.length < 4) continue;

    const avg = mean(vals);
    const std = stdDev(vals, avg);
    if (std === 0) continue;

    for (const month of months) {
      const val = row.montlyValues[month];
      if (val === null) continue;
      const zScore = Math.abs((val - avg) / std);
      if (zScore > 2.5) {
        const monthColIndex = structure.monthColumns.find(mc => mc.label === month)?.colIndex ?? structure.labelColIndex;
        anomalies.push({
          type: 'outlier',
          severity: zScore > 3.5 ? 'high' : 'medium',
          label: row.label,
          cellRef: cellRef(monthColIndex, row.rowNumber),
          description: `"${row.label}" has an outlier value in ${month}: ${val.toFixed(0)} (z-score: ${zScore.toFixed(1)})`,
          detected: `Value: ${val.toFixed(2)} (z=${zScore.toFixed(1)})`,
          expected: `Near mean of ${avg.toFixed(2)} ± ${std.toFixed(2)}`,
          category: 'Statistical Outlier',
        });
      }
    }
  }

  // 4. Cash flow vs net income divergence
  const cashFlowRow = keyFigures['cash_flow'];
  const netIncomeRow = keyFigures['net_income'];
  if (cashFlowRow && netIncomeRow) {
    const cfTotal = cashFlowRow.annualTotal;
    const niTotal = netIncomeRow.annualTotal;
    if (cfTotal !== null && niTotal !== null && niTotal !== 0) {
      const divergence = Math.abs(cfTotal - niTotal) / Math.abs(niTotal);
      if (divergence > 0.2) {
        anomalies.push({
          type: 'cashflow_vs_netincome',
          severity: 'high',
          label: 'Cash Flow vs Net Income',
          cellRef: cellRef(structure.labelColIndex, cashFlowRow.rowNumber),
          description: `Annual Cash Flow ($${cfTotal.toFixed(0)}) diverges from Net Income ($${niTotal.toFixed(0)}) by ${(divergence * 100).toFixed(1)}%`,
          detected: `CF: $${cfTotal.toFixed(0)}, NI: $${niTotal.toFixed(0)}`,
          expected: 'Cash flow and net income should be within ~20% of each other',
          category: 'Financial Consistency',
        });
      }

      // Check monthly divergences too
      for (const month of months) {
        const cfVal = cashFlowRow.montlyValues[month];
        const niVal = netIncomeRow.montlyValues[month];
        if (cfVal !== null && niVal !== null && niVal !== 0) {
          const mDivergence = Math.abs(cfVal - niVal) / Math.abs(niVal);
          if (mDivergence > 0.5) {
            const monthColIndex = structure.monthColumns.find(mc => mc.label === month)?.colIndex ?? structure.labelColIndex;
            anomalies.push({
              type: 'cashflow_vs_netincome',
              severity: 'medium',
              label: `Cash Flow vs Net Income (${month})`,
              cellRef: cellRef(monthColIndex, cashFlowRow.rowNumber),
              description: `In ${month}, Cash Flow ($${cfVal.toFixed(0)}) diverges from Net Income ($${niVal.toFixed(0)}) by ${(mDivergence * 100).toFixed(1)}%`,
              detected: `CF: $${cfVal.toFixed(0)}, NI: $${niVal.toFixed(0)}`,
              expected: 'Monthly cash flow and net income should be closely aligned',
              category: 'Financial Consistency',
            });
          }
        }
      }
    }
  }

  // 5. Negative NOI detection
  const noiRow = keyFigures['noi'];
  if (noiRow) {
    if (noiRow.annualTotal !== null && noiRow.annualTotal < 0) {
      anomalies.push({
        type: 'negative_noi',
        severity: 'high',
        label: 'Negative Annual NOI',
        cellRef: cellRef(structure.labelColIndex, noiRow.rowNumber),
        description: `Annual NOI is negative: $${noiRow.annualTotal.toFixed(0)}. The property is operating at a loss.`,
        detected: `NOI: $${noiRow.annualTotal.toFixed(0)}`,
        expected: 'NOI should be positive for a viable property',
        category: 'Critical Performance',
      });
    }

    for (const month of months) {
      const val = noiRow.montlyValues[month];
      if (val !== null && val < 0) {
        const monthColIndex = structure.monthColumns.find(mc => mc.label === month)?.colIndex ?? structure.labelColIndex;
        anomalies.push({
          type: 'negative_noi',
          severity: 'medium',
          label: `Negative NOI in ${month}`,
          cellRef: cellRef(monthColIndex, noiRow.rowNumber),
          description: `NOI in ${month} is negative: $${val.toFixed(0)}`,
          detected: `NOI: $${val.toFixed(0)}`,
          expected: 'Monthly NOI should be positive',
          category: 'Critical Performance',
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return anomalies;
}
