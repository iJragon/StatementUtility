'use client';

import type { AnalysisResult, RatioResult } from '@/lib/models/statement';
import PlotlyChart from '@/components/charts/PlotlyChart';
import { kpiGauge } from '@/components/charts/chart-builders';

interface RatiosTabProps {
  analysis: AnalysisResult;
}

function StatusBadge({ status }: { status: 'good' | 'warning' | 'bad' | 'unknown' }) {
  return <span className={`badge-${status}`}>{status}</span>;
}

function formatValue(r: RatioResult): string {
  if (r.value === null) return 'N/A';
  if (r.unit === '%') return `${r.value.toFixed(1)}%`;
  if (r.unit === 'x') return `${r.value.toFixed(2)}x`;
  return `$${r.value.toFixed(0)}`;
}

export default function RatiosTab({ analysis }: RatiosTabProps) {
  const { ratios } = analysis;

  const gauges = [
    { r: ratios.oer, lo: 35, hi: 55 },
    { r: ratios.noiMargin, lo: 40, hi: 65 },
    { r: ratios.vacancyRate, lo: 0, hi: 7 },
    { r: ratios.dscr, lo: 1.25, hi: 9.99 },
  ];

  const allRatios: RatioResult[] = [
    ratios.oer, ratios.noiMargin, ratios.vacancyRate, ratios.concessionRate,
    ratios.badDebtRate, ratios.payrollPct, ratios.mgmtFeePct, ratios.controllablePct,
    ratios.breakEvenOccupancy, ratios.cashFlowMargin, ratios.dscr,
  ];

  return (
    <div className="space-y-6">
      {/* Gauges */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {gauges.map(({ r, lo, hi }) => {
          const g = kpiGauge(r.label, r.value, lo, hi, r.unit);
          return (
            <div key={r.label} className="card">
              <PlotlyChart data={g.data} layout={g.layout} style={{ height: 200 }} />
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text)' }}>All Ratios</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="text-left pb-2 font-medium" style={{ color: 'var(--muted)' }}>Metric</th>
              <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Value</th>
              <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Benchmark</th>
              <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {allRatios.map(r => (
              <tr
                key={r.label}
                className="border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <td className="py-2 font-medium" style={{ color: 'var(--text)' }}>{r.label}</td>
                <td className="py-2 text-right font-mono" style={{ color: 'var(--text)' }}>{formatValue(r)}</td>
                <td className="py-2 text-right" style={{ color: 'var(--muted)' }}>{r.benchmark}</td>
                <td className="py-2 text-right">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
