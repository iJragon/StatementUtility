import { getGroqClient } from './base';
import type { AnalysisResult } from '../models/statement';
import type { CrossYearFlag, PortfolioKeyMetric } from '../models/portfolio';

const PORTFOLIO_MODEL = 'llama-3.3-70b-versatile';

function formatDollar(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

export function buildPortfolioContext(
  propertyName: string,
  analyses: AnalysisResult[],
  yearLabels: string[],
): string {
  const lines: string[] = [];
  lines.push(`=== PORTFOLIO ANALYSIS: ${propertyName} ===`);
  lines.push(`Periods covered: ${yearLabels.join(', ')}`);
  lines.push('');

  for (let i = 0; i < analyses.length; i++) {
    const a = analyses[i];
    const label = yearLabels[i] || a.statement.period;
    lines.push(`--- PERIOD: ${label} (${a.statement.period}) ---`);

    const kf = a.statement.keyFigures;
    const keys = [
      'gross_potential_rent', 'vacancy_loss', 'net_rental_revenue',
      'total_revenue', 'total_operating_expenses', 'noi',
      'total_payroll', 'management_fees', 'utilities',
      'real_estate_taxes', 'insurance', 'net_income', 'cash_flow',
    ];
    for (const key of keys) {
      const row = kf[key];
      if (row) lines.push(`  ${row.label}: ${formatDollar(row.annualTotal)}`);
    }

    const r = a.ratios;
    lines.push(`  Operating Expense Ratio: ${r.oer.value !== null ? r.oer.value.toFixed(1) + '%' : 'N/A'} [${r.oer.status}]`);
    lines.push(`  NOI Margin: ${r.noiMargin.value !== null ? r.noiMargin.value.toFixed(1) + '%' : 'N/A'} [${r.noiMargin.status}]`);
    lines.push(`  Vacancy Rate: ${r.vacancyRate.value !== null ? r.vacancyRate.value.toFixed(1) + '%' : 'N/A'} [${r.vacancyRate.status}]`);
    lines.push(`  Payroll %: ${r.payrollPct.value !== null ? r.payrollPct.value.toFixed(1) + '%' : 'N/A'} [${r.payrollPct.status}]`);
    lines.push('');
  }

  if (analyses.length >= 2) {
    lines.push('--- YEAR-OVER-YEAR CHANGES ---');
    const metricKeys = ['total_revenue', 'total_operating_expenses', 'noi', 'total_payroll'];
    for (const key of metricKeys) {
      const vals = analyses.map(a => a.statement.keyFigures[key]?.annualTotal ?? null);
      const label = analyses[0].statement.keyFigures[key]?.label ?? key;
      const first = vals[0];
      const last = vals[vals.length - 1];
      const chg = pctChange(first, last);
      const chgStr = chg !== null ? ` (${chg >= 0 ? '+' : ''}${chg.toFixed(1)}% overall)` : '';
      lines.push(`  ${label}: ${vals.map(formatDollar).join(' -> ')}${chgStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function createPortfolioStream(
  propertyName: string,
  analyses: AnalysisResult[],
  yearLabels: string[],
) {
  const context = buildPortfolioContext(propertyName, analyses, yearLabels);
  const groq = getGroqClient();

  return groq.chat.completions.create({
    model: PORTFOLIO_MODEL,
    stream: true,
    messages: [
      {
        role: 'system',
        content: `You are an expert commercial real estate analyst providing a multi-year financial assessment.
Write a concise, insightful portfolio summary (3-5 paragraphs) covering:
1. Overall financial health and trajectory across all periods
2. Revenue trends and vacancy performance
3. Expense management and key cost drivers
4. NOI performance and margin evolution
5. Key strengths and areas of concern the investor should watch

Be specific with numbers. Use plain paragraph text - no markdown headers, no bullet points.
Reference the specific periods and year-over-year changes.`,
      },
      {
        role: 'user',
        content: `Write a comprehensive multi-year portfolio summary for this property:\n\n${context}`,
      },
    ],
    max_tokens: 1200,
    temperature: 0.4,
  });
}

export function detectCrossYearAnomalies(
  analyses: AnalysisResult[],
  yearLabels: string[],
): CrossYearFlag[] {
  if (analyses.length < 2) return [];

  const flags: CrossYearFlag[] = [];

  type MetricDef = {
    key: string;
    label: string;
    ratioKey?: keyof AnalysisResult['ratios'];
    kfKey?: string;
    unit: '%' | '$';
    declineThreshold?: number;
    increaseThreshold?: number;
    higherIsBad?: boolean;
  };

  const metrics: MetricDef[] = [
    { key: 'noi', label: 'Net Operating Income', kfKey: 'noi', unit: '$', declineThreshold: 15, higherIsBad: false },
    { key: 'total_revenue', label: 'Total Revenue', kfKey: 'total_revenue', unit: '$', declineThreshold: 10, higherIsBad: false },
    { key: 'oer', label: 'Operating Expense Ratio', ratioKey: 'oer', unit: '%', increaseThreshold: 8, higherIsBad: true },
    { key: 'payroll', label: 'Total Payroll', kfKey: 'total_payroll', unit: '$', increaseThreshold: 20, higherIsBad: true },
    { key: 'vacancy', label: 'Vacancy Rate', ratioKey: 'vacancyRate', unit: '%', increaseThreshold: 5, higherIsBad: true },
    { key: 'total_opex', label: 'Total Operating Expenses', kfKey: 'total_operating_expenses', unit: '$', increaseThreshold: 20, higherIsBad: true },
  ];

  for (const metric of metrics) {
    const values: (number | null)[] = analyses.map(a => {
      if (metric.ratioKey) return a.ratios[metric.ratioKey].value;
      if (metric.kfKey) return a.statement.keyFigures[metric.kfKey]?.annualTotal ?? null;
      return null;
    });

    for (let i = 0; i < analyses.length - 1; i++) {
      const from = values[i];
      const to = values[i + 1];
      const chg = pctChange(from, to);
      if (chg === null) continue;

      const fromLabel = yearLabels[i] || analyses[i].statement.period;
      const toLabel = yearLabels[i + 1] || analyses[i + 1].statement.period;
      const fromFmt = metric.unit === '$' ? formatDollar(from) : `${from?.toFixed(1)}%`;
      const toFmt = metric.unit === '$' ? formatDollar(to) : `${to?.toFixed(1)}%`;

      if (!metric.higherIsBad && metric.declineThreshold && chg < -metric.declineThreshold) {
        const absChg = Math.abs(chg);
        flags.push({
          metric: metric.key,
          label: metric.label,
          periods: [fromLabel, toLabel],
          values: [from, to],
          changePercent: chg,
          severity: absChg > 30 ? 'high' : absChg > 20 ? 'medium' : 'low',
          description: `${metric.label} declined ${absChg.toFixed(1)}% from ${fromLabel} to ${toLabel} (${fromFmt} to ${toFmt}). A sustained drop in this metric warrants investigation.`,
        });
      }

      if (metric.higherIsBad && metric.increaseThreshold && chg > metric.increaseThreshold) {
        flags.push({
          metric: metric.key,
          label: metric.label,
          periods: [fromLabel, toLabel],
          values: [from, to],
          changePercent: chg,
          severity: chg > 40 ? 'high' : chg > 20 ? 'medium' : 'low',
          description: `${metric.label} increased ${chg.toFixed(1)}% from ${fromLabel} to ${toLabel} (${fromFmt} to ${toFmt}). This trend may compress NOI margins if not addressed.`,
        });
      }
    }
  }

  const seen = new Map<string, CrossYearFlag>();
  const sev = { high: 0, medium: 1, low: 2 };
  for (const f of flags) {
    const existing = seen.get(f.metric);
    if (!existing || sev[f.severity] < sev[existing.severity]) {
      seen.set(f.metric, f);
    }
  }

  return [...seen.values()].sort((a, b) => sev[a.severity] - sev[b.severity]);
}

export function buildPortfolioKeyMetrics(
  analyses: AnalysisResult[],
  yearLabels: string[],
): PortfolioKeyMetric[] {
  function kfValues(key: string): (number | null)[] {
    return analyses.map(a => a.statement.keyFigures[key]?.annualTotal ?? null);
  }
  function ratioValues(key: keyof AnalysisResult['ratios']): (number | null)[] {
    return analyses.map(a => a.ratios[key].value);
  }

  return [
    { key: 'gpr', label: 'Gross Potential Rent', unit: '$', values: kfValues('gross_potential_rent') },
    { key: 'vacancy_loss', label: 'Vacancy Loss', unit: '$', values: kfValues('vacancy_loss') },
    { key: 'net_rental_revenue', label: 'Net Rental Revenue', unit: '$', values: kfValues('net_rental_revenue') },
    { key: 'total_revenue', label: 'Total Revenue', unit: '$', values: kfValues('total_revenue') },
    { key: 'total_opex', label: 'Total Operating Expenses', unit: '$', values: kfValues('total_operating_expenses') },
    { key: 'noi', label: 'Net Operating Income', unit: '$', values: kfValues('noi') },
    { key: 'total_payroll', label: 'Total Payroll', unit: '$', values: kfValues('total_payroll') },
    { key: 'oer', label: 'Operating Expense Ratio', unit: '%', values: ratioValues('oer') },
    { key: 'noi_margin', label: 'NOI Margin', unit: '%', values: ratioValues('noiMargin') },
    { key: 'vacancy_rate', label: 'Vacancy Rate', unit: '%', values: ratioValues('vacancyRate') },
    { key: 'payroll_pct', label: 'Payroll as % of Revenue', unit: '%', values: ratioValues('payrollPct') },
    { key: 'net_income', label: 'Net Income', unit: '$', values: kfValues('net_income') },
  ];
}
