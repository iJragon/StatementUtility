'use client';

import { useState } from 'react';
import type { AnalysisResult, Anomaly } from '@/lib/models/statement';

interface AnomaliesTabProps {
  analysis: AnalysisResult;
  anomalyExplanations: Record<number, string>;
  onExplain: (index: number) => void;
}

type SeverityFilter = 'all' | 'high' | 'medium' | 'low';

const SEVERITY_COLORS: Record<string, string> = {
  high: 'badge-bad',
  medium: 'badge-warning',
  low: 'badge-unknown',
};

const TYPE_LABELS: Record<string, string> = {
  missing_data: 'Missing Data',
  sign_change: 'Sign Change',
  outlier: 'Outlier',
  cashflow_vs_netincome: 'CF vs NI',
  negative_noi: 'Negative NOI',
  structural: 'Structural',
};

function renderExplanation(text: string) {
  return <p className="text-sm leading-6" style={{ color: 'var(--text)' }}>{text}</p>;
}

export default function AnomaliesTab({ analysis, anomalyExplanations, onExplain }: AnomaliesTabProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [explaining, setExplaining] = useState<Record<number, boolean>>({});

  const { anomalies } = analysis;

  const filtered = severityFilter === 'all'
    ? anomalies
    : anomalies.filter(a => a.severity === severityFilter);

  const counts = {
    all: anomalies.length,
    high: anomalies.filter(a => a.severity === 'high').length,
    medium: anomalies.filter(a => a.severity === 'medium').length,
    low: anomalies.filter(a => a.severity === 'low').length,
  };

  async function handleExplain(index: number) {
    setExplaining(prev => ({ ...prev, [index]: true }));
    await onExplain(index);
    setExplaining(prev => ({ ...prev, [index]: false }));
  }

  // Find original index in the full anomaly array
  function getOriginalIndex(anomaly: Anomaly): number {
    return anomalies.indexOf(anomaly);
  }

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex gap-2">
        {(['all', 'high', 'medium', 'low'] as SeverityFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className="px-3 py-1 text-xs rounded-full border transition-colors"
            style={{
              borderColor: severityFilter === s ? 'var(--accent)' : 'var(--border)',
              backgroundColor: severityFilter === s ? 'var(--accent)' : 'transparent',
              color: severityFilter === s ? 'white' : 'var(--muted)',
            }}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-8">
          <p style={{ color: 'var(--muted)' }}>No {severityFilter !== 'all' ? severityFilter + ' severity ' : ''}anomalies detected.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(anomaly => {
            const origIdx = getOriginalIndex(anomaly);
            const explanation = anomalyExplanations[origIdx];
            const isExplaining = explaining[origIdx];

            return (
              <div key={`${anomaly.cellRef}-${origIdx}`} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={SEVERITY_COLORS[anomaly.severity]}>{anomaly.severity}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--border)', color: 'var(--muted)' }}
                      >
                        {TYPE_LABELS[anomaly.type] ?? anomaly.type}
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                        {anomaly.cellRef}
                      </span>
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{anomaly.label}</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{anomaly.description}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span style={{ color: 'var(--muted)' }}>Detected: </span>
                        <span style={{ color: 'var(--text)' }}>{anomaly.detected}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)' }}>Expected: </span>
                        <span style={{ color: 'var(--text)' }}>{anomaly.expected}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleExplain(origIdx)}
                    disabled={isExplaining}
                    className="shrink-0 px-3 py-1.5 text-xs rounded-md border transition-colors"
                    style={{
                      borderColor: 'var(--accent)',
                      color: 'var(--accent)',
                      opacity: isExplaining ? 0.6 : 1,
                    }}
                  >
                    {isExplaining ? 'Explaining...' : 'Explain with AI'}
                  </button>
                </div>

                {explanation !== undefined && (
                  <div
                    className="mt-3 pt-3 border-t"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--accent)' }}>AI Explanation</p>
                    {explanation ? renderExplanation(explanation) : (
                      <div className="flex gap-1">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-2 rounded animate-pulse flex-1" style={{ backgroundColor: 'var(--border)' }} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
