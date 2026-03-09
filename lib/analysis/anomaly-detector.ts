import type { FinancialStatement, Anomaly } from '../models/statement';

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

  const criticalLabels = new Set(
    Object.entries(keyFigures)
      .filter(([k]) => CRITICAL_KEYS.has(k))
      .map(([, v]) => v.label),
  );

  // ── 1. Missing data — only flag key figure rows ──────────────────────────
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
        description: `"${row.label}" has no monthly values at all. This metric could not be read from the statement and will affect dependent calculations.`,
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
        description: `"${row.label}" is missing data for ${nullCount} of ${vals.length} months: ${missingMonths.join(', ')}.`,
        detected: `Missing ${nullCount} of ${vals.length} months`,
        expected: 'Complete monthly data',
        category: 'Data Quality',
      });
    }
  }

  // ── 2. Sign changes — key figure rows only, minimum magnitude $500 ───────
  for (const row of Object.values(keyFigures)) {
    const vals = months.map(m => row.montlyValues[m]).filter((v): v is number => v !== null);
    if (vals.length < 3) continue;

    const positiveCount = vals.filter(v => v > 0).length;
    const negativeCount = vals.filter(v => v < 0).length;
    if (positiveCount === 0 || negativeCount === 0) continue;

    const maxAbsVal = Math.max(...vals.map(Math.abs));
    if (maxAbsVal < 500) continue;

    const signChanges: string[] = [];
    const nonNullMonths = months.filter(m => row.montlyValues[m] !== null);
    for (let i = 1; i < nonNullMonths.length; i++) {
      const prev = row.montlyValues[nonNullMonths[i - 1]]!;
      const curr = row.montlyValues[nonNullMonths[i]]!;
      if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
        signChanges.push(`${nonNullMonths[i - 1]} to ${nonNullMonths[i]}`);
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

  // ── 3. Statistical outliers — one anomaly per key figure row ─────────────
  for (const row of Object.values(keyFigures)) {
    if (row.isHeader || row.isSubtotal) continue;
    const vals = months.map(m => row.montlyValues[m]).filter((v): v is number => v !== null);
    if (vals.length < 6) continue;

    const avg = mean(vals);
    const std = stdDev(vals, avg);
    if (std < 500) continue;

    const outlierMonths: Array<{ month: string; val: number; zScore: number }> = [];
    for (const month of months) {
      const val = row.montlyValues[month];
      if (val === null) continue;
      const zScore = Math.abs((val - avg) / std);
      if (zScore > 3.0 && Math.abs(val - avg) > 1000) {
        outlierMonths.push({ month, val, zScore });
      }
    }

    if (outlierMonths.length > 0) {
      const maxZ = Math.max(...outlierMonths.map(o => o.zScore));
      const severity = maxZ > 4.5 ? 'high' : 'medium';
      const monthDescriptions = outlierMonths
        .map(o => `${o.month} ($${o.val.toLocaleString('en-US', { maximumFractionDigits: 0 })}, z=${o.zScore.toFixed(1)})`)
        .join(', ');
      anomalies.push({
        type: 'outlier',
        severity,
        label: row.label,
        cellRef: cellRef(structure.labelColIndex, row.rowNumber),
        description: `"${row.label}" has statistically unusual values in: ${monthDescriptions}. Typical monthly value is $${avg.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
        detected: `${outlierMonths.length} outlier month(s), max z-score ${maxZ.toFixed(1)}`,
        expected: `Near $${avg.toLocaleString('en-US', { maximumFractionDigits: 0 })} per month`,
        category: 'Statistical Outlier',
      });
    }
  }

  // ── 4. Cash flow vs net income annual divergence ──────────────────────────
  const cashFlowRow = keyFigures['cash_flow'];
  const netIncomeRow = keyFigures['net_income'];
  if (cashFlowRow && netIncomeRow) {
    const cfTotal = cashFlowRow.annualTotal;
    const niTotal = netIncomeRow.annualTotal;
    if (cfTotal !== null && niTotal !== null && Math.abs(niTotal) > 1000) {
      const divergence = Math.abs(cfTotal - niTotal) / Math.abs(niTotal);
      if (divergence > 0.30) {
        anomalies.push({
          type: 'cashflow_vs_netincome',
          severity: divergence > 0.60 ? 'high' : 'medium',
          label: 'Cash Flow vs Net Income Divergence',
          cellRef: cellRef(structure.labelColIndex, cashFlowRow.rowNumber),
          description: `Annual Cash Flow ($${cfTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}) diverges from Net Income ($${niTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}) by ${(divergence * 100).toFixed(1)}%. Large divergences indicate significant non-cash charges, deferred items, or balance sheet movements that may not be visible in the income statement.`,
          detected: `Cash Flow: $${cfTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}, Net Income: $${niTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
          expected: 'Cash flow and net income within 30% of each other',
          category: 'Financial Consistency',
        });
      }
    }
  }

  // ── 5. Negative annual NOI ────────────────────────────────────────────────
  const noiRow = keyFigures['noi'];
  if (noiRow && noiRow.annualTotal !== null && noiRow.annualTotal < 0) {
    anomalies.push({
      type: 'negative_noi',
      severity: 'high',
      label: 'Negative Annual Net Operating Income',
      cellRef: cellRef(structure.labelColIndex, noiRow.rowNumber),
      description: `Annual NOI is negative at $${noiRow.annualTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}. The property's operating expenses exceed its revenue; the property is running at an operating loss.`,
      detected: `NOI: $${noiRow.annualTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      expected: 'Positive NOI for a viable investment property',
      category: 'Critical Performance',
    });
  }

  // ── 6. Elevated vacancy rate ──────────────────────────────────────────────
  const vacancyRow = keyFigures['vacancy_loss'];
  const gprRow = keyFigures['gross_potential_rent'];
  if (vacancyRow && gprRow && gprRow.annualTotal && Math.abs(gprRow.annualTotal) > 0) {
    const vacancyPct = (Math.abs(vacancyRow.annualTotal ?? 0) / Math.abs(gprRow.annualTotal)) * 100;
    if (vacancyPct > 7) {
      anomalies.push({
        type: 'structural',
        severity: vacancyPct > 15 ? 'high' : 'medium',
        label: 'Elevated Vacancy Rate',
        cellRef: cellRef(structure.labelColIndex, vacancyRow.rowNumber),
        description: `Annual vacancy rate is ${vacancyPct.toFixed(1)}%, above the healthy threshold of 7%. This represents $${Math.abs(vacancyRow.annualTotal ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} in lost potential revenue annually.`,
        detected: `Vacancy rate: ${vacancyPct.toFixed(1)}%`,
        expected: 'Vacancy rate at or below 7%',
        category: 'Occupancy Risk',
      });
    }
  }

  // ── 7. High operating expense ratio ──────────────────────────────────────
  const opeRow = keyFigures['total_operating_expenses'];
  const revRow = keyFigures['total_revenue'];
  if (opeRow && revRow && revRow.annualTotal && Math.abs(revRow.annualTotal) > 0) {
    const oer = (Math.abs(opeRow.annualTotal ?? 0) / Math.abs(revRow.annualTotal)) * 100;
    if (oer > 65) {
      anomalies.push({
        type: 'structural',
        severity: oer > 80 ? 'high' : 'medium',
        label: 'High Operating Expense Ratio',
        cellRef: cellRef(structure.labelColIndex, opeRow.rowNumber),
        description: `Operating expenses consume ${oer.toFixed(1)}% of total revenue. Healthy multifamily properties typically target below 55%. At this level, NOI margins are compressed and the property has limited cushion for unexpected costs.`,
        detected: `Operating Expense Ratio: ${oer.toFixed(1)}%`,
        expected: 'Operating Expense Ratio below 55%-60%',
        category: 'Expense Management',
      });
    }
  }

  // ── 8. Consecutive revenue decline (3+ months) ───────────────────────────
  if (revRow) {
    const nonNullMonths = months.filter(m => revRow.montlyValues[m] !== null);
    let streak = 0;
    let streakStart = '';
    for (let i = 1; i < nonNullMonths.length; i++) {
      const prev = revRow.montlyValues[nonNullMonths[i - 1]]!;
      const curr = revRow.montlyValues[nonNullMonths[i]]!;
      if (curr < prev) {
        if (streak === 0) streakStart = nonNullMonths[i - 1];
        streak++;
      } else {
        streak = 0;
      }
      if (streak >= 3) {
        anomalies.push({
          type: 'structural',
          severity: streak >= 5 ? 'high' : 'medium',
          label: 'Sustained Revenue Decline',
          cellRef: cellRef(structure.labelColIndex, revRow.rowNumber),
          description: `Total revenue has declined for ${streak} consecutive months starting from ${streakStart}. A sustained downward trend may signal increasing vacancy, lease roll-offs, or market weakness.`,
          detected: `${streak} consecutive months of declining revenue from ${streakStart}`,
          expected: 'Stable or growing monthly revenue',
          category: 'Revenue Trend',
        });
        break; // Only report the longest streak once
      }
    }
  }

  // ── 9. High total rent loss (vacancy + concessions + bad debt > 12% GPR) ─
  const concessionRow = keyFigures['concession_loss'];
  const badDebtRow = keyFigures['bad_debt'];
  if (gprRow && gprRow.annualTotal && Math.abs(gprRow.annualTotal) > 0) {
    const gpr = Math.abs(gprRow.annualTotal);
    const vacancyLoss = Math.abs(vacancyRow?.annualTotal ?? 0);
    const concessionLoss = Math.abs(concessionRow?.annualTotal ?? 0);
    const badDebtLoss = Math.abs(badDebtRow?.annualTotal ?? 0);
    const totalLossPct = ((vacancyLoss + concessionLoss + badDebtLoss) / gpr) * 100;
    if (totalLossPct > 12) {
      anomalies.push({
        type: 'structural',
        severity: totalLossPct > 20 ? 'high' : 'medium',
        label: 'High Total Rent Loss',
        cellRef: cellRef(structure.labelColIndex, gprRow.rowNumber),
        description: `Combined vacancy, concession, and bad debt losses equal ${totalLossPct.toFixed(1)}% of gross potential rent ($${(vacancyLoss + concessionLoss + badDebtLoss).toLocaleString('en-US', { maximumFractionDigits: 0 })}). This reduces effective revenue significantly and compresses NOI.`,
        detected: `Total rent loss: ${totalLossPct.toFixed(1)}% of GPR`,
        expected: 'Total rent losses below 10%-12% of gross potential rent',
        category: 'Revenue Leakage',
      });
    }
  }

  // Deduplicate step 1: for each (label, type) pair keep only the highest-severity entry
  const seen = new Map<string, number>();
  const deduped: Anomaly[] = [];
  const severityOrder = { high: 0, medium: 1, low: 2 };
  for (const anomaly of anomalies) {
    const key = `${anomaly.label}::${anomaly.type}`;
    const existingIdx = seen.get(key);
    if (existingIdx === undefined) {
      seen.set(key, deduped.length);
      deduped.push(anomaly);
    } else if (severityOrder[anomaly.severity] < severityOrder[deduped[existingIdx].severity]) {
      deduped[existingIdx] = anomaly;
    }
  }

  // Deduplicate step 2: suppress implied anomalies for the same label
  // - outlier is implied by sign_change (sign flip causes extreme deviations)
  // - sign_change is implied by negative_noi (already the more specific finding)
  const labelsWithSignChange = new Set(deduped.filter(a => a.type === 'sign_change').map(a => a.label));
  const labelsWithNegativeNoi = new Set(deduped.filter(a => a.type === 'negative_noi').map(a => a.label));

  const filtered = deduped.filter(a => {
    if (a.type === 'outlier' && labelsWithSignChange.has(a.label)) return false;
    if (a.type === 'sign_change' && labelsWithNegativeNoi.has(a.label)) return false;
    return true;
  });

  filtered.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return filtered;
}
