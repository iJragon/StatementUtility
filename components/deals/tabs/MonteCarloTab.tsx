'use client';

import { useMemo } from 'react';
import type { MonteCarloResult } from '@/lib/models/deal';
import PlotlyChart from '@/components/charts/PlotlyChart';

interface Props {
  result: MonteCarloResult;
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return 'N/A';
  return `${(n * 100).toFixed(2)}%`;
}

function PercentileCell({ value, formatter }: { value: number; formatter: (n: number) => string }) {
  return (
    <td
      className="py-2 px-3 text-center font-mono text-sm"
      style={{ color: 'var(--text)', borderRight: '1px solid var(--border)' }}
    >
      {formatter(value)}
    </td>
  );
}

export default function MonteCarloTab({ result }: Props) {
  const { irrPercentiles, cocPercentiles, viablePct, samples, iterations } = result;

  if (iterations === 0 || samples.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 240 }}>
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No Simulation Data</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          All Monte Carlo iterations failed — the deal inputs may produce degenerate cash flows. Re-analyze or adjust your inputs.
        </p>
      </div>
    );
  }

  const viableColor = viablePct >= 0.80
    ? 'var(--success)'
    : viablePct >= 0.60
    ? 'var(--warning)'
    : 'var(--danger)';

  // Scatter: IRR vs CoC, colored by viability
  const viableSamples  = useMemo(() => samples.filter(s => s.dscr >= 1.0 && s.coc > 0), [samples]);
  const invalidSamples = useMemo(() => samples.filter(s => s.dscr < 1.0 || s.coc <= 0), [samples]);

  const markerSize = Math.max(2, Math.min(6, 10000 / samples.length));

  const scatterData: Plotly.Data[] = [
    {
      type: 'scatter',
      mode: 'markers',
      name: 'Viable',
      x: viableSamples.map(s => s.coc * 100),
      y: viableSamples.map(s => s.irr * 100),
      marker: { color: 'rgba(34,197,94,0.55)', size: markerSize, line: { color: 'rgba(34,197,94,0.8)', width: 0.5 } },
    },
    {
      type: 'scatter',
      mode: 'markers',
      name: 'Non-viable',
      x: invalidSamples.map(s => s.coc * 100),
      y: invalidSamples.map(s => s.irr * 100),
      marker: { color: 'rgba(239,68,68,0.45)', size: markerSize, line: { color: 'rgba(239,68,68,0.7)', width: 0.5 } },
    },
  ];

  function interpret(): string {
    if (viablePct >= 0.85) {
      return `This deal shows strong resilience. In ${(viablePct * 100).toFixed(0)}% of simulated scenarios the property generates positive cash flow with adequate debt coverage. The median IRR of ${fmtPct(irrPercentiles.p50)} and even the pessimistic P10 IRR of ${fmtPct(irrPercentiles.p10)} indicate the deal holds up under adverse conditions.`;
    }
    if (viablePct >= 0.65) {
      return `This deal is moderately resilient. Approximately ${(viablePct * 100).toFixed(0)}% of scenarios yield viable cash flow. The spread between P10 IRR (${fmtPct(irrPercentiles.p10)}) and P90 IRR (${fmtPct(irrPercentiles.p90)}) is wide, reflecting meaningful sensitivity to vacancy and rent growth assumptions. Consider stress-testing with higher vacancy or lower rent growth.`;
    }
    return `This deal carries significant uncertainty. Only ${(viablePct * 100).toFixed(0)}% of simulated scenarios produce viable cash flow. A P10 IRR of ${fmtPct(irrPercentiles.p10)} signals that under pessimistic market conditions, this deal may underperform materially. Revisit the assumptions or negotiate a lower purchase price.`;
  }

  const headerStyle: React.CSSProperties = {
    color: 'var(--muted)',
    borderRight: '1px solid var(--border)',
    borderBottom: '2px solid var(--border)',
    padding: '0.5rem 0.75rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    backgroundColor: 'var(--surface)',
  };

  return (
    <div className="p-4 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>

      {/* Header explanation */}
      <div
        className="rounded-lg p-4"
        style={{ backgroundColor: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.2)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: 'rgba(37,99,235,0.15)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>What is Monte Carlo?</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              Monte Carlo simulation runs {iterations.toLocaleString()} randomized versions of this deal, each with slightly different vacancy rates, rent growth, expense growth, and exit cap rates sampled from realistic probability distributions. The results show how sensitive your returns are to real-world variability, not just the single &ldquo;base case&rdquo; scenario.
            </p>
          </div>
        </div>
      </div>

      {/* Viability badge */}
      <div
        className="rounded-lg px-4 py-3 flex items-center justify-between"
        style={{ border: `1px solid ${viableColor}30`, backgroundColor: `${viableColor}10` }}
      >
        <div>
          <p className="text-xs uppercase tracking-wider font-medium mb-0.5" style={{ color: viableColor, opacity: 0.7 }}>
            Probability of Viable Deal
          </p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: viableColor }}>
            {(viablePct * 100).toFixed(1)}%
          </p>
        </div>
        <p className="text-xs max-w-xs text-right" style={{ color: 'var(--muted)' }}>
          Scenarios where DSCR ≥ 1.0 and cash flow is positive
        </p>
      </div>

      {/* Percentile table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Return Percentiles: {iterations.toLocaleString()} Simulations
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th style={{ ...headerStyle, textAlign: 'left', width: 120 }}>Metric</th>
                <th style={headerStyle}>P10<br /><span style={{ fontWeight: 400, textTransform: 'none', fontSize: '0.65rem' }}>Pessimistic</span></th>
                <th style={headerStyle}>P25</th>
                <th style={headerStyle}>Median</th>
                <th style={headerStyle}>P75</th>
                <th style={{ ...headerStyle, borderRight: 'none' }}>P90<br /><span style={{ fontWeight: 400, textTransform: 'none', fontSize: '0.65rem' }}>Optimistic</span></th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-2 px-3 text-sm font-medium" style={{ color: 'var(--text)', borderRight: '1px solid var(--border)' }}>IRR</td>
                <PercentileCell value={irrPercentiles.p10}  formatter={fmtPct} />
                <PercentileCell value={irrPercentiles.p25}  formatter={fmtPct} />
                <PercentileCell value={irrPercentiles.p50}  formatter={fmtPct} />
                <PercentileCell value={irrPercentiles.p75}  formatter={fmtPct} />
                <PercentileCell value={irrPercentiles.p90}  formatter={fmtPct} />
              </tr>
              <tr>
                <td className="py-2 px-3 text-sm font-medium" style={{ color: 'var(--text)', borderRight: '1px solid var(--border)' }}>Cash-on-Cash</td>
                <PercentileCell value={cocPercentiles.p10}  formatter={fmtPct} />
                <PercentileCell value={cocPercentiles.p25}  formatter={fmtPct} />
                <PercentileCell value={cocPercentiles.p50}  formatter={fmtPct} />
                <PercentileCell value={cocPercentiles.p75}  formatter={fmtPct} />
                <PercentileCell value={cocPercentiles.p90}  formatter={fmtPct} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Scatter plot */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
          IRR vs Cash-on-Cash: {samples.length} Sample Scenarios
        </p>
        <PlotlyChart
          data={scatterData}
          layout={{
            title: undefined,
            xaxis: { title: { text: 'Cash-on-Cash (%)' } as Plotly.LayoutAxis['title'], ticksuffix: '%' } as Partial<Plotly.LayoutAxis>,
            yaxis: { title: { text: 'IRR (%)' } as Plotly.LayoutAxis['title'], ticksuffix: '%' } as Partial<Plotly.LayoutAxis>,
            hovermode: 'closest',
          }}
          style={{ height: 320 }}
        />
      </div>

      {/* Interpretation */}
      <div
        className="rounded-lg p-4"
        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
          What This Means
        </p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
          {interpret()}
        </p>
      </div>

    </div>
  );
}
