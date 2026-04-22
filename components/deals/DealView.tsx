'use client';

import { useState, useCallback, useRef } from 'react';
import type { Deal, DealInputs, DealAnalysis, InvestorProfile } from '@/lib/models/deal';
import type { PropertyEntry } from '@/lib/models/portfolio';
import type { HistoryEntry } from '@/app/dashboard/page';
import DealInputForm from './DealInputForm';
import DealOverviewTab from './tabs/DealOverviewTab';
import ProFormaTab from './tabs/ProFormaTab';
import SensitivityTab from './tabs/SensitivityTab';
import DealNarrativeTab from './tabs/DealNarrativeTab';
import APODTab from './tabs/APODTab';
import MonteCarloTab from './tabs/MonteCarloTab';
import NotesTab from './tabs/NotesTab';
import LinkPropertyModal from './LinkPropertyModal';

interface Props {
  deal: Deal;
  onUpdate: (updated: Deal) => void;
  onDelete: (id: string) => void;
  onShowProfile: () => void;
  onViewInPortfolio?: (propertyId: string) => void;
  history?: HistoryEntry[];
  properties?: PropertyEntry[];
  investorProfile?: InvestorProfile | null;
}

type Tab = 'overview' | 'apod' | 'proforma' | 'sensitivity' | 'montecarlo' | 'notes' | 'narrative';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',    label: 'Overview' },
  { key: 'apod',        label: 'APOD' },
  { key: 'proforma',    label: 'Pro Forma' },
  { key: 'sensitivity', label: 'Sensitivity' },
  { key: 'montecarlo',  label: 'Monte Carlo' },
  { key: 'notes',       label: 'Notes' },
  { key: 'narrative',   label: 'AI Analysis' },
];

const VERDICT_COLORS: Record<string, string> = {
  'strong-buy': 'var(--success)', 'buy': 'var(--success)',
  'conditional': 'var(--warning)',
  'avoid': 'var(--danger)', 'strong-avoid': 'var(--danger)',
  'pass': 'var(--danger)', 'strong-pass': 'var(--danger)',
};

const STATUS_OPTIONS: { value: Deal['status']; label: string; color: string }[] = [
  { value: 'draft',     label: 'Draft',     color: 'var(--muted)' },
  { value: 'analyzed',  label: 'Analyzing', color: 'var(--accent)' },
  { value: 'passed',    label: 'Passed',    color: 'var(--warning)' },
  { value: 'converted', label: 'Acquired',  color: 'var(--success)' },
];

export default function DealView({
  deal,
  onUpdate,
  onDelete,
  onShowProfile,
  onViewInPortfolio,
  history,
  properties = [],
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [editingInputs, setEditingInputs] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [streamingNarrative, setStreamingNarrative] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const hasAnalysis = !!deal.analysis;
  const hasInputs = !!deal.inputs;
  const currentStatus = STATUS_OPTIONS.find(s => s.value === deal.status) ?? STATUS_OPTIONS[0];

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
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
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
          } catch { /* skip malformed lines */ }
        }
      }
      void updatedAnalysis;
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

  async function handleStatusChange(newStatus: Deal['status']) {
    setShowStatusMenu(false);
    try {
      await fetch(`/api/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      onUpdate({ ...deal, status: newStatus });
    } catch {
      setError('Failed to update status.');
    }
  }

  async function handleExport(format: 'excel' | 'pdf') {
    setShowExportMenu(false);
    try {
      const res = await fetch(`/api/deals/${deal.id}/export?format=${format}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        setError(err.error ?? 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = deal.name.replace(/[^a-z0-9_\-. ]/gi, '_').slice(0, 60);
      a.download = `${safeName}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed. Please try again.');
    }
  }

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
            history={history}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>
                {deal.name}
              </h2>
              {deal.analysis?.score && (
                <span
                  className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: `${verdictColor}20`, color: verdictColor }}
                >
                  {deal.analysis.score.total}/100
                </span>
              )}
              {/* Status badge + dropdown */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowStatusMenu(v => !v)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${currentStatus.color}18`, color: currentStatus.color, border: `1px solid ${currentStatus.color}30` }}
                >
                  {currentStatus.label}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showStatusMenu && (
                  <div
                    className="absolute left-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                    style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', minWidth: 140 }}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => handleStatusChange(s.value)}
                        className="w-full text-left px-3 py-2 text-xs flex items-center gap-2"
                        style={{ color: s.value === deal.status ? s.color : 'var(--text)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        {s.label}
                        {s.value === deal.status && ' ✓'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {deal.address && (
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{deal.address}</p>
            )}
            {/* Link to property / View in portfolio */}
            {deal.propertyId && (
              <button
                onClick={() => onViewInPortfolio?.(deal.propertyId!)}
                className="text-xs mt-0.5 flex items-center gap-1"
                style={{ color: 'var(--accent)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                View in Portfolio
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {/* Investor profile */}
            <button
              onClick={onShowProfile}
              className="p-1.5 rounded"
              style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
              title="Investor Profile"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" /><path d="M6 20v-1a6 6 0 0112 0v1" />
              </svg>
            </button>

            {/* Link to property */}
            {hasAnalysis && (
              <button
                onClick={() => setShowLinkModal(true)}
                className="px-2.5 py-1.5 text-xs rounded flex items-center gap-1"
                style={{
                  border: `1px solid ${deal.propertyId ? 'var(--success)' : 'var(--border)'}`,
                  color: deal.propertyId ? 'var(--success)' : 'var(--muted)',
                  backgroundColor: deal.propertyId ? 'rgba(34,197,94,0.06)' : 'var(--surface)',
                }}
                title={deal.propertyId ? 'Change property link' : 'Link to property'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
                {deal.propertyId ? 'Linked' : 'Link'}
              </button>
            )}

            <button
              onClick={() => setEditingInputs(true)}
              className="px-2.5 py-1.5 text-xs rounded"
              style={{ border: '1px solid var(--border)', color: 'var(--text)', backgroundColor: 'var(--surface)' }}
            >
              Edit Inputs
            </button>

            {hasInputs && (
              <button
                onClick={() => handleAnalyze()}
                disabled={analyzing}
                className="btn-primary px-2.5 py-1.5 text-xs"
              >
                {analyzing ? 'Analyzing…' : hasAnalysis ? 'Re-Analyze' : 'Analyze'}
              </button>
            )}

            {/* Export */}
            {hasAnalysis && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setShowExportMenu(prev => !prev)}
                  className="px-2.5 py-1.5 text-xs rounded flex items-center gap-1"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)', backgroundColor: 'var(--surface)' }}
                >
                  Export
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showExportMenu && (
                  <div
                    className="absolute right-0 top-full mt-1 rounded-lg shadow-lg overflow-hidden z-20"
                    style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', minWidth: 150 }}
                  >
                    {(['excel', 'pdf'] as const).map((fmt, i) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        className="w-full text-left px-4 py-2.5 text-xs"
                        style={{ color: 'var(--text)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {fmt === 'excel' ? 'Excel (.xlsx)' : 'PDF'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded"
                style={{ color: 'var(--muted)' }}
                title="Delete deal"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
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

      {/* ── No inputs state ─────────────────────────────────────────────────── */}
      {!hasInputs && !editingInputs && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Enter Deal Details</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            Add property, financing, income, and expense data to run a full underwriting analysis.
          </p>
          <button onClick={() => setEditingInputs(true)} className="btn-primary px-5 py-2 text-sm">
            Enter Inputs
          </button>
        </div>
      )}

      {/* ── Tabs (when analysis exists) ─────────────────────────────────────── */}
      {hasInputs && hasAnalysis && (
        <>
          <div className="flex border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex-shrink-0 py-2.5 px-3 text-xs font-medium transition-colors"
                style={{
                  color: t.key === tab ? 'var(--accent)' : 'var(--muted)',
                  borderBottom: t.key === tab ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {tab === 'overview'    && <DealOverviewTab metrics={deal.analysis!.metrics} score={deal.analysis!.score} inputs={deal.inputs!} />}
            {tab === 'apod'        && <APODTab metrics={deal.analysis!.metrics} inputs={deal.inputs!} proForma={deal.analysis!.proForma} />}
            {tab === 'proforma'    && <ProFormaTab proForma={deal.analysis!.proForma} />}
            {tab === 'sensitivity' && <SensitivityTab sensitivity={deal.analysis!.sensitivity} />}
            {tab === 'montecarlo'  && deal.analysis!.monteCarlo && <MonteCarloTab result={deal.analysis!.monteCarlo} />}
            {tab === 'montecarlo'  && !deal.analysis!.monteCarlo && (
              <div className="flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 240 }}>
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Monte Carlo Not Available</p>
                <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>Re-analyze to generate simulation results.</p>
                <button onClick={() => handleAnalyze()} disabled={analyzing} className="btn-primary px-4 py-2 text-sm">
                  {analyzing ? 'Analyzing…' : 'Re-Analyze'}
                </button>
              </div>
            )}
            {tab === 'notes' && (
              <NotesTab
                dealId={deal.id}
                initialNotes={deal.notes ?? ''}
                onSaved={notes => onUpdate({ ...deal, notes })}
              />
            )}
            {tab === 'narrative' && <DealNarrativeTab narrative={narrative} isStreaming={isStreaming} />}
          </div>
        </>
      )}

      {/* ── Has inputs but not yet analyzed ────────────────────────────────── */}
      {hasInputs && !hasAnalysis && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Ready to Analyze</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            Inputs saved. Click Analyze to run all 37 Gallinelli metrics, 10-year pro forma, and AI recommendation.
          </p>
          <button onClick={() => handleAnalyze()} disabled={analyzing} className="btn-primary px-5 py-2 text-sm">
            {analyzing ? 'Analyzing…' : 'Analyze Deal'}
          </button>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showLinkModal && (
        <LinkPropertyModal
          dealId={deal.id}
          dealName={deal.name}
          currentPropertyId={deal.propertyId}
          properties={properties}
          onLinked={(propertyId, _name) => {
            setShowLinkModal(false);
            onUpdate({ ...deal, propertyId, status: 'converted' });
          }}
          onUnlinked={() => {
            setShowLinkModal(false);
            onUpdate({ ...deal, propertyId: undefined, status: 'analyzed' });
          }}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  );
}
