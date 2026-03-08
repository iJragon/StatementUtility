'use client';

import { useState } from 'react';
import type { AnalysisResult } from '@/lib/models/statement';
import PlotlyChart from '@/components/charts/PlotlyChart';
import { trendComparison } from '@/components/charts/chart-builders';

interface TrendsTabProps {
  analysis: AnalysisResult;
}

const DEFAULT_METRICS = ['total_revenue', 'total_operating_expenses', 'noi', 'cash_flow'];

const DIRECTION_COLORS: Record<string, string> = {
  improving: 'var(--success)',
  worsening: 'var(--danger)',
  stable: 'var(--muted)',
  volatile: 'var(--warning)',
};

function formatPct(val: number | null): string {
  if (val === null) return 'N/A';
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
}

function formatDollar(val: number | null): string {
  if (val === null) return 'N/A';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

export default function TrendsTab({ analysis }: TrendsTabProps) {
  const { trends } = analysis;
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(DEFAULT_METRICS);

  const chart = trendComparison(trends, selectedMetrics);

  function toggleMetric(metric: string) {
    setSelectedMetrics(prev =>
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric],
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric selector */}
      <div className="card">
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--muted)' }}>SELECT METRICS</p>
        <div className="flex flex-wrap gap-2">
          {trends.series.map(series => (
            <button
              key={series.metric}
              onClick={() => toggleMetric(series.metric)}
              className="px-3 py-1 text-xs rounded-full border transition-colors"
              style={{
                borderColor: selectedMetrics.includes(series.metric) ? 'var(--accent)' : 'var(--border)',
                backgroundColor: selectedMetrics.includes(series.metric) ? 'var(--accent)' : 'transparent',
                color: selectedMetrics.includes(series.metric) ? 'white' : 'var(--muted)',
              }}
            >
              {series.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="card">
        <PlotlyChart data={chart.data} layout={chart.layout} style={{ height: 360 }} />
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text)' }}>Trend Summary</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="text-left pb-2 font-medium" style={{ color: 'var(--muted)' }}>Metric</th>
              <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Direction</th>
              <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Overall Change</th>
              <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Peak Month</th>
              <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Trough Month</th>
              <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Avg Value</th>
            </tr>
          </thead>
          <tbody>
            {trends.series.map(series => (
              <tr
                key={series.metric}
                className="border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <td className="py-2 font-medium" style={{ color: 'var(--text)' }}>{series.label}</td>
                <td className="py-2 text-right">
                  <span style={{ color: DIRECTION_COLORS[series.trendDirection] }}>
                    {series.trendDirection}
                  </span>
                </td>
                <td className="py-2 text-right font-mono" style={{
                  color: series.overallPctChange !== null && series.overallPctChange >= 0
                    ? 'var(--success)' : 'var(--danger)',
                }}>
                  {formatPct(series.overallPctChange)}
                </td>
                <td className="py-2 text-right" style={{ color: 'var(--muted)' }}>{series.peakMonth ?? 'N/A'}</td>
                <td className="py-2 text-right" style={{ color: 'var(--muted)' }}>{series.troughMonth ?? 'N/A'}</td>
                <td className="py-2 text-right font-mono" style={{ color: 'var(--text)' }}>
                  {formatDollar(series.avgValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
