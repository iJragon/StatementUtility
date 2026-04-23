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
  onPropertyLinked?: () => void;
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
  onPropertyLinked,
  history,
  properties = [],
  investorProfile,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [editingInputs, setEditingInputs] = useState(deal.status === 'draft');
  const [analyzing, setAnalyzing] = useState(false);
  const [streamingNarrative, setStreamingNarrative] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
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
            Edit Inputs: {deal.name}
          </h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <DealInputForm
            dealId={deal.id}
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
      <div className="px-4 pt-3 border-b" style={{ borderColor: 'var(--border)' }}>

        {/* Row 1: Deal name + My Profile */}
        <div className="flex items-start justify-between gap-3 mb-0.5">
          <h2 className="text-base font-bold leading-snug" style={{ color: 'var(--text)' }}>
            {deal.name}
          </h2>
          <button
            onClick={onShowProfile}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs shrink-0 transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--muted)', backgroundColor: 'var(--surface)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" /><path d="M6 20v-1a6 6 0 0112 0v1" />
            </svg>
            My Profile
          </button>
        </div>

        {/* Row 2: Address */}
        {deal.address && (
          <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{deal.address}</p>
        )}

        {/* Row 3: Status + score + portfolio chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(v => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: `${currentStatus.color}15`, color: currentStatus.color, border: `1px solid ${currentStatus.color}35` }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: currentStatus.color }} />
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
                    {s.value === deal.status && (
                      <svg className="ml-auto" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Score chip */}
          {deal.analysis?.score && (
            <span
              className="px-2 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: `${verdictColor}15`, color: verdictColor, border: `1px solid ${verdictColor}35` }}
            >
              {deal.analysis.score.total}/100
            </span>
          )}

          {/* Portfolio chip */}
          {deal.propertyId && (
            <button
              onClick={() => onViewInPortfolio?.(deal.propertyId!)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors"
              style={{ backgroundColor: 'rgba(34,197,94,0.10)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.25)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.10)')}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              In Portfolio
            </button>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between gap-2 pt-2.5 pb-3 border-t" style={{ borderColor: 'var(--border)' }}>
          {/* Left: secondary actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEditingInputs(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors"
              style={{ border: '1px solid var(--border)', color: 'var(--text)', backgroundColor: 'var(--surface)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit Inputs
            </button>

            {/* ··· overflow menu: export + portfolio link */}
            {hasAnalysis && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setShowExportMenu(v => !v)}
                  className="flex items-center justify-center w-8 h-[30px] rounded text-xs transition-colors"
                  style={{ border: '1px solid var(--border)', color: 'var(--muted)', backgroundColor: 'var(--surface)' }}
                  title="More options"
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                {showExportMenu && (
                  <div
                    className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-20 overflow-hidden"
                    style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', minWidth: 175 }}
                  >
                    <p className="px-3 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)', fontSize: '0.6rem' }}>
                      Export
                    </p>
                    {(['excel', 'pdf'] as const).map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5"
                        style={{ color: 'var(--text)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)' }}>
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        {fmt === 'excel' ? 'Excel (.xlsx)' : 'PDF Report'}
                      </button>
                    ))}
                    <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />
                    <button
                      onClick={() => { setShowLinkModal(true); setShowExportMenu(false); }}
                      className="w-full text-left px-3 py-2 mb-1 text-xs flex items-center gap-2.5"
                      style={{ color: 'var(--text)' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)' }}>
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                      {deal.propertyId ? 'Change Portfolio Link' : 'Add to Portfolio'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: primary action */}
          {hasInputs && (
            <button
              onClick={() => handleAnalyze()}
              disabled={analyzing}
              className="btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
            >
              {analyzing ? (
                <>
                  <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  {isStreaming ? 'Writing…' : 'Analyzing…'}
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  {hasAnalysis ? 'Re-Analyze' : 'Analyze Deal'}
                </>
              )}
            </button>
          )}
        </div>

        {error && (
          <div className="-mt-1 mb-3 text-xs px-3 py-2 rounded alert-error">{error}</div>
        )}
      </div>

      {/* ── Profile staleness banner ────────────────────────────────────────── */}
      {!editingInputs && deal.analysis && (() => {
        const snap = deal.profileSnapshot;
        const cur  = investorProfile;

        if (!snap && cur) {
          return (
            <div
              className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between gap-3"
              style={{ backgroundColor: 'rgba(37,99,235,0.07)', borderBottom: '1px solid rgba(37,99,235,0.2)', borderLeft: '4px solid var(--accent)' }}
            >
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  This analysis has no profile record. Re-Analyze to link it to your current investor profile.
                </p>
              </div>
              <button
                onClick={() => handleAnalyze()}
                disabled={analyzing}
                className="btn-primary px-2.5 py-1 text-xs shrink-0"
              >
                {analyzing ? 'Analyzing…' : 'Re-Analyze'}
              </button>
            </div>
          );
        }

        if (!snap || !cur) return null;

        const diffs: { label: string; old: string; now: string }[] = [];
        if (Math.abs(snap.targetCashOnCash - cur.targetCashOnCash) > 0.0001)
          diffs.push({ label: 'CoC target', old: `${(snap.targetCashOnCash * 100).toFixed(1)}%`, now: `${(cur.targetCashOnCash * 100).toFixed(1)}%` });
        if (Math.abs(snap.targetIRR - cur.targetIRR) > 0.0001)
          diffs.push({ label: 'IRR target', old: `${(snap.targetIRR * 100).toFixed(1)}%`, now: `${(cur.targetIRR * 100).toFixed(1)}%` });
        if (snap.holdPeriod !== cur.holdPeriod)
          diffs.push({ label: 'Hold period', old: `${snap.holdPeriod} yr`, now: `${cur.holdPeriod} yr` });
        if (Math.abs(snap.taxBracket - cur.taxBracket) > 0.0001)
          diffs.push({ label: 'Tax bracket', old: `${(snap.taxBracket * 100).toFixed(0)}%`, now: `${(cur.taxBracket * 100).toFixed(0)}%` });
        if (snap.riskTolerance !== cur.riskTolerance)
          diffs.push({ label: 'Risk', old: snap.riskTolerance, now: cur.riskTolerance });
        if (diffs.length === 0) return null;

        return (
          <div
            className="px-4 py-3 flex-shrink-0"
            style={{ backgroundColor: 'rgba(245,158,11,0.10)', borderBottom: '1px solid rgba(245,158,11,0.35)', borderLeft: '4px solid var(--warning)' }}
          >
            <div className="flex items-start gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--warning)' }}>
                  Profile changed since last analysis — scores may not reflect your current targets
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                  {diffs.map(d => (
                    <span key={d.label} className="text-xs" style={{ color: 'var(--muted)' }}>
                      <span style={{ color: 'var(--text)' }}>{d.label}:</span>{' '}
                      <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{d.old}</span>
                      {' → '}
                      <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{d.now}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
            {tab === 'overview'    && <DealOverviewTab metrics={deal.analysis!.metrics} score={deal.analysis!.score} inputs={deal.inputs!} investorProfile={investorProfile} />}
            {tab === 'apod'        && <APODTab metrics={deal.analysis!.metrics} inputs={deal.inputs!} proForma={deal.analysis!.proForma} />}
            {tab === 'proforma'    && <ProFormaTab proForma={deal.analysis!.proForma} inputs={deal.inputs!} />}
            {tab === 'sensitivity' && <SensitivityTab sensitivity={deal.analysis!.sensitivity} investorProfile={investorProfile} />}
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
            onPropertyLinked?.();
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
