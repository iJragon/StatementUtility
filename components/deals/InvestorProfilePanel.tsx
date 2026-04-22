'use client';

import { useState } from 'react';
import type { InvestorProfile } from '@/lib/models/deal';

interface Props {
  profile: InvestorProfile;
  onSave: (profile: InvestorProfile) => Promise<void>;
  onClose: () => void;
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</span>
          <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>{hint}</span>
        </div>
        <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: 'var(--accent)', backgroundColor: 'var(--border)' }}
      />
      <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
        <span>{min}{label.includes('%') ? '%' : label === 'Hold Period' ? ' yr' : ''}</span>
        <span>{max}{label.includes('%') ? '%' : label === 'Hold Period' ? ' yr' : ''}</span>
      </div>
    </div>
  );
}

const TAX_BRACKETS = [
  { label: '10%',  value: 0.10 },
  { label: '12%',  value: 0.12 },
  { label: '22%',  value: 0.22 },
  { label: '24%',  value: 0.24 },
  { label: '32%',  value: 0.32 },
  { label: '35%',  value: 0.35 },
  { label: '37%',  value: 0.37 },
];

export default function InvestorProfilePanel({ profile, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<InvestorProfile>({ ...profile });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof InvestorProfile>(key: K, value: InvestorProfile[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Investor Profile</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              These targets calibrate the deal scoring and AI analysis to your goals.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded" style={{ color: 'var(--muted)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Risk Tolerance */}
          <div className="mb-5">
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Risk Tolerance</p>
            <div className="grid grid-cols-3 gap-2">
              {(['conservative', 'moderate', 'aggressive'] as const).map(rt => (
                <button
                  key={rt}
                  onClick={() => set('riskTolerance', rt)}
                  className="py-2 rounded-lg text-xs font-medium capitalize transition-all"
                  style={{
                    backgroundColor: draft.riskTolerance === rt ? 'var(--accent)' : 'var(--bg)',
                    color: draft.riskTolerance === rt ? '#fff' : 'var(--muted)',
                    border: `1px solid ${draft.riskTolerance === rt ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {rt}
                </button>
              ))}
            </div>
          </div>

          <SliderRow
            label="Target Cash-on-Cash %"
            hint="Minimum CoC you require"
            value={draft.targetCashOnCash * 100}
            min={2} max={20} step={0.5}
            display={`${(draft.targetCashOnCash * 100).toFixed(1)}%`}
            onChange={v => set('targetCashOnCash', v / 100)}
          />

          <SliderRow
            label="Target IRR %"
            hint="Hurdle rate over hold period"
            value={draft.targetIRR * 100}
            min={4} max={30} step={0.5}
            display={`${(draft.targetIRR * 100).toFixed(1)}%`}
            onChange={v => set('targetIRR', v / 100)}
          />

          <SliderRow
            label="Hold Period"
            hint="Expected years before exit"
            value={draft.holdPeriod}
            min={1} max={20} step={1}
            display={`${draft.holdPeriod} yr`}
            onChange={v => set('holdPeriod', v)}
          />

          {/* Tax Bracket */}
          <div className="mb-5">
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
              Marginal Tax Bracket
              <span className="text-xs ml-2 font-normal" style={{ color: 'var(--muted)' }}>Affects after-tax cash flow calculations</span>
            </p>
            <div className="grid grid-cols-4 gap-2">
              {TAX_BRACKETS.map(tb => (
                <button
                  key={tb.value}
                  onClick={() => set('taxBracket', tb.value)}
                  className="py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor: Math.abs(draft.taxBracket - tb.value) < 0.001 ? 'var(--accent)' : 'var(--bg)',
                    color: Math.abs(draft.taxBracket - tb.value) < 0.001 ? '#fff' : 'var(--muted)',
                    border: `1px solid ${Math.abs(draft.taxBracket - tb.value) < 0.001 ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {tb.label}
                </button>
              ))}
            </div>
          </div>

          {/* Impact summary */}
          <div
            className="rounded-lg p-3 mb-4 text-xs"
            style={{ backgroundColor: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', color: 'var(--muted)' }}
          >
            Scoring calibrated for a <strong style={{ color: 'var(--text)' }}>{draft.riskTolerance}</strong> investor
            targeting <strong style={{ color: 'var(--text)' }}>{(draft.targetCashOnCash * 100).toFixed(1)}% CoC</strong> and{' '}
            <strong style={{ color: 'var(--text)' }}>{(draft.targetIRR * 100).toFixed(1)}% IRR</strong> over{' '}
            <strong style={{ color: 'var(--text)' }}>{draft.holdPeriod} years</strong>, at a{' '}
            <strong style={{ color: 'var(--text)' }}>{(draft.taxBracket * 100).toFixed(0)}%</strong> tax bracket.
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1 py-2.5 text-sm"
            >
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Profile'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm rounded"
              style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              Close
            </button>
          </div>
          {saved && (
            <p className="text-xs text-center mt-2" style={{ color: 'var(--muted)' }}>
              Re-analyze any deal to apply the updated targets.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
