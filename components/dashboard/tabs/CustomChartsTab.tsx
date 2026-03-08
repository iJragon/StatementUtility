'use client';

import { useState } from 'react';
import type { AnalysisResult } from '@/lib/models/statement';
import type { ChartSpec } from '@/lib/agents/viz-agent';
import PlotlyChart from '@/components/charts/PlotlyChart';
import { buildFromSpec } from '@/components/charts/chart-builders';

interface CustomChart {
  spec: ChartSpec;
  explanation: string;
  title: string;
}

interface CustomChartsTabProps {
  analysis: AnalysisResult;
  customCharts: CustomChart[];
  onGenerate: (request: string) => Promise<void>;
}

const CHART_SUGGESTIONS = [
  'Monthly payroll vs utilities comparison',
  'Revenue trend with NOI overlay',
  'Top expense categories breakdown',
  'Cash flow month by month',
  'Vacancy loss vs concessions',
];

export default function CustomChartsTab({ analysis, customCharts, onGenerate }: CustomChartsTabProps) {
  const [request, setRequest] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    const q = request.trim();
    if (!q || isGenerating) return;
    setError('');
    setIsGenerating(true);
    try {
      await onGenerate(q);
      setRequest('');
    } catch {
      setError('Failed to generate chart. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text)' }}>Generate Custom Chart</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={request}
            onChange={e => setRequest(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
            placeholder="Describe a chart (e.g., 'Monthly NOI vs budget')"
            disabled={isGenerating}
            className="flex-1 input-field text-sm"
          />
          <button
            onClick={handleGenerate}
            disabled={!request.trim() || isGenerating}
            className="btn-primary whitespace-nowrap"
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <p className="text-xs self-center" style={{ color: 'var(--muted)' }}>Try:</p>
          {CHART_SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => setRequest(s)}
              className="text-xs px-2 py-1 rounded border transition-colors hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Generated charts */}
      {customCharts.length === 0 ? (
        <div className="card text-center py-8">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            className="mx-auto mb-3" style={{ color: 'var(--muted)' }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <p style={{ color: 'var(--muted)' }}>Your custom charts will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {customCharts.map((chart, i) => {
            let chartData: { data: Plotly.Data[]; layout: Partial<Plotly.Layout> };
            try {
              chartData = buildFromSpec(chart.spec, analysis.statement);
            } catch {
              return (
                <div key={i} className="card">
                  <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text)' }}>{chart.title}</p>
                  <p className="text-sm" style={{ color: 'var(--danger)' }}>Failed to render chart</p>
                </div>
              );
            }

            return (
              <div key={i} className="card">
                <PlotlyChart
                  data={chartData.data}
                  layout={{ title: { text: chart.title }, ...chartData.layout }}
                  style={{ height: 320 }}
                />
                <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>{chart.explanation}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
