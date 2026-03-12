'use client';

import type React from 'react';
import type { AnalysisResult } from '@/lib/models/statement';
import Tooltip from '@/components/Tooltip';

interface SummaryTabProps {
  analysis: AnalysisResult;
  summaryText: string;
  summaryStreaming: boolean;
  onTabChange?: (tab: string) => void;
}

function fmt$(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtFull$(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const sign = val < 0 ? '-' : '';
  return `${sign}$${Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtPct(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined) return 'N/A';
  return `${val.toFixed(decimals)}%`;
}

function pctOfRev(val: number | null, rev: number | null): string {
  if (val === null || rev === null || rev === 0) return '';
  return `${((Math.abs(val) / Math.abs(rev)) * 100).toFixed(1)}% of revenue`;
}

interface MetricCardProps {
  label: React.ReactNode;
  value: string;
  sub?: string;
  color?: string;
  onClick?: () => void;
  tab?: string;
}

function MetricCard({ label, value, sub, color = 'var(--text)', onClick, tab }: MetricCardProps) {
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1 leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{sub}</p>}
      {tab && (
        <p className="text-xs mt-2 font-medium flex items-center gap-1" style={{ color: 'var(--accent)' }}>
          View detail
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="card text-left hover:opacity-80 transition-opacity w-full"
      >
        {inner}
      </button>
    );
  }
  return <div className="card">{inner}</div>;
}

function RatioRow({ label, value, status, tooltip }: { label: string; value: string; status: 'good' | 'warning' | 'bad' | 'neutral'; tooltip?: string }) {
  const colors: Record<string, string> = {
    good: 'var(--success)',
    warning: 'var(--warning)',
    bad: 'var(--danger)',
    neutral: 'var(--muted)',
  };
  const bgColors: Record<string, string> = {
    good: 'rgba(34,197,94,0.1)',
    warning: 'rgba(245,158,11,0.1)',
    bad: 'rgba(239,68,68,0.1)',
    neutral: 'rgba(163,163,163,0.1)',
  };
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs" style={{ color: 'var(--muted)' }}>
        {tooltip ? <Tooltip term={tooltip}>{label}</Tooltip> : label}
      </span>
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ color: colors[status], backgroundColor: bgColors[status] }}
      >
        {value}
      </span>
    </div>
  );
}

function renderSummary(text: string) {
  // Parse sections that start with ##, numbered items, and bold text
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

export default function SummaryTab({ analysis, summaryText, summaryStreaming, onTabChange }: SummaryTabProps) {
  const { statement, anomalies, ratios } = analysis;
  const kf = statement.keyFigures;

  const totalRev = kf['total_revenue']?.annualTotal ?? null;
  const totalOpEx = kf['total_operating_expenses']?.annualTotal ?? null;
  const noi = kf['noi']?.annualTotal ?? null;
  const netIncome = kf['net_income']?.annualTotal ?? null;
  const cashFlow = kf['cash_flow']?.annualTotal ?? null;

  const highAnomalies = anomalies.filter(a => a.severity === 'high');
  const medAnomalies = anomalies.filter(a => a.severity === 'medium');

  // OER status
  const oer = ratios.oer?.value ?? null;
  const oerStatus = oer === null ? 'neutral' : oer < 50 ? 'good' : oer < 65 ? 'good' : oer < 75 ? 'warning' : 'bad';

  const dscr = ratios.dscr?.value ?? null;
  const dscrStatus = dscr === null ? 'neutral' : dscr >= 1.25 ? 'good' : dscr >= 1.0 ? 'warning' : 'bad';

  const vacancyRate = ratios.vacancyRate?.value ?? null;
  const vacancyStatus = vacancyRate === null ? 'neutral' : vacancyRate < 5 ? 'good' : vacancyRate < 10 ? 'good' : vacancyRate < 15 ? 'warning' : 'bad';

  const noiMargin = noi !== null && totalRev !== null && totalRev !== 0
    ? (noi / totalRev) * 100
    : null;
  const noiStatus = noiMargin === null ? 'neutral' : noiMargin > 40 ? 'good' : noiMargin > 25 ? 'warning' : 'bad';

  const reportDate = new Date(analysis.analyzedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── Report Header ────────────────────────────────────────────── */}
      <div
        className="rounded-xl px-6 py-5 border"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
              Executive Summary
            </p>
            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
              {statement.propertyName || 'Property P&L Analysis'}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Period: <strong style={{ color: 'var(--text)' }}>{statement.period}</strong>
              &nbsp;&nbsp;·&nbsp;&nbsp;Prepared: {reportDate}
              &nbsp;&nbsp;·&nbsp;&nbsp;Source: {analysis.fileName}
            </p>
          </div>
          <div
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.2)' }}
          >
            AI Analysis
          </div>
        </div>
      </div>

      {/* ── Anomaly Alert ────────────────────────────────────────────── */}
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
                  • …and {highAnomalies.length - 2} more
                </li>
              )}
            </ul>
          </div>
          {onTabChange && (
            <button
              onClick={() => onTabChange('anomalies')}
              className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors hover:opacity-80"
              style={{ backgroundColor: '#ef4444', color: 'white' }}
            >
              Review →
            </button>
          )}
        </div>
      )}

      {/* ── KPI Metrics ──────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Key Financial Highlights
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard
            label={<Tooltip term="Gross Revenue">Gross Revenue</Tooltip>}
            value={fmt$(totalRev)}
            sub={fmtFull$(totalRev) + ' annual'}
            color="var(--accent)"
            onClick={onTabChange ? () => onTabChange('revenue') : undefined}
            tab="revenue"
          />
          <MetricCard
            label={<Tooltip term="Total Operating Expenses">Total OpEx</Tooltip>}
            value={fmt$(totalOpEx !== null ? Math.abs(totalOpEx) : null)}
            sub={pctOfRev(totalOpEx, totalRev)}
            color="var(--danger)"
            onClick={onTabChange ? () => onTabChange('expenses') : undefined}
            tab="expenses"
          />
          <MetricCard
            label={<Tooltip term="Net Operating Income">NOI</Tooltip>}
            value={fmt$(noi)}
            sub={pctOfRev(noi, totalRev)}
            color={noi !== null && noi >= 0 ? 'var(--success)' : 'var(--danger)'}
          />
          <MetricCard
            label={<Tooltip term="Net Income">Net Income</Tooltip>}
            value={fmt$(netIncome)}
            sub={pctOfRev(netIncome, totalRev)}
            color={netIncome !== null && netIncome >= 0 ? 'var(--success)' : 'var(--danger)'}
          />
          <MetricCard
            label={<Tooltip term="Cash Flow">Cash Flow</Tooltip>}
            value={fmt$(cashFlow)}
            sub={pctOfRev(cashFlow, totalRev)}
            color={cashFlow !== null && cashFlow >= 0 ? 'var(--success)' : 'var(--danger)'}
          />
        </div>
      </div>

      {/* ── Key Ratios ───────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Key Ratios
          </p>
          {onTabChange && (
            <button
              onClick={() => onTabChange('ratios')}
              className="text-xs hover:opacity-70 transition-opacity flex items-center gap-1"
              style={{ color: 'var(--accent)' }}
            >
              Full ratios
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          )}
        </div>
        <RatioRow
          label="Operating Expense Ratio (OER)"
          value={fmtPct(oer)}
          status={oerStatus}
          tooltip="OER (Operating Expense Ratio)"
        />
        <RatioRow
          label="NOI Margin"
          value={fmtPct(noiMargin)}
          status={noiStatus}
          tooltip="Net Operating Income"
        />
        {vacancyRate !== null && (
          <RatioRow
            label="Vacancy Rate"
            value={fmtPct(vacancyRate)}
            status={vacancyStatus}
            tooltip="Vacancy Rate"
          />
        )}
        {dscr !== null && (
          <RatioRow
            label="Debt Service Coverage (DSCR)"
            value={`${dscr.toFixed(2)}x`}
            status={dscrStatus}
            tooltip="DSCR (Debt Service Coverage Ratio)"
          />
        )}
      </div>

      {/* ── AI Narrative ─────────────────────────────────────────────── */}
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
                Generating…
              </span>
            )}
          </div>
          {onTabChange && (
            <div className="flex gap-3">
              {(['anomalies', 'trends'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className="text-xs hover:opacity-70 transition-opacity capitalize flex items-center gap-1"
                  style={{ color: 'var(--accent)' }}
                >
                  {tab}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              ))}
            </div>
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
              Analyzing financial data…
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
