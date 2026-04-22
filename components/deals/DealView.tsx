'use client';

import { useState, useCallback } from 'react';
import type { Deal, DealInputs, DealAnalysis } from '@/lib/models/deal';
import DealInputForm from './DealInputForm';
import DealOverviewTab from './tabs/DealOverviewTab';
import ProFormaTab from './tabs/ProFormaTab';
import SensitivityTab from './tabs/SensitivityTab';
import DealNarrativeTab from './tabs/DealNarrativeTab';

interface Props {
  deal: Deal;
  onUpdate: (updated: Deal) => void;
  onDelete: (id: string) => void;
}

type Tab = 'overview' | 'proforma' | 'sensitivity' | 'narrative';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',    label: 'Overview' },
  { key: 'proforma',    label: 'Pro Forma' },
  { key: 'sensitivity', label: 'Sensitivity' },
  { key: 'narrative',   label: 'AI Analysis' },
];

const VERDICT_COLORS: Record<string, string> = {
  'strong-buy':  '#15803d',
  'buy':         '#16a34a',
  'conditional': '#b45309',
  'avoid':       '#dc2626',
  'strong-avoid':'#991b1b',
  'pass':        '#dc2626',
  'strong-pass': '#991b1b',
};

export default function DealView({ deal, onUpdate, onDelete }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [editingInputs, setEditingInputs] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [streamingNarrative, setStreamingNarrative] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const hasAnalysis = !!deal.analysis;
  const hasInputs = !!deal.inputs;

  const handleSaveInputs = useCallback(async (inputs: DealInputs) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      });
      if (!res.ok) throw new Error('Failed to save inputs');
      onUpdate({ ...deal, inputs });
      setEditingInputs(false);
      // Auto-trigger analysis after saving inputs
      handleAnalyze({ ...deal, inputs });
    } catch {
      setError('Failed to save inputs. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [deal, onUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnalyze = useCallback(async (dealToAnalyze: Deal = deal) => {
    if (!dealToAnalyze.inputs) return;
    setAnalyzing(true);
    setIsStreaming(false);
    setStreamingNarrative('');
    setError('');
    setTab('overview');

    try {
      const res = await fetch(`/api/deals/${dealToAnalyze.id}/analyze`, { method: 'POST' });
      if (!res.ok) throw new Error('Analysis failed');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let updatedAnalysis: DealAnalysis | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: analysis')) continue;
          if (line.startsWith('event: chunk')) continue;
          if (line.startsWith('event: done')) continue;
          if (line.startsWith('event: error')) continue;
          if (!line.startsWith('data: ')) continue;

          const raw = line.slice(6);
          // Detect which event this data belongs to by peeking at the preceding buffer
          try {
            const parsed = JSON.parse(raw);
            if (parsed.metrics && parsed.proForma && parsed.score) {
              updatedAnalysis = parsed as DealAnalysis;
              onUpdate({ ...dealToAnalyze, analysis: updatedAnalysis, status: 'analyzed' });
            } else if (parsed.text !== undefined) {
              setIsStreaming(true);
              setStreamingNarrative(prev => prev + parsed.text);
              setTab('narrative');
            } else if (parsed.narrativeLength !== undefined) {
              setIsStreaming(false);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch {
      setError('Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
      setIsStreaming(false);
    }
  }, [deal, onUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${deal.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      onDelete(deal.id);
    } catch {
      setError('Failed to delete deal.');
      setConfirmDelete(false);
    }
  }, [deal.id, onDelete]);

  const narrative = streamingNarrative || deal.aiNarrative || '';
  const verdict = deal.analysis?.score?.verdict;
  const verdictColor = verdict ? VERDICT_COLORS[verdict] : undefined;

  if (editingInputs) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setEditingInputs(false)}
            className="text-sm"
            style={{ color: 'var(--muted)' }}
          >
            ← Back
          </button>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Edit Deal Inputs — {deal.name}
          </h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <DealInputForm
            initialInputs={deal.inputs}
            onSave={handleSaveInputs}
            onCancel={() => setEditingInputs(false)}
            saving={saving}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>
                {deal.name}
              </h2>
              {deal.analysis?.score && (
                <span
                  className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: `${verdictColor}20`,
                    color: verdictColor,
                  }}
                >
                  {deal.analysis.score.total}/100
                </span>
              )}
            </div>
            {deal.address && (
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{deal.address}</p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <button
              onClick={() => setEditingInputs(true)}
              className="px-3 py-1.5 text-xs rounded"
              style={{ border: '1px solid var(--border)', color: 'var(--text)', backgroundColor: 'var(--surface)' }}
            >
              Edit Inputs
            </button>
            {hasInputs && (
              <button
                onClick={() => handleAnalyze()}
                disabled={analyzing}
                className="btn-primary px-3 py-1.5 text-xs"
              >
                {analyzing ? 'Analyzing...' : hasAnalysis ? 'Re-Analyze' : 'Analyze'}
              </button>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded"
                style={{ color: 'var(--muted)' }}
                title="Delete deal"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Delete?</span>
                <button onClick={handleDelete} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>No</button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-2 text-xs px-3 py-2 rounded" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {analyzing && !isStreaming && (
          <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--accent)' }}>
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Running financial analysis…
          </div>
        )}
      </div>

      {/* No inputs state */}
      {!hasInputs && !editingInputs && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Enter Deal Details</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            Add property, financing, income, and expense data to run a full underwriting analysis.
          </p>
          <button
            onClick={() => setEditingInputs(true)}
            className="btn-primary px-5 py-2 text-sm"
          >
            Enter Inputs
          </button>
        </div>
      )}

      {/* Tabs (only when analysis exists) */}
      {hasInputs && hasAnalysis && (
        <>
          <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex-1 py-2.5 text-xs font-medium transition-colors"
                style={{
                  color: t.key === tab ? 'var(--accent)' : 'var(--muted)',
                  borderBottom: t.key === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  backgroundColor: 'transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {tab === 'overview' && deal.analysis && (
              <DealOverviewTab
                metrics={deal.analysis.metrics}
                score={deal.analysis.score}
                inputs={deal.inputs!}
              />
            )}
            {tab === 'proforma' && deal.analysis && (
              <ProFormaTab proForma={deal.analysis.proForma} />
            )}
            {tab === 'sensitivity' && deal.analysis && (
              <SensitivityTab sensitivity={deal.analysis.sensitivity} />
            )}
            {tab === 'narrative' && (
              <DealNarrativeTab narrative={narrative} isStreaming={isStreaming} />
            )}
          </div>
        </>
      )}

      {/* Has inputs but no analysis yet */}
      {hasInputs && !hasAnalysis && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Ready to Analyze</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            Inputs are saved. Click Analyze to run all 37 Gallinelli metrics, build a 10-year pro forma, and get an AI recommendation.
          </p>
          <button
            onClick={() => handleAnalyze()}
            disabled={analyzing}
            className="btn-primary px-5 py-2 text-sm"
          >
            {analyzing ? 'Analyzing...' : 'Analyze Deal'}
          </button>
        </div>
      )}
    </div>
  );
}
