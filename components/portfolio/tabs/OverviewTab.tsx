'use client';

import type { PropertyDetail } from '@/lib/models/portfolio';
import type { AnalysisResult } from '@/lib/models/statement';

interface OverviewTabProps {
  property: PropertyDetail;
  analyses: AnalysisResult[];
  summaryText: string;
  summaryStreaming: boolean;
  onGenerateSummary: () => void;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt$(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return `${val.toFixed(1)}%`;
}

function pctChange(prev: number | null, curr: number | null): string | null {
  if (prev === null || curr === null || prev === 0) return null;
  const chg = ((curr - prev) / Math.abs(prev)) * 100;
  return `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`;
}

function renderSummary(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('## ') || line.startsWith('# ')) {
      const heading = line.replace(/^#+\s*/, '');
      elements.push(
        <h4 key={key++} className="text-sm font-semibold mt-4 mb-1 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {heading}
        </h4>
      );
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={key++} className="text-sm leading-7 mb-1" style={{ color: 'var(--text)' }}>
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} style={{ color: 'var(--text)' }}>{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      );
    }
  }
  return elements;
}

// ── Stat Tile ─────────────────────────────────────────────────────────────────

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

// ── Main Component ────────────────────────────────────────────────────────────

import type React from 'react';
import { downloadPortfolioPDF } from '@/lib/export/report-html';

export default function OverviewTab({
  property,
  analyses,
  summaryText,
  summaryStreaming,
  onGenerateSummary,
}: OverviewTabProps) {
  if (analyses.length === 0) return null;

  // Period labels in statement order
  const periods = property.statements.map(
    (s, i) => s.yearLabel || analyses[i]?.statement.period || `Period ${i + 1}`
  );

  const periodRange = periods.length >= 2
    ? `${periods[0]} to ${periods[periods.length - 1]}`
    : periods[0] || '';

  const generatedDate = property.portfolioAnalyzedAt
    ? new Date(property.portfolioAnalyzedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Pull key line items across all periods
  const rows: Array<{
    label: string;
    key: string;
    isDeduction?: boolean;
    isRatio?: boolean;
    bold?: boolean;
  }> = [
    { label: 'Total Revenue',           key: 'total_revenue',            bold: true },
    { label: 'Total Operating Expenses',key: 'total_operating_expenses',  isDeduction: true },
    { label: 'Net Operating Income',    key: 'noi',                       bold: true },
    { label: 'Net Income',              key: 'net_income' },
    { label: 'Cash Flow',               key: 'cash_flow' },
  ];

  // Latest period for KPIs
  const latest = analyses[analyses.length - 1];
  const latestKf = latest.statement.keyFigures;
  const latestRatios = latest.ratios;

  const latestNoi    = latestKf['noi']?.annualTotal ?? null;
  const latestRev    = latestKf['total_revenue']?.annualTotal ?? null;
  const latestOer    = latestRatios.oer?.value ?? null;
  const latestVac    = latestRatios.vacancyRate?.value ?? null;
  const latestNoi$   = fmt$(latestNoi);
  const latestRev$   = fmt$(latestRev);

  const oerStatus = latestOer === null ? 'neutral' : latestOer < 65 ? 'good' : latestOer < 75 ? 'warning' : 'bad';
  const vacStatus = latestVac === null ? 'neutral' : latestVac < 7 ? 'good' : latestVac < 12 ? 'warning' : 'bad';
  const noiColor  = latestNoi !== null && latestNoi >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Report Header ─────────────────────────────────────────────────── */}
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

      {/* ── KPI Tiles (most recent period) ────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Most Recent Period — {periods[periods.length - 1]}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Net Operating Income"
            value={latestNoi$}
            sub="Annual NOI"
            status={latestNoi !== null && latestNoi >= 0 ? 'good' : latestNoi !== null ? 'bad' : 'neutral'}
          />
          <StatTile
            label="Total Revenue"
            value={latestRev$}
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

      {/* ── Multi-period Comparison Table ─────────────────────────────────── */}
      {analyses.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                Multi-Period Financial Summary
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Annual totals across all periods
                {analyses.length >= 2 && ' · % change from prior period'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th
                    className="text-left pb-2 font-semibold uppercase tracking-wide pr-4"
                    style={{ color: 'var(--muted)', minWidth: 180 }}
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
                      style={{ color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 72 }}
                    >
                      Chg
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const values = analyses.map(a => {
                    const kf = a.statement.keyFigures;
                    const raw = kf[row.key]?.annualTotal ?? null;
                    return raw;
                  });

                  const hasAnyValue = values.some(v => v !== null);
                  if (!hasAnyValue) return null;

                  const firstVal = values.find(v => v !== null) ?? null;
                  const lastVal  = values[values.length - 1];
                  const prevVal  = values.length >= 2 ? values[values.length - 2] : null;
                  const chg      = pctChange(prevVal, lastVal);
                  const chgNum   = prevVal !== null && lastVal !== null && prevVal !== 0
                    ? ((lastVal - prevVal) / Math.abs(prevVal)) * 100
                    : null;

                  return (
                    <tr
                      key={row.key}
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
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
                            {display !== null ? fmt$(display) : 'N/A'}
                          </td>
                        );
                      })}
                      {analyses.length >= 2 && (
                        <td
                          className="py-2 text-right font-mono pl-3"
                          style={{
                            whiteSpace: 'nowrap',
                            color: chgNum === null ? 'var(--muted)'
                              : chgNum >= 0 ? 'var(--success)'
                              : 'var(--danger)',
                          }}
                        >
                          {chg ?? 'N/A'}
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* Ratio rows */}
                {[
                  { label: 'NOI Margin', values: analyses.map(a => a.ratios.noiMargin?.value ?? null), isRatio: true },
                  { label: 'OER',        values: analyses.map(a => a.ratios.oer?.value ?? null),       isRatio: true, lowerIsBetter: true },
                ].map(row => {
                  const lastVal = row.values[row.values.length - 1];
                  const prevVal = row.values.length >= 2 ? row.values[row.values.length - 2] : null;
                  const chg = pctChange(prevVal, lastVal);
                  const chgNum = prevVal !== null && lastVal !== null && prevVal !== 0
                    ? ((lastVal - prevVal) / Math.abs(prevVal)) * 100
                    : null;
                  const goodChg = row.lowerIsBetter ? (chgNum !== null && chgNum < 0) : (chgNum !== null && chgNum > 0);

                  return (
                    <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2 pr-4" style={{ color: 'var(--muted)' }}>{row.label}</td>
                      {row.values.map((val, i) => (
                        <td
                          key={i}
                          className="py-2 text-right font-mono px-3"
                          style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}
                        >
                          {val !== null ? `${val.toFixed(1)}%` : 'N/A'}
                        </td>
                      ))}
                      {analyses.length >= 2 && (
                        <td
                          className="py-2 text-right font-mono pl-3"
                          style={{
                            whiteSpace: 'nowrap',
                            color: chgNum === null ? 'var(--muted)' : goodChg ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {chg ?? 'N/A'}
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

      {/* ── AI Portfolio Summary ───────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
              Management Commentary
            </h3>
            {property.portfolioAnalyzedAt && !summaryStreaming && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Last generated: {generatedDate}
              </p>
            )}
          </div>
          <button
            onClick={onGenerateSummary}
            disabled={summaryStreaming || analyses.length === 0}
            className="text-xs px-3 py-1.5 rounded-md border transition-colors hover:opacity-80 flex items-center gap-1.5"
            style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
          >
            {summaryStreaming ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                Generating
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {summaryText ? 'Regenerate' : 'Generate'} Summary
              </>
            )}
          </button>
        </div>

        {summaryText ? (
          <div>
            <div style={{ borderLeft: '3px solid var(--border)', paddingLeft: '1rem' }}>
              {renderSummary(summaryText)}
            </div>
            {summaryStreaming && (
              <span className="inline-block w-1.5 h-4 ml-1 align-middle rounded-sm animate-pulse"
                style={{ backgroundColor: 'var(--accent)' }} />
            )}
          </div>
        ) : summaryStreaming ? (
          <div style={{ borderLeft: '3px solid var(--border)', paddingLeft: '1rem' }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
              <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing portfolio data
            </div>
            <div className="space-y-2 mt-3">
              {[92, 78, 65, 85, 55].map((w, i) => (
                <div key={i} className="h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--border)', width: `${w}%` }} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {analyses.length === 0
              ? 'Add statements to this property to generate a portfolio summary.'
              : 'Click "Generate Summary" to create an AI-powered narrative of this property\'s financial performance across all periods.'}
          </p>
        )}
      </div>

    </div>
  );
}
