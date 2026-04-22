'use client';

import type { Deal } from '@/lib/models/deal';

interface Props {
  deals: Deal[];
  onClose: () => void;
  onSelectDeal: (deal: Deal) => void;
}

function fmt(n: number | undefined, type: 'dollar' | 'pct' | 'x' | 'int'): string {
  if (n === undefined || !isFinite(n)) return '—';
  if (type === 'dollar') {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  if (type === 'pct') return `${(n * 100).toFixed(2)}%`;
  if (type === 'x')   return `${n.toFixed(2)}x`;
  return n.toFixed(0);
}

type Direction = 'higher' | 'lower';

interface MetricDef {
  label: string;
  get: (d: Deal) => number | undefined;
  format: 'dollar' | 'pct' | 'x' | 'int';
  better: Direction;
  group: string;
}

const METRICS: MetricDef[] = [
  // Score
  { label: 'Deal Score',          get: d => d.analysis?.score?.total,             format: 'int',    better: 'higher', group: 'Score' },
  // Income
  { label: 'Purchase Price',      get: d => d.inputs?.purchasePrice,               format: 'dollar', better: 'lower',  group: 'Property' },
  { label: 'Gross Rent (Annual)', get: d => d.analysis?.metrics?.grossScheduledIncome, format: 'dollar', better: 'higher', group: 'Property' },
  { label: 'NOI',                 get: d => d.analysis?.metrics?.noi,              format: 'dollar', better: 'higher', group: 'Property' },
  // Returns
  { label: 'Cap Rate',            get: d => d.analysis?.metrics?.capRate,          format: 'pct',    better: 'higher', group: 'Returns' },
  { label: 'Cash-on-Cash',        get: d => d.analysis?.metrics?.cashOnCash,       format: 'pct',    better: 'higher', group: 'Returns' },
  { label: 'IRR',                 get: d => d.analysis?.metrics?.irr,              format: 'pct',    better: 'higher', group: 'Returns' },
  { label: 'MIRR',                get: d => d.analysis?.metrics?.mirr,             format: 'pct',    better: 'higher', group: 'Returns' },
  { label: 'NPV',                 get: d => d.analysis?.metrics?.npv,              format: 'dollar', better: 'higher', group: 'Returns' },
  { label: 'GRM',                 get: d => d.analysis?.metrics?.grm,              format: 'x',      better: 'lower',  group: 'Returns' },
  // Safety
  { label: 'DSCR',                get: d => d.analysis?.metrics?.dscr,             format: 'x',      better: 'higher', group: 'Safety' },
  { label: 'Break-Even Occ.',     get: d => d.analysis?.metrics?.breakEvenOccupancy, format: 'pct',  better: 'lower',  group: 'Safety' },
  { label: 'LTV',                 get: d => d.analysis?.metrics?.ltv,              format: 'pct',    better: 'lower',  group: 'Safety' },
  { label: 'Cash Invested',       get: d => d.analysis?.metrics?.totalCashInvested, format: 'dollar', better: 'lower',  group: 'Safety' },
  // Cash Flow
  { label: 'CF Before Tax (Yr1)', get: d => d.analysis?.metrics?.cashFlowBeforeTax, format: 'dollar', better: 'higher', group: 'Cash Flow' },
  { label: 'After-Tax CF (Yr1)',  get: d => d.analysis?.metrics?.afterTaxCashFlow,  format: 'dollar', better: 'higher', group: 'Cash Flow' },
  { label: 'Annual Debt Service', get: d => d.analysis?.metrics?.annualDebtService, format: 'dollar', better: 'lower',  group: 'Cash Flow' },
  // Exit
  { label: 'Proj. Sale Price',    get: d => d.analysis?.metrics?.projectedSalePrice, format: 'dollar', better: 'higher', group: 'Exit' },
  { label: 'Net Reversion',       get: d => d.analysis?.metrics?.reversion,         format: 'dollar', better: 'higher', group: 'Exit' },
  { label: 'Total Return',        get: d => d.analysis?.metrics?.overallReturn,      format: 'pct',    better: 'higher', group: 'Exit' },
  // Four Returns
  { label: 'Total Cash Flow',     get: d => d.analysis?.metrics?.totalCashFlow,      format: 'dollar', better: 'higher', group: 'Four Returns' },
  { label: 'Total Appreciation',  get: d => d.analysis?.metrics?.totalAppreciation,  format: 'dollar', better: 'higher', group: 'Four Returns' },
  { label: 'Total Amortization',  get: d => d.analysis?.metrics?.totalAmortization,  format: 'dollar', better: 'higher', group: 'Four Returns' },
];

const VERDICT_COLOR: Record<string, string> = {
  'strong-buy': 'var(--success)', 'buy': 'var(--success)',
  'conditional': 'var(--warning)',
  'avoid': 'var(--danger)', 'strong-avoid': 'var(--danger)',
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'var(--muted)', analyzed: 'var(--accent)', passed: 'var(--warning)', converted: 'var(--success)',
};

export default function DealCompareView({ deals, onClose, onSelectDeal }: Props) {
  // Group metrics and find best/worst per row
  const groups = [...new Set(METRICS.map(m => m.group))];

  function cellStyle(metric: MetricDef, value: number | undefined, allValues: (number | undefined)[]): React.CSSProperties {
    if (value === undefined || !isFinite(value ?? NaN)) return {};
    const valid = allValues.filter((v): v is number => v !== undefined && isFinite(v));
    if (valid.length < 2) return {};
    const best  = metric.better === 'higher' ? Math.max(...valid) : Math.min(...valid);
    const worst = metric.better === 'higher' ? Math.min(...valid) : Math.max(...valid);
    if (Math.abs(best - worst) < 0.0001) return {};
    if (Math.abs(value - best) < 0.0001)  return { color: 'var(--success)', fontWeight: 700 };
    if (Math.abs(value - worst) < 0.0001) return { color: 'var(--danger)' };
    return {};
  }

  const COL_W = Math.max(140, Math.floor(560 / deals.length));

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Deal Comparison — {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Green = best value · Red = worst value · Click a deal name to open it
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded"
          style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          ✕ Close
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: 300 + COL_W * deals.length }}>
          {/* Deal headers */}
          <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--surface)' }}>
            <tr>
              <th
                className="py-3 px-4 text-left text-xs font-medium sticky left-0"
                style={{ color: 'var(--muted)', width: 200, backgroundColor: 'var(--surface)', borderBottom: '2px solid var(--border)' }}
              >
                Metric
              </th>
              {deals.map(d => {
                const verdict = d.analysis?.score?.verdict;
                const vc = verdict ? VERDICT_COLOR[verdict] : 'var(--muted)';
                return (
                  <th
                    key={d.id}
                    className="py-3 px-4 text-center"
                    style={{ width: COL_W, borderBottom: '2px solid var(--border)' }}
                  >
                    <button
                      className="text-sm font-semibold hover:underline block w-full truncate"
                      style={{ color: 'var(--accent)' }}
                      onClick={() => onSelectDeal(d)}
                      title={d.name}
                    >
                      {d.name}
                    </button>
                    {d.address && (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{d.address}</p>
                    )}
                    <div className="flex items-center justify-center gap-2 mt-1.5">
                      {d.analysis?.score && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: `${vc}18`, color: vc }}
                        >
                          {d.analysis.score.total}/100
                        </span>
                      )}
                      <span
                        className="px-2 py-0.5 rounded-full text-xs capitalize"
                        style={{ backgroundColor: `${STATUS_COLOR[d.status]}18`, color: STATUS_COLOR[d.status] }}
                      >
                        {d.status}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {groups.map(group => {
              const groupMetrics = METRICS.filter(m => m.group === group);
              return [
                // Group header row
                <tr key={`g-${group}`} style={{ backgroundColor: 'var(--surface)' }}>
                  <td
                    colSpan={deals.length + 1}
                    className="py-1.5 px-4 text-xs font-semibold uppercase tracking-wider sticky left-0"
                    style={{ color: 'var(--muted)', backgroundColor: 'var(--surface)', borderTop: '1px solid var(--border)' }}
                  >
                    {group}
                  </td>
                </tr>,
                // Metric rows
                ...groupMetrics.map(metric => {
                  const values = deals.map(d => metric.get(d));
                  return (
                    <tr key={metric.label} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td
                        className="py-2.5 px-4 text-xs sticky left-0"
                        style={{ color: 'var(--muted)', backgroundColor: 'var(--bg)', width: 200 }}
                      >
                        {metric.label}
                      </td>
                      {deals.map((d, i) => {
                        const val = values[i];
                        const style = cellStyle(metric, val, values);
                        return (
                          <td
                            key={d.id}
                            className="py-2.5 px-4 text-center text-sm tabular-nums"
                            style={{ ...style, width: COL_W }}
                          >
                            {val !== undefined ? fmt(val, metric.format) : (
                              <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>not analyzed</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
