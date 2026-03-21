'use client';

import type React from 'react';
import type { AnalysisResult } from '@/lib/models/statement';
import Tooltip from '@/components/Tooltip';
import { generateSummaryHTML, printHTML } from '@/lib/export/report-html';

interface SummaryTabProps {
  analysis: AnalysisResult;
  summaryText: string;
  summaryStreaming: boolean;
  onTabChange?: (tab: string) => void;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtFull$(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const sign = val < 0 ? '-' : '';
  return `${sign}$${Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtPct(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined) return '';
  return `${val.toFixed(decimals)}%`;
}

function pctOf(val: number | null, rev: number | null): string {
  if (val === null || rev === null || rev === 0) return '';
  return `${((val / Math.abs(rev)) * 100).toFixed(1)}%`;
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

// ── Income Statement Row ──────────────────────────────────────────────────────

interface RowProps {
  label: string;
  tooltip?: string;
  value: number | null;
  pctBase?: number | null;
  indent?: number;
  bold?: boolean;
  isDeduction?: boolean;
  dividerAbove?: boolean;
  dimmed?: boolean;
}

function IncomeRow({ label, tooltip, value, pctBase, indent = 0, bold = false, isDeduction = false, dividerAbove = false, dimmed = false }: RowProps) {
  const displayVal = value !== null
    ? (isDeduction && value > 0 ? -value : value)
    : null;

  const pctVal = pctBase && value !== null && pctBase !== 0
    ? (value / Math.abs(pctBase)) * 100
    : null;

  const isNeg = displayVal !== null && displayVal < 0;

  return (
    <>
      {dividerAbove && (
        <tr>
          <td colSpan={3} style={{ borderTop: '1px solid var(--border)', paddingTop: 0, height: 1 }} />
        </tr>
      )}
      <tr style={{ opacity: dimmed ? 0.55 : 1 }}>
        <td
          className="py-2 pr-4 text-sm"
          style={{
            paddingLeft: indent * 20 + (indent > 0 ? 8 : 0),
            color: bold ? 'var(--text)' : 'var(--muted)',
            fontWeight: bold ? 600 : 400,
          }}
        >
          {tooltip
            ? <Tooltip term={tooltip}>{label}</Tooltip>
            : label}
        </td>
        <td
          className="py-2 text-right font-mono text-sm pr-6"
          style={{
            color: bold
              ? (isNeg ? 'var(--danger)' : 'var(--text)')
              : (isNeg ? 'rgba(239,68,68,0.7)' : 'var(--muted)'),
            fontWeight: bold ? 600 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          {displayVal !== null ? fmtFull$(displayVal) : 'N/A'}
        </td>
        <td
          className="py-2 text-right font-mono text-xs"
          style={{ color: 'var(--muted)', minWidth: 56, whiteSpace: 'nowrap' }}
        >
          {pctVal !== null ? fmtPct(pctVal) : ''}
        </td>
      </tr>
    </>
  );
}

// ── Stat Tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, tooltip, value, sub, status }: {
  label: string;
  tooltip?: string;
  value: string;
  sub?: string;
  status?: 'good' | 'warning' | 'bad' | 'neutral';
}) {
  const statusColor: Record<string, string> = {
    good: 'var(--success)',
    warning: 'var(--warning)',
    bad: 'var(--danger)',
    neutral: 'var(--text)',
  };

  const labelNode = tooltip
    ? <Tooltip term={tooltip}>{label}</Tooltip>
    : label;

  return (
    <div className="card text-center min-w-0">
      <p
        className="text-xs uppercase tracking-widest mb-1 flex items-end justify-center"
        style={{ color: 'var(--muted)', minHeight: '2.5rem' }}
      >
        {labelNode}
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

export default function SummaryTab({ analysis, summaryText, summaryStreaming, onTabChange }: SummaryTabProps) {
  const { statement, anomalies, ratios } = analysis;
  const kf = statement.keyFigures;

  // Key figures
  const gpr         = kf['gross_potential_rent']?.annualTotal ?? null;
  const vacLoss     = kf['vacancy_loss']?.annualTotal ?? null;
  const concLoss    = kf['concession_loss']?.annualTotal ?? null;
  const badDebt     = kf['bad_debt']?.annualTotal ?? null;
  const netRental   = kf['net_rental_revenue']?.annualTotal ?? null;
  const otherChg    = kf['other_tenant_charges']?.annualTotal ?? null;
  const totalRev    = kf['total_revenue']?.annualTotal ?? null;
  const ctrlExp     = kf['controllable_expenses']?.annualTotal ?? null;
  const nonCtrlExp  = kf['non_controllable_expenses']?.annualTotal ?? null;
  const totalOpEx   = kf['total_operating_expenses']?.annualTotal ?? null;
  const noi         = kf['noi']?.annualTotal ?? null;
  const finExp      = kf['financial_expense']?.annualTotal ?? null;
  const replExp     = kf['replacement_expense']?.annualTotal ?? null;
  const totalNonOp  = kf['total_non_operating']?.annualTotal ?? null;
  const netIncome   = kf['net_income']?.annualTotal ?? null;
  const cashFlow    = kf['cash_flow']?.annualTotal ?? null;

  const highAnomalies = anomalies.filter(a => a.severity === 'high');
  const medAnomalies  = anomalies.filter(a => a.severity === 'medium');

  // Ratios for stat tiles
  const oer          = ratios.oer?.value ?? null;
  const dscr         = ratios.dscr?.value ?? null;
  const vacancyRate  = ratios.vacancyRate?.value ?? null;
  const noiMargin    = ratios.noiMargin?.value ?? null;

  const oerStatus    = oer === null ? 'neutral' : oer < 50 ? 'good' : oer < 65 ? 'good' : oer < 75 ? 'warning' : 'bad';
  const dscrStatus   = dscr === null ? 'neutral' : dscr >= 1.25 ? 'good' : dscr >= 1.0 ? 'warning' : 'bad';
  const vacStatus    = vacancyRate === null ? 'neutral' : vacancyRate < 7 ? 'good' : vacancyRate < 12 ? 'warning' : 'bad';
  const noiStatus    = noiMargin === null ? 'neutral' : noiMargin > 45 ? 'good' : noiMargin > 30 ? 'warning' : 'bad';

  const reportDate = new Date(analysis.analyzedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

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
              Executive Summary
            </p>
            <h2 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
              {statement.propertyName || 'Property P&L Analysis'}
            </h2>
          </div>
          <button
            onClick={() => printHTML(
              generateSummaryHTML(analysis, summaryText),
              `Executive Summary — ${statement.propertyName}`,
            )}
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
            { label: 'Reporting Period', value: statement.period },
            { label: 'Book Type', value: statement.bookType || 'Accrual' },
            { label: 'Date Prepared', value: reportDate },
            { label: 'Source File', value: analysis.fileName },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-1.5 text-xs">
              <span className="font-semibold" style={{ color: 'var(--muted)' }}>{label}:</span>
              <span style={{ color: 'var(--text)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Anomaly Alert ─────────────────────────────────────────────────── */}
      {highAnomalies.length > 0 && (
        <div
          className="flex items-start gap-4 p-4 rounded-xl border"
          style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)', borderLeft: '4px solid #ef4444' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="flex-shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#dc2626' }}>
              {highAnomalies.length} High-Severity {highAnomalies.length === 1 ? 'Anomaly' : 'Anomalies'} Detected
              {medAnomalies.length > 0 && ` · ${medAnomalies.length} Medium`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {highAnomalies.slice(0, 2).map((a, i) => (
                <li key={i} className="text-xs" style={{ color: '#b91c1c' }}>
                  • {a.description}
                </li>
              ))}
              {highAnomalies.length > 2 && (
                <li className="text-xs" style={{ color: '#b91c1c' }}>
                  • and {highAnomalies.length - 2} more
                </li>
              )}
            </ul>
          </div>
          {onTabChange && (
            <button
              onClick={() => onTabChange('anomalies')}
              className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#ef4444', color: 'white' }}
            >
              Review
            </button>
          )}
        </div>
      )}

      {/* ── Key Performance Indicators ─────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Key Performance Indicators
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="NOI Margin"
            tooltip="NOI Margin"
            value={noiMargin !== null ? `${noiMargin.toFixed(1)}%` : 'N/A'}
            sub="Target: 45%+"
            status={noiStatus}
          />
          <StatTile
            label="Operating Expense Ratio"
            tooltip="OER (Operating Expense Ratio)"
            value={oer !== null ? `${oer.toFixed(1)}%` : 'N/A'}
            sub="Target: below 55%"
            status={oerStatus}
          />
          <StatTile
            label="Vacancy Rate"
            tooltip="Vacancy Rate"
            value={vacancyRate !== null ? `${vacancyRate.toFixed(1)}%` : 'N/A'}
            sub="Target: below 7%"
            status={vacStatus}
          />
          <StatTile
            label="Debt Service Coverage"
            tooltip="DSCR (Debt Service Coverage Ratio)"
            value={dscr !== null ? `${dscr.toFixed(2)}x` : 'N/A'}
            sub="Lender min: 1.25x"
            status={dscrStatus}
          />
        </div>
      </div>

      {/* ── Income Statement Cascade ───────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
              Statement of Operations
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Annual totals · % columns relative to Total Revenue
            </p>
          </div>
          {onTabChange && (
            <button
              onClick={() => onTabChange('revenue')}
              className="text-xs hover:opacity-70 transition-opacity flex items-center gap-1"
              style={{ color: 'var(--accent)' }}
            >
              Monthly detail
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th className="text-left pb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Line Item
                </th>
                <th className="text-right pb-2 text-xs font-semibold uppercase tracking-wide pr-6" style={{ color: 'var(--muted)' }}>
                  Annual
                </th>
                <th className="text-right pb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)', minWidth: 64 }}>
                  % Rev
                </th>
              </tr>
            </thead>
            <tbody>

              {/* Revenue section */}
              <IncomeRow label="Gross Potential Rent" tooltip="Gross Potential Rent" value={gpr} pctBase={totalRev} bold />
              <IncomeRow label="Less: Vacancy Loss"   tooltip="Vacancy Loss"        value={vacLoss}  pctBase={totalRev} indent={1} isDeduction />
              <IncomeRow label="Less: Concession Loss" tooltip="Concession Loss"    value={concLoss} pctBase={totalRev} indent={1} isDeduction />
              <IncomeRow label="Less: Bad Debt"        tooltip="Bad Debt"           value={badDebt}  pctBase={totalRev} indent={1} isDeduction />
              <IncomeRow label="Net Rental Revenue"    tooltip="Net Rental Revenue" value={netRental} pctBase={totalRev} bold dividerAbove />
              <IncomeRow label="Other Tenant Charges"  tooltip="Other Tenant Charges" value={otherChg} pctBase={totalRev} indent={1} />
              <IncomeRow label="Total Revenue"         tooltip="Total Revenue"      value={totalRev}  pctBase={totalRev} bold dividerAbove />

              {/* Operating Expenses */}
              <IncomeRow label="Controllable Expenses"     tooltip="Controllable Expenses"     value={ctrlExp}    pctBase={totalRev} indent={1} isDeduction dividerAbove />
              <IncomeRow label="Non-Controllable Expenses" tooltip="Non-Controllable Expenses" value={nonCtrlExp} pctBase={totalRev} indent={1} isDeduction />
              <IncomeRow label="Total Operating Expenses"  tooltip="Total Operating Expenses"  value={totalOpEx}  pctBase={totalRev} bold isDeduction dividerAbove />

              {/* NOI */}
              <IncomeRow label="Net Operating Income" tooltip="Net Operating Income" value={noi} pctBase={totalRev} bold dividerAbove />

              {/* Non-operating / below-the-line */}
              {finExp !== null && (
                <IncomeRow label="Financial Expense / Debt Service" tooltip="Financial Expense" value={finExp} pctBase={totalRev} indent={1} isDeduction dividerAbove />
              )}
              {replExp !== null && finExp === null && (
                <IncomeRow label="Replacement Reserve" tooltip="Replacement Reserve" value={replExp} pctBase={totalRev} indent={1} isDeduction dividerAbove />
              )}
              {totalNonOp !== null && finExp === null && replExp === null && (
                <IncomeRow label="Total Non-Operating" value={totalNonOp} pctBase={totalRev} indent={1} isDeduction dividerAbove />
              )}

              {/* Net Income */}
              {netIncome !== null && (
                <IncomeRow label="Net Income" tooltip="Net Income" value={netIncome} pctBase={totalRev} bold dividerAbove />
              )}
              {cashFlow !== null && netIncome !== null && (
                <IncomeRow label="Cash Flow" tooltip="Cash Flow" value={cashFlow} pctBase={totalRev} dividerAbove />
              )}
              {cashFlow !== null && netIncome === null && (
                <IncomeRow label="Cash Flow" tooltip="Cash Flow" value={cashFlow} pctBase={totalRev} bold dividerAbove />
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* ── AI Narrative ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
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
          <div className="space-y-3" style={{ borderLeft: '3px solid var(--border)', paddingLeft: '1rem' }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
              <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing financial data
            </div>
            <div className="space-y-2 mt-2">
              {[92, 78, 65, 85, 55].map((w, i) => (
                <div key={i} className="h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--border)', width: `${w}%` }} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            AI narrative will appear here after analysis completes.
          </p>
        )}
      </div>

    </div>
  );
}
