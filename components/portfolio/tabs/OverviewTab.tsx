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

function renderSummary(text: string) {
  return text.split('\n\n').filter(Boolean).map((para, i) => (
    <p key={i} className="text-sm leading-7" style={{ color: 'var(--text)' }}>
      {para.trim()}
    </p>
  ));
}

function formatDollar(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

export default function OverviewTab({
  property,
  analyses,
  summaryText,
  summaryStreaming,
  onGenerateSummary,
}: OverviewTabProps) {
  const periodRange = analyses.length >= 2
    ? `${property.statements[0]?.yearLabel || analyses[0]?.statement.period} - ${property.statements[property.statements.length - 1]?.yearLabel || analyses[analyses.length - 1]?.statement.period}`
    : property.statements[0]?.yearLabel || analyses[0]?.statement.period || '';

  const noiValues = analyses.map(a => a.statement.keyFigures['noi']?.annualTotal ?? null).filter(v => v !== null) as number[];
  const revValues = analyses.map(a => a.statement.keyFigures['total_revenue']?.annualTotal ?? null).filter(v => v !== null) as number[];

  const noiMin = noiValues.length ? Math.min(...noiValues) : null;
  const noiMax = noiValues.length ? Math.max(...noiValues) : null;
  const latestNoi = noiValues.length ? noiValues[noiValues.length - 1] : null;
  const latestRev = revValues.length ? revValues[revValues.length - 1] : null;

  const latestOer = analyses.length ? analyses[analyses.length - 1].ratios.oer.value : null;

  const hasSummary = Boolean(summaryText);

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Periods Covered</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{analyses.length}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{periodRange}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Latest NOI</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{formatDollar(latestNoi)}</p>
          {noiMin !== null && noiMax !== null && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Range: {formatDollar(noiMin)} - {formatDollar(noiMax)}
            </p>
          )}
        </div>
        <div className="card text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Latest Revenue</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{formatDollar(latestRev)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Latest OER</p>
          <p
            className="text-2xl font-bold mt-1"
            style={{ color: latestOer !== null && latestOer > 65 ? 'var(--danger)' : 'var(--text)' }}
          >
            {latestOer !== null ? `${latestOer.toFixed(1)}%` : 'N/A'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Operating Expense Ratio</p>
        </div>
      </div>

      {/* AI Portfolio Summary */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Portfolio Summary</h3>
            {property.portfolioAnalyzedAt && !summaryStreaming && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Last generated: {new Date(property.portfolioAnalyzedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                Generating...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {hasSummary ? 'Regenerate' : 'Generate'} Summary
              </>
            )}
          </button>
        </div>

        {summaryText ? (
          <div className="space-y-4">
            {renderSummary(summaryText)}
            {summaryStreaming && (
              <span
                className="inline-block w-1 h-4 ml-0.5 animate-pulse"
                style={{ backgroundColor: 'var(--accent)', verticalAlign: 'middle' }}
              />
            )}
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
