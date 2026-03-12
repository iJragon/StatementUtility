'use client';

import type { CrossYearFlag } from '@/lib/models/portfolio';

interface CrossYearFlagsTabProps {
  flags: CrossYearFlag[];
}

const SEVERITY_STYLES = {
  high: { bg: 'rgba(var(--danger-rgb,239,68,68),0.08)', border: 'rgba(var(--danger-rgb,239,68,68),0.3)', badge: 'var(--danger)', text: 'var(--danger)' },
  medium: { bg: 'rgba(var(--warning-rgb,245,158,11),0.08)', border: 'rgba(var(--warning-rgb,245,158,11),0.3)', badge: 'var(--warning)', text: 'var(--warning)' },
  low: { bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.3)', badge: '#94a3b8', text: 'var(--muted)' },
};

export default function CrossYearFlagsTab({ flags }: CrossYearFlagsTabProps) {
  if (flags.length === 0) {
    return (
      <div className="card text-center py-12">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3" style={{ color: 'var(--success)' }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No cross-year anomalies detected</p>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          Metrics appear consistent across all analyzed periods.
        </p>
      </div>
    );
  }

  const high = flags.filter(f => f.severity === 'high');
  const medium = flags.filter(f => f.severity === 'medium');
  const low = flags.filter(f => f.severity === 'low');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
        <span>{flags.length} cross-period issue{flags.length !== 1 ? 's' : ''} detected</span>
        {high.length > 0 && <span className="px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--danger)' }}>{high.length} high</span>}
        {medium.length > 0 && <span className="px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--warning)' }}>{medium.length} medium</span>}
        {low.length > 0 && <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(148,163,184,0.2)', color: 'var(--muted)' }}>{low.length} low</span>}
      </div>

      {flags.map((flag, i) => {
        const style = SEVERITY_STYLES[flag.severity];
        const isPositive = flag.changePercent > 0;
        const isGrowth = ['noi', 'total_revenue', 'net_rental_revenue'].includes(flag.metric);
        const chgGood = isGrowth ? isPositive : !isPositive;

        return (
          <div
            key={i}
            className="rounded-xl p-4"
            style={{
              backgroundColor: style.bg,
              border: `1px solid ${style.border}`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                    style={{ backgroundColor: style.badge, color: 'white' }}
                  >
                    {flag.severity}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{flag.label}</span>
                </div>
                <p className="text-sm" style={{ color: 'var(--text)' }}>{flag.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {flag.periods[0]} to {flag.periods[1]}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: chgGood ? 'var(--success)' : style.text }}
                  >
                    {flag.changePercent >= 0 ? '+' : ''}{flag.changePercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Cross-year flags highlight significant changes between consecutive periods. These are directional signals, not definitive diagnoses.
      </p>
    </div>
  );
}
