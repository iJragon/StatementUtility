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

const CRITICAL_KEYS = new Set([
  'noi', 'total_revenue', 'net_income', 'cash_flow', 'total_operating_expenses',
  'gross_potential_rent', 'vacancy_loss',
]);

export function detectAnomalies(statement: FinancialStatement): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const { keyFigures, structure, months } = statement;

  // Build set of key figure row labels for targeted checks
  const keyFigureLabels = new Set(Object.values(keyFigures).map(r => r.label));
  const criticalLabels = new Set(
    Object.entries(keyFigures)
      .filter(([k]) => CRITICAL_KEYS.has(k))
      .map(([, v]) => v.label),
  );

  // ── 1. Missing data — only flag key figure rows ─────────────────────────
  for (const [key, row] of Object.entries(keyFigures)) {
    const vals = months.map(m => row.montlyValues[m]);
    const nullCount = vals.filter(v => v === null).length;
    if (nullCount === 0) continue;

    const missingMonths = months.filter(m => row.montlyValues[m] === null);
    const isCritical = CRITICAL_KEYS.has(key);

    if (nullCount === vals.length) {
      anomalies.push({
        type: 'missing_data',
        severity: isCritical ? 'high' : 'medium',
        label: row.label,
        cellRef: cellRef(structure.labelColIndex, row.rowNumber),
        description: `Key figure "${row.label}" has no monthly values — this metric could not be read from the statement.`,
        detected: 'All months are empty',
        expected: 'Complete monthly data for this key figure',
        category: 'Data Quality',
      });
    } else if (nullCount >= 2) {
      anomalies.push({
        type: 'missing_data',
        severity: isCritical ? 'medium' : 'low',
        label: row.label,
        cellRef: cellRef(structure.labelColIndex, row.rowNumber),
        description: `"${row.label}" is missing data for ${nullCount} month(s): ${missingMonths.join(', ')}`,
        detected: `Missing ${nullCount} of ${vals.length} months`,
        expected: 'Complete monthly data',
        category: 'Data Quality',
      });
    }
  }

  // ── 2. Sign changes — key figure rows only, minimum magnitude $500 ──────
  for (const row of Object.values(keyFigures)) {
    const vals = months.map(m => row.montlyValues[m]).filter((v): v is number => v !== null);
    if (vals.length < 3) continue;

    const positiveCount = vals.filter(v => v > 0).length;
    const negativeCount = vals.filter(v => v < 0).length;
    if (positiveCount === 0 || negativeCount === 0) continue;

    // Only flag if the sign-changing values have meaningful magnitude
    const maxAbsVal = Math.max(...vals.map(Math.abs));
    if (maxAbsVal < 500) continue;

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
        description: `"${row.label}" flips between positive and negative values at: ${signChanges.join('; ')}. This may indicate adjustments, credits, or data entry errors.`,
        detected: `Sign changes: ${signChanges.join(', ')}`,
        expected: 'Consistent sign across all months',
        category: 'Sign Anomaly',
      });
    }
  }

  // ── 3. Statistical outliers — non-header, non-subtotal, key figure rows ─
  for (const row of Object.values(keyFigures)) {
    if (row.isHeader || row.isSubtotal) continue;
    const vals = months.map(m => row.montlyValues[m]).filter((v): v is number => v !== null);
    if (vals.length < 6) continue; // need enough months for meaningful statistics

    const avg = mean(vals);
    const std = stdDev(vals, avg);
    if (std < 500) continue; // ignore rows with negligible variance

    for (const month of months) {
      const val = row.montlyValues[month];
      if (val === null) continue;
      const zScore = Math.abs((val - avg) / std);
      const absDeviation = Math.abs(val - avg);

      if (zScore > 3.0 && absDeviation > 1000) {
        const monthColIndex = structure.monthColumns.find(mc => mc.label === month)?.colIndex ?? structure.labelColIndex;
        const severity = zScore > 4.5 ? 'high' : 'medium';
        anomalies.push({
          type: 'outlier',
          severity,
          label: row.label,
          cellRef: cellRef(monthColIndex, row.rowNumber),
          description: `"${row.label}" has an unusually ${val > avg ? 'high' : 'low'} value in ${month}: $${val.toLocaleString('en-US', { maximumFractionDigits: 0 })} vs. typical $${avg.toLocaleString('en-US', { maximumFractionDigits: 0 })} (z-score: ${zScore.toFixed(1)})`,
          detected: `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })} (z=${zScore.toFixed(1)})`,
          expected: `Near $${avg.toLocaleString('en-US', { maximumFractionDigits: 0 })} ± $${std.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
          category: 'Statistical Outlier',
        });
      }
    }
  }

  // ── 4. Cash flow vs net income annual divergence ─────────────────────────
  const cashFlowRow = keyFigures['cash_flow'];
  const netIncomeRow = keyFigures['net_income'];
  if (cashFlowRow && netIncomeRow) {
    const cfTotal = cashFlowRow.annualTotal;
    const niTotal = netIncomeRow.annualTotal;
    if (cfTotal !== null && niTotal !== null && Math.abs(niTotal) > 1000) {
      const divergence = Math.abs(cfTotal - niTotal) / Math.abs(niTotal);
      if (divergence > 0.30) {
        const severity = divergence > 0.60 ? 'high' : 'medium';
        anomalies.push({
          type: 'cashflow_vs_netincome',
          severity,
          label: 'Cash Flow vs Net Income Divergence',
          cellRef: cellRef(structure.labelColIndex, cashFlowRow.rowNumber),
          description: `Annual Cash Flow ($${cfTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}) diverges from Net Income ($${niTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}) by ${(divergence * 100).toFixed(1)}%. Large divergences can indicate significant non-cash charges, deferred items, or balance sheet movements.`,
          detected: `CF: $${cfTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}, NI: $${niTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
          expected: 'Cash flow and net income within 30% of each other',
          category: 'Financial Consistency',
        });
      }
    }
  }

  // ── 5. Negative annual NOI ───────────────────────────────────────────────
  const noiRow = keyFigures['noi'];
  if (noiRow && noiRow.annualTotal !== null && noiRow.annualTotal < 0) {
    anomalies.push({
      type: 'negative_noi',
      severity: 'high',
      label: 'Negative Annual Net Operating Income',
      cellRef: cellRef(structure.labelColIndex, noiRow.rowNumber),
      description: `Annual NOI is negative: $${noiRow.annualTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}. The property's operating expenses exceed its revenue — the property is running at an operating loss.`,
      detected: `NOI: $${noiRow.annualTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      expected: 'NOI should be positive for a viable investment property',
      category: 'Critical Performance',
    });
  }

  // ── 6. Vacancy rate concern ──────────────────────────────────────────────
  const vacancyRow = keyFigures['vacancy_loss'];
  const gprRow = keyFigures['gross_potential_rent'];
  if (vacancyRow && gprRow && gprRow.annualTotal && Math.abs(gprRow.annualTotal) > 0) {
    const vacancyPct = (Math.abs(vacancyRow.annualTotal ?? 0) / Math.abs(gprRow.annualTotal)) * 100;
    if (vacancyPct > 10) {
      anomalies.push({
        type: 'sign_change' as Anomaly['type'],
        severity: vacancyPct > 20 ? 'high' : 'medium',
        label: 'Elevated Vacancy Rate',
        cellRef: cellRef(structure.labelColIndex, vacancyRow.rowNumber),
        description: `Annual vacancy rate is ${vacancyPct.toFixed(1)}%, which is above the healthy threshold of 7%. This represents $${Math.abs(vacancyRow.annualTotal ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} in lost potential revenue.`,
        detected: `Vacancy: ${vacancyPct.toFixed(1)}%`,
        expected: 'Vacancy rate below 7%',
        category: 'Occupancy Risk',
      });
    }
  }

  // Sort: high → medium → low
  const severityOrder = { high: 0, medium: 1, low: 2 };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return anomalies;
}
