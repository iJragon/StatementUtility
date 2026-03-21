'use client';

import type { PropertyDetail, CrossYearFlag } from '@/lib/models/portfolio';
import type { AnalysisResult } from '@/lib/models/statement';
import { downloadPortfolioPDF } from '@/lib/export/report-html';
import { formatDollar, pctChange } from '@/lib/utils/format';
import { renderNarrative } from '@/components/shared/NarrativeText';

interface OverviewTabProps {
  property: PropertyDetail;
  analyses: AnalysisResult[];
  crossYearFlags: CrossYearFlag[];
  summaryText: string;
  summaryStreaming: boolean;
  onGenerateSummary: () => void;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

// formatDollar and pctChange imported from @/lib/utils/format

function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return `${val.toFixed(1)}%`;
}

function fmtPctChange(prev: number | null, curr: number | null): string | null {
  const c = pctChange(prev, curr);
  return c !== null ? `${c >= 0 ? '+' : ''}${c.toFixed(1)}%` : null;
}

function calcCagr(first: number | null, last: number | null, n: number): number | null {
  if (first === null || last === null || first === 0 || n <= 1) return null;
  if (first < 0 || last < 0) return null;
  return (Math.pow(last / first, 1 / n) - 1) * 100;
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, status }: {
  label: string;
  value: string;
  sub?: string;
  status?: 'good' | 'warning' | 'bad' | 'neutral';
}) {
  const statusColor: Record<string, string> = {
    good:    'var(--success)',
    warning: 'var(--warning)',
    bad:     'var(--danger)',
    neutral: 'var(--text)',
  };
  return (
    <div className="card text-center min-w-0">
      <p
        className="text-xs uppercase tracking-widest mb-1 flex items-end justify-center"
        style={{ color: 'var(--muted)', minHeight: '2.5rem' }}
      >
        {label}
      </p>
      <p
        className="font-bold leading-none"
        style={{
          color: status ? statusColor[status] : 'var(--text)',
          fontSize: value.length > 8 ? '1.25rem' : '1.5rem',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </p>
      {sub && <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{sub}</p>}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────

export default function OverviewTab({
  property,
  analyses,
  crossYearFlags,
  summaryText,
  summaryStreaming,
  onGenerateSummary,
}: OverviewTabProps) {
  if (analyses.length === 0) return null;

  const periods = property.statements.map(
    (s, i) => s.yearLabel || analyses[i]?.statement.period || `Period ${i + 1}`
  );

  const periodRange = periods.length >= 2
    ? `${periods[0]} to ${periods[periods.length - 1]}`
    : periods[0] || '';

  const generatedDate = property.portfolioAnalyzedAt
    ? new Date(property.portfolioAnalyzedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // ── Data setup ────────────────────────────────────────────────────────────────

  const latest = analyses[analyses.length - 1];
  const latestKf = latest.statement.keyFigures;
  const latestRatios = latest.ratios;

  const latestNoi  = latestKf['noi']?.annualTotal ?? null;
  const latestRev  = latestKf['total_revenue']?.annualTotal ?? null;
  const latestOer  = latestRatios.oer?.value ?? null;
  const latestVac  = latestRatios.vacancyRate?.value ?? null;

  const oerStatus = latestOer === null ? 'neutral' : latestOer < 65 ? 'good' : latestOer < 75 ? 'warning' : 'bad';
  const vacStatus = latestVac === null ? 'neutral' : latestVac < 7 ? 'good' : latestVac < 12 ? 'warning' : 'bad';

  // ── Cross-year high flags ──────────────────────────────────────────────────────
  const highFlags = crossYearFlags.filter(f => f.severity === 'high');

  // ── Best / Worst period by NOI ─────────────────────────────────────────────────
  const noiValues = analyses.map((a, i) => ({
    period: periods[i],
    noi: a.statement.keyFigures['noi']?.annualTotal ?? null,
  }));
  const validNoi = noiValues.filter(n => n.noi !== null);
  const bestPeriod  = validNoi.length > 1 ? validNoi.reduce((best, cur) => (cur.noi! > best.noi! ? cur : best)) : null;
  const worstPeriod = validNoi.length > 1 ? validNoi.reduce((worst, cur) => (cur.noi! < worst.noi! ? cur : worst)) : null;

  // ── Comparison table rows ─────────────────────────────────────────────────────
  const tableRows: Array<{
    label: string;
    key: string;
    isDeduction?: boolean;
    bold?: boolean;
    higherIsBad?: boolean;
  }> = [
    { label: 'Total Revenue',            key: 'total_revenue',           bold: true },
    { label: 'Total Operating Expenses', key: 'total_operating_expenses', isDeduction: true, higherIsBad: true },
    { label: 'Net Operating Income',     key: 'noi',                      bold: true },
    { label: 'Net Income',               key: 'net_income' },
    { label: 'Cash Flow',                key: 'cash_flow' },
  ];

  const ratioRows: Array<{
    label: string;
    values: (number | null)[];
    lowerIsBetter?: boolean;
    fmtFn: (v: number) => string;
  }> = [
    {
      label: 'NOI Margin',
      values: analyses.map(a => a.ratios.noiMargin?.value ?? null),
      fmtFn: v => `${v.toFixed(1)}%`,
    },
    {
      label: 'OER',
      values: analyses.map(a => a.ratios.oer?.value ?? null),
      lowerIsBetter: true,
      fmtFn: v => `${v.toFixed(1)}%`,
    },
    {
      label: 'Vacancy Rate',
      values: analyses.map(a => a.ratios.vacancyRate?.value ?? null),
      lowerIsBetter: true,
      fmtFn: v => `${v.toFixed(1)}%`,
    },
  ];

  const showCagr = analyses.length >= 3;
  const nPeriods = analyses.length - 1;

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Report Header ──────────────────────────────────────────────────── */}
      <div
        className="rounded-xl px-6 py-5 border"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
              Property Overview
            </p>
            <h2 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
              {property.name}
            </h2>
          </div>
          <button
            onClick={() => downloadPortfolioPDF(property, analyses, periods, summaryText)}
            className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-opacity hover:opacity-70"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Export PDF
          </button>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {[
            { label: 'Reporting Period', value: periodRange },
            { label: 'Statements',       value: `${analyses.length} period${analyses.length !== 1 ? 's' : ''}` },
            { label: 'Date Prepared',    value: generatedDate },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-1.5 text-xs">
              <span className="font-semibold" style={{ color: 'var(--muted)' }}>{label}:</span>
              <span style={{ color: 'var(--text)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── High Severity Flags Banner ──────────────────────────────────────── */}
      {highFlags.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 border"
          style={{
            backgroundColor: 'rgba(239,68,68,0.06)',
            borderColor: 'rgba(239,68,68,0.25)',
          }}
        >
          <div className="flex items-start gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--danger)' }}>
                {highFlags.length} High-Severity Alert{highFlags.length !== 1 ? 's' : ''} — Review Required
              </p>
              <ul className="space-y-0.5">
                {highFlags.map((f, i) => (
                  <li key={i} className="text-xs" style={{ color: 'var(--text)' }}>
                    <strong>{f.label}</strong>: {f.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI Tiles (most recent period) ─────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Most Recent Period — {periods[periods.length - 1]}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Net Operating Income"
            value={formatDollar(latestNoi)}
            sub="Annual NOI"
            status={latestNoi !== null && latestNoi >= 0 ? 'good' : latestNoi !== null ? 'bad' : 'neutral'}
          />
          <StatTile
            label="Total Revenue"
            value={formatDollar(latestRev)}
            sub="Annual revenue"
          />
          <StatTile
            label="Operating Expense Ratio"
            value={fmtPct(latestOer)}
            sub="Target: below 55%"
            status={oerStatus}
          />
          <StatTile
            label="Vacancy Rate"
            value={fmtPct(latestVac)}
            sub="Target: below 7%"
            status={vacStatus}
          />
        </div>
      </div>

      {/* ── Best / Worst Period Callout ──────────────────────────────────────── */}
      {bestPeriod && worstPeriod && bestPeriod.period !== worstPeriod.period && (
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl px-4 py-3 border"
            style={{ backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)' }}
          >
            <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--success)' }}>
              Best Period (NOI)
            </p>
            <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{bestPeriod.period}</p>
            <p className="text-sm font-mono" style={{ color: 'var(--success)' }}>{formatDollar(bestPeriod.noi)}</p>
          </div>
          <div
            className="rounded-xl px-4 py-3 border"
            style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}
          >
            <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--danger)' }}>
              Weakest Period (NOI)
            </p>
            <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{worstPeriod.period}</p>
            <p className="text-sm font-mono" style={{ color: 'var(--danger)' }}>{formatDollar(worstPeriod.noi)}</p>
          </div>
        </div>
      )}

      {/* ── Multi-period Comparison Table ───────────────────────────────────── */}
      {analyses.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                Multi-Period Financial Summary
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Annual totals across all periods
                {analyses.length >= 2 && ' · % change from prior period · ▲/▼ vs prior'}
                {showCagr && ' · CAGR (first to last)'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th
                    className="text-left pb-2 font-semibold uppercase tracking-wide pr-4"
                    style={{ color: 'var(--muted)', minWidth: 190 }}
                  >
                    Line Item
                  </th>
                  {periods.map((p, i) => (
                    <th
                      key={i}
                      className="text-right pb-2 font-semibold uppercase tracking-wide px-3"
                      style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}
                    >
                      {p}
                    </th>
                  ))}
                  {analyses.length >= 2 && (
                    <th
                      className="text-right pb-2 font-semibold uppercase tracking-wide pl-3"
                      style={{ color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 64 }}
                    >
                      Chg
                    </th>
                  )}
                  {showCagr && (
                    <th
                      className="text-right pb-2 font-semibold uppercase tracking-wide pl-3"
                      style={{ color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 64 }}
                    >
                      CAGR
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {tableRows.map(row => {
                  const values = analyses.map(a => a.statement.keyFigures[row.key]?.annualTotal ?? null);
                  if (!values.some(v => v !== null)) return null;

                  const firstVal = values.find(v => v !== null) ?? null;
                  const lastVal  = values[values.length - 1];
                  const prevVal  = values.length >= 2 ? values[values.length - 2] : null;
                  const chgStr   = fmtPctChange(prevVal, lastVal);
                  const chgNum   = pctChange(prevVal, lastVal);
                  const cagr     = showCagr ? calcCagr(firstVal, lastVal, nPeriods) : null;

                  // For deduction rows (expenses), good = going down
                  const goodChg  = row.higherIsBad ? (chgNum !== null && chgNum < 0) : (chgNum !== null && chgNum >= 0);
                  const goodCagr = row.higherIsBad ? (cagr !== null && cagr < 0) : (cagr !== null && cagr >= 0);

                  return (
                    <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td
                        className="py-2 pr-4"
                        style={{
                          color: row.bold ? 'var(--text)' : 'var(--muted)',
                          fontWeight: row.bold ? 600 : 400,
                        }}
                      >
                        {row.label}
                      </td>
                      {values.map((val, i) => {
                        const display = row.isDeduction && val !== null ? (val > 0 ? -val : val) : val;
                        const isNeg = display !== null && display < 0;
                        const prevRaw = i > 0 ? values[i - 1] : null;
                        const chgVsPrior = pctChange(prevRaw, val);
                        const arrow = i > 0 && chgVsPrior !== null ? (chgVsPrior > 0 ? '▲' : '▼') : '';
                        const arrowGood = row.higherIsBad ? (chgVsPrior !== null && chgVsPrior < 0) : (chgVsPrior !== null && chgVsPrior > 0);

                        return (
                          <td
                            key={i}
                            className="py-2 text-right font-mono px-3"
                            style={{
                              color: row.bold
                                ? (isNeg ? 'var(--danger)' : 'var(--text)')
                                : (isNeg ? 'rgba(239,68,68,0.7)' : 'var(--muted)'),
                              fontWeight: row.bold ? 600 : 400,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {display !== null ? formatDollar(display) : 'N/A'}
                            {arrow && (
                              <span className="ml-1 text-[10px]" style={{ color: arrowGood ? 'var(--success)' : 'var(--danger)' }}>
                                {arrow}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      {analyses.length >= 2 && (
                        <td
                          className="py-2 text-right font-mono pl-3"
                          style={{
                            whiteSpace: 'nowrap',
                            color: chgNum === null ? 'var(--muted)' : goodChg ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {chgStr ?? '-'}
                        </td>
                      )}
                      {showCagr && (
                        <td
                          className="py-2 text-right font-mono pl-3"
                          style={{
                            whiteSpace: 'nowrap',
                            color: cagr === null ? 'var(--muted)' : goodCagr ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {cagr !== null ? `${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%` : '-'}
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* Ratio rows */}
                {ratioRows.map(row => {
                  const lastVal = row.values[row.values.length - 1];
                  const prevVal = row.values.length >= 2 ? row.values[row.values.length - 2] : null;
                  const chgNum  = pctChange(prevVal, lastVal);
                  const chgStr  = fmtPctChange(prevVal, lastVal);
                  const firstVal = row.values.find(v => v !== null) ?? null;
                  const cagr    = showCagr ? calcCagr(firstVal, lastVal, nPeriods) : null;
                  const goodChg = row.lowerIsBetter ? (chgNum !== null && chgNum < 0) : (chgNum !== null && chgNum > 0);
                  const goodCagr = row.lowerIsBetter ? (cagr !== null && cagr < 0) : (cagr !== null && cagr > 0);

                  return (
                    <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2 pr-4" style={{ color: 'var(--muted)' }}>{row.label}</td>
                      {row.values.map((val, i) => {
                        const prevRaw = i > 0 ? row.values[i - 1] : null;
                        const chgVsPrior = pctChange(prevRaw, val);
                        const arrow = i > 0 && chgVsPrior !== null ? (chgVsPrior > 0 ? '▲' : '▼') : '';
                        const arrowGood = row.lowerIsBetter
                          ? (chgVsPrior !== null && chgVsPrior < 0)
                          : (chgVsPrior !== null && chgVsPrior > 0);

                        return (
                          <td
                            key={i}
                            className="py-2 text-right font-mono px-3"
                            style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}
                          >
                            {val !== null ? row.fmtFn(val) : 'N/A'}
                            {arrow && (
                              <span className="ml-1 text-[10px]" style={{ color: arrowGood ? 'var(--success)' : 'var(--danger)' }}>
                                {arrow}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      {analyses.length >= 2 && (
                        <td
                          className="py-2 text-right font-mono pl-3"
                          style={{
                            whiteSpace: 'nowrap',
                            color: chgNum === null ? 'var(--muted)' : goodChg ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {chgStr ?? '-'}
                        </td>
                      )}
                      {showCagr && (
                        <td
                          className="py-2 text-right font-mono pl-3"
                          style={{
                            whiteSpace: 'nowrap',
                            color: cagr === null ? 'var(--muted)' : goodCagr ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {cagr !== null ? `${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%` : '-'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AI Narrative ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ color: 'var(--accent)' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>AI Narrative</h3>
            {summaryStreaming && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {property.portfolioAnalyzedAt && !summaryStreaming && summaryText && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {generatedDate}
              </p>
            )}
            <button
              onClick={onGenerateSummary}
              disabled={summaryStreaming || analyses.length === 0}
              className="text-xs px-3 py-1.5 rounded-md border transition-colors hover:opacity-80 flex items-center gap-1.5"
              style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {summaryText ? 'Regenerate' : 'Generate'} Narrative
            </button>
          </div>
        </div>

        {summaryText ? (
          <div>
            <div style={{ borderLeft: '3px solid var(--border)', paddingLeft: '1rem' }}>
              {renderNarrative(summaryText)}
            </div>
            {summaryStreaming && (
              <span className="inline-block w-1.5 h-4 ml-1 align-middle rounded-sm animate-pulse"
                style={{ backgroundColor: 'var(--accent)' }} />
            )}
          </div>
        ) : summaryStreaming ? (
          <div className="space-y-3" style={{ borderLeft: '3px solid var(--border)', paddingLeft: '1rem' }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
              <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing portfolio data
            </div>
            <div className="space-y-2 mt-2">
              {[92, 78, 65, 85, 55].map((w, i) => (
                <div key={i} className="h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--border)', width: `${w}%` }} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {analyses.length === 0
              ? 'Add statements to this property to generate an AI narrative.'
              : 'Click "Generate Narrative" to create an AI-powered narrative of this property\'s financial performance across all periods.'}
          </p>
        )}
      </div>

    </div>
  );
}
