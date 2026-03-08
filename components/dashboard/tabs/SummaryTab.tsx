'use client';

import type { AnalysisResult } from '@/lib/models/statement';

interface SummaryTabProps {
  analysis: AnalysisResult;
  summaryText: string;
  summaryStreaming: boolean;
}

function formatDollar(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '';
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
}

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
}

function KpiCard({ label, value, subtitle, color = 'var(--accent)' }: KpiCardProps) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
    </div>
  );
}

function renderSummary(text: string) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map((line, i) => {
    // Bold pattern: **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="text-sm leading-6 mb-2" style={{ color: 'var(--text)' }}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          return part;
        })}
      </p>
    );
  });
}

export default function SummaryTab({ analysis, summaryText, summaryStreaming }: SummaryTabProps) {
  const { statement, ratios, anomalies } = analysis;
  const kf = statement.keyFigures;

  const totalRev = kf['total_revenue']?.annualTotal ?? null;
  const totalOpEx = kf['total_operating_expenses']?.annualTotal ?? null;
  const noi = kf['noi']?.annualTotal ?? null;
  const netIncome = kf['net_income']?.annualTotal ?? null;
  const cashFlow = kf['cash_flow']?.annualTotal ?? null;

  function pctOfRev(val: number | null): string {
    if (val === null || totalRev === null || totalRev === 0) return '';
    return `${((Math.abs(val) / Math.abs(totalRev)) * 100).toFixed(1)}% of revenue`;
  }

  const highAnomalies = anomalies.filter(a => a.severity === 'high').length;

  return (
    <div className="space-y-6">
      {/* Alert for high severity anomalies */}
      {highAnomalies > 0 && (
        <div
          className="flex items-center gap-3 p-3 rounded-md text-sm"
          style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {highAnomalies} high-severity anomal{highAnomalies === 1 ? 'y' : 'ies'} detected. Review the Anomalies tab.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Gross Revenue"
          value={formatDollar(totalRev)}
          subtitle="Annual"
          color="var(--accent)"
        />
        <KpiCard
          label="Total OpEx"
          value={formatDollar(totalOpEx !== null ? Math.abs(totalOpEx) : null)}
          subtitle={pctOfRev(totalOpEx)}
          color="var(--danger)"
        />
        <KpiCard
          label="NOI"
          value={formatDollar(noi)}
          subtitle={pctOfRev(noi)}
          color={noi !== null && noi >= 0 ? 'var(--success)' : 'var(--danger)'}
        />
        <KpiCard
          label="Net Income"
          value={formatDollar(netIncome)}
          subtitle={pctOfRev(netIncome)}
          color={netIncome !== null && netIncome >= 0 ? 'var(--success)' : 'var(--danger)'}
        />
        <KpiCard
          label="Cash Flow"
          value={formatDollar(cashFlow)}
          subtitle={pctOfRev(cashFlow)}
          color={cashFlow !== null && cashFlow >= 0 ? 'var(--success)' : 'var(--danger)'}
        />
      </div>

      {/* Quick ratios row */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {[
          { label: 'OER', value: ratios.oer.value, unit: ratios.oer.unit, status: ratios.oer.status },
          { label: 'NOI Margin', value: ratios.noiMargin.value, unit: ratios.noiMargin.unit, status: ratios.noiMargin.status },
          { label: 'Vacancy', value: ratios.vacancyRate.value, unit: ratios.vacancyRate.unit, status: ratios.vacancyRate.status },
          { label: 'DSCR', value: ratios.dscr.value, unit: ratios.dscr.unit, status: ratios.dscr.status },
          { label: 'Payroll %', value: ratios.payrollPct.value, unit: ratios.payrollPct.unit, status: ratios.payrollPct.status },
          { label: 'Mgmt Fee', value: ratios.mgmtFeePct.value, unit: ratios.mgmtFeePct.unit, status: ratios.mgmtFeePct.status },
        ].map(({ label, value, unit, status }) => (
          <div key={label} className="card text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
            <p className="text-lg font-bold mt-1" style={{ color: 'var(--text)' }}>
              {value !== null
                ? unit === '%' ? `${value.toFixed(1)}%`
                : unit === 'x' ? `${value.toFixed(2)}x`
                : `$${value.toFixed(0)}`
                : 'N/A'}
            </p>
            <span className={`badge-${status} text-xs`}>{status}</span>
          </div>
        ))}
      </div>

      {/* AI Summary */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>AI Executive Summary</h3>
          {summaryStreaming && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Generating...</span>
          )}
        </div>

        {summaryText ? (
          <div className="space-y-1">
            {renderSummary(summaryText)}
          </div>
        ) : summaryStreaming ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--border)', width: `${85 - i * 10}%` }} />
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            AI summary will appear here after analysis.
          </p>
        )}
      </div>
    </div>
  );
}
