'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DealInputs, OperatingExpenseBreakdown, ValidationWarning } from '@/lib/models/deal';
import { DEFAULT_DEAL_INPUTS } from '@/lib/models/deal';
import { validateDealInputs } from '@/lib/analysis/deal-validation';
import type { HistoryEntry } from '@/app/dashboard/page';

interface Props {
  dealId: string;
  initialInputs?: DealInputs;
  onSave: (inputs: DealInputs) => void;
  onCancel: () => void;
  saving?: boolean;
  history?: HistoryEntry[];
}

type Step = 'property' | 'financing' | 'income' | 'expenses' | 'assumptions';

const STEPS: { key: Step; label: string }[] = [
  { key: 'property',    label: 'Property' },
  { key: 'financing',   label: 'Financing' },
  { key: 'income',      label: 'Income' },
  { key: 'expenses',    label: 'Expenses' },
  { key: 'assumptions', label: 'Assumptions' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{label}</label>
      {hint && <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{hint}</p>}
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    setRaw(value === 0 ? '' : String(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    if (!/^-?\d*\.?\d*$/.test(text)) return;
    setRaw(text);
    const parsed = parseFloat(text);
    onChange(isNaN(parsed) ? 0 : parsed);
  }

  function handleBlur() {
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) {
      setRaw('');
      onChange(0);
    } else {
      setRaw(String(parsed));
    }
  }

  return (
    <div className="flex items-center" style={{ border: '1px solid var(--border)', borderRadius: '0.375rem', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>
      {prefix && (
        <span className="px-2 py-2 text-sm" style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', borderRight: '1px solid var(--border)' }}>
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={raw}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="0"
        className="flex-1 px-3 py-2 text-sm outline-none"
        style={{ backgroundColor: 'transparent', color: 'var(--text)', minWidth: 0 }}
      />
      {suffix && (
        <span className="px-2 py-2 text-sm" style={{ backgroundColor: 'var(--surface)', color: 'var(--muted)', borderLeft: '1px solid var(--border)' }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

function PctInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <NumberInput
      value={parseFloat((value * 100).toFixed(4))}
      onChange={v => onChange(v / 100)}
      suffix="%"
    />
  );
}

function WarningBanner({ warnings }: { warnings: ValidationWarning[] }) {
  if (warnings.length === 0) return null;
  const errors = warnings.filter(w => w.level === 'error');
  const warns  = warnings.filter(w => w.level === 'warn');

  return (
    <div className="space-y-1 mb-2">
      {errors.map((w, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-3 py-2 rounded text-xs"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }}
        >
          <svg className="shrink-0 mt-0.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {w.message}
        </div>
      ))}
      {warns.map((w, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-3 py-2 rounded text-xs"
          style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', color: 'var(--warning)' }}
        >
          <svg className="shrink-0 mt-0.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {w.message}
        </div>
      ))}
    </div>
  );
}

// ── T12 Import Modal ──────────────────────────────────────────────────────────

interface T12ModalProps {
  history: HistoryEntry[];
  onImport: (inputs: Partial<DealInputs>) => void;
  onClose: () => void;
}

function T12ImportModal({ history, onImport, onClose }: T12ModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importNote, setImportNote] = useState('');

  async function handleSelect(entry: HistoryEntry) {
    setLoading(true);
    setError('');
    setImportNote('');
    try {
      // Use the AI-powered generic import — reads all rows, not just named keyFigures
      const res = await fetch('/api/deals/t12-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: entry.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Import failed');
      }
      const { inputs, importNotes } = await res.json() as {
        inputs: Partial<DealInputs>;
        importNotes: string;
      };
      if (importNotes) setImportNote(importNotes);
      onImport(inputs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl p-5 max-w-md w-full mx-4 shadow-xl"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Import from T12 Analysis
          </h3>
          <button onClick={onClose} className="p-1 rounded" style={{ color: 'var(--muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
          AI reads every row. Works with any statement format, any layout.
        </p>

        {error && (
          <p className="text-xs mb-2 px-3 py-2 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {importNote && (
          <p className="text-xs mb-2 px-3 py-2 rounded" style={{ backgroundColor: 'rgba(37,99,235,0.06)', color: 'var(--muted)', border: '1px solid rgba(37,99,235,0.15)' }}>
            {importNote}
          </p>
        )}

        {history.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
            No analyzed statements found. Upload a T12 to the main dashboard first.
          </p>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-1">
            {history.map(entry => (
              <button
                key={entry.id}
                onClick={() => handleSelect(entry)}
                disabled={loading}
                className="w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors"
                style={{
                  backgroundColor: 'var(--bg)',
                  border: '1px solid var(--border)',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                  {entry.propertyName}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {entry.period} · {entry.fileName}
                </p>
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs" style={{ color: 'var(--accent)' }}>
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            AI reading statement rows…
          </div>
        )}
      </div>
    </div>
  );
}

// ── Spreadsheet Import Modal ──────────────────────────────────────────────────

interface FileImportModalProps {
  onImport: (inputs: Partial<DealInputs>) => void;
  onClose: () => void;
}

function FileImportModal({ onImport, onClose }: FileImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importNote, setImportNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError('');
    setImportNote('');
    setLoading(true);

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    try {
      let res: Response;

      if (isPdf) {
        // Extract text in the browser — avoids any server-side file size limits
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map(item => ('str' in item ? item.str : ''))
            .join(' ')
            .trim();
          if (pageText) pages.push(pageText);
        }
        const text = pages.join('\n');
        if (!text.trim()) {
          throw new Error('No text found in this PDF. It may be a scanned image — try a text-based PDF.');
        }

        res = await fetch('/api/deals/file-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      } else {
        const formData = new FormData();
        formData.append('file', file);
        res = await fetch('/api/deals/file-import', { method: 'POST', body: formData });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Import failed');
      }
      const { inputs, importNotes } = await res.json() as { inputs: Partial<DealInputs>; importNotes: string };
      if (importNotes) setImportNote(importNotes);
      onImport(inputs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import');
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl p-5 max-w-md w-full mx-4 shadow-xl"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Import from Spreadsheet or PDF</h3>
          <button onClick={onClose} className="p-1 rounded" style={{ color: 'var(--muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          Upload an Excel, CSV, or PDF file — offering memorandums, rent rolls, pro formas, any format. AI extracts what it can; missing fields default to current market rates.
        </p>

        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {importNote && (
          <p className="text-xs mb-3 px-3 py-2 rounded" style={{ backgroundColor: 'rgba(37,99,235,0.06)', color: 'var(--muted)', border: '1px solid rgba(37,99,235,0.15)' }}>
            {importNote}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs" style={{ color: 'var(--accent)' }}>
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            AI reading spreadsheet…
          </div>
        ) : (
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors"
            style={{ borderColor: 'var(--border)' }}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <svg className="mx-auto mb-2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)' }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Drop file here or click to browse</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>.xlsx · .xls · .csv · .pdf</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DealInputForm({ dealId, initialInputs, onSave, onCancel, saving, history }: Props) {
  const [step, setStep] = useState<Step>('property');
  const [inputs, setInputs] = useState<DealInputs>(initialInputs ?? DEFAULT_DEAL_INPUTS);
  const [showT12Modal, setShowT12Modal] = useState(false);
  const [showFileImportModal, setShowFileImportModal] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef      = useRef(inputs);
  const lastSavedRef   = useRef(JSON.stringify(initialInputs ?? DEFAULT_DEAL_INPUTS));
  const didMountRef    = useRef(false);

  // Keep latestRef current so the unmount cleanup can read it
  useEffect(() => { latestRef.current = inputs; }, [inputs]);

  const draftSave = useCallback(async (current: DealInputs) => {
    const json = JSON.stringify(current);
    if (json === lastSavedRef.current) return;
    setDraftSaveState('saving');
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: current }),
      });
      if (!res.ok) throw new Error();
      lastSavedRef.current = json;
      setDraftSaveState('saved');
      setTimeout(() => setDraftSaveState('idle'), 2000);
    } catch {
      setDraftSaveState('error');
    }
  }, [dealId]);

  // Debounce auto-save 1.5s after any input change
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => draftSave(inputs), 1500);
  }, [inputs, draftSave]);

  // Save immediately when navigating away (unmount)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const json = JSON.stringify(latestRef.current);
      if (json !== lastSavedRef.current) {
        fetch(`/api/deals/${dealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: latestRef.current }),
        });
      }
    };
  }, [dealId]);

  const warnings = validateDealInputs(inputs);
  const stepWarnings = warnings.filter(w => w.step === step);
  const hasHistory = (history?.length ?? 0) > 0;

  function set<K extends keyof DealInputs>(key: K, value: DealInputs[K]) {
    setInputs(prev => ({ ...prev, [key]: value }));
  }

  function setExpense(key: keyof OperatingExpenseBreakdown, value: number) {
    setInputs(prev => ({ ...prev, expenses: { ...prev.expenses, [key]: value } }));
  }

  function applyFileImport(prefill: Partial<DealInputs>) {
    setInputs(prev => ({
      ...prev,
      ...(prefill.purchasePrice       !== undefined && { purchasePrice:        prefill.purchasePrice }),
      ...(prefill.downPayment         !== undefined && { downPayment:          prefill.downPayment }),
      ...(prefill.interestRate        !== undefined && { interestRate:         prefill.interestRate }),
      ...(prefill.amortizationYears   !== undefined && { amortizationYears:    prefill.amortizationYears }),
      ...(prefill.loanTermYears       !== undefined && { loanTermYears:        prefill.loanTermYears }),
      ...(prefill.closingCostRate     !== undefined && { closingCostRate:      prefill.closingCostRate }),
      ...(prefill.capexBudget         !== undefined && { capexBudget:          prefill.capexBudget }),
      ...(prefill.grossScheduledIncome !== undefined && { grossScheduledIncome: prefill.grossScheduledIncome }),
      ...(prefill.otherIncome         !== undefined && { otherIncome:          prefill.otherIncome }),
      ...(prefill.vacancyRate         !== undefined && { vacancyRate:          prefill.vacancyRate }),
      ...(prefill.rentGrowthRate      !== undefined && { rentGrowthRate:       prefill.rentGrowthRate }),
      ...(prefill.expenseGrowthRate   !== undefined && { expenseGrowthRate:    prefill.expenseGrowthRate }),
      ...(prefill.exitCapRate         !== undefined && { exitCapRate:          prefill.exitCapRate }),
      ...(prefill.holdPeriod          !== undefined && { holdPeriod:           prefill.holdPeriod }),
      ...(prefill.propertyType        !== undefined && { propertyType:         prefill.propertyType }),
      expenses: prefill.expenses ? { ...prev.expenses, ...prefill.expenses } : prev.expenses,
    }));
    setShowFileImportModal(false);
    setStep('property');
  }

  function applyT12Import(prefill: Partial<DealInputs>) {
    setInputs(prev => ({
      ...prev,
      ...(prefill.grossScheduledIncome !== undefined && { grossScheduledIncome: prefill.grossScheduledIncome }),
      expenses: prefill.expenses
        ? { ...prev.expenses, ...prefill.expenses }
        : prev.expenses,
    }));
    setShowT12Modal(false);
    // Navigate to income step to show imported values
    if (prefill.grossScheduledIncome !== undefined) {
      setStep('income');
    }
  }

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const expenseFields: Array<{ key: keyof OperatingExpenseBreakdown; label: string }> = [
    { key: 'propertyTaxes', label: 'Property Taxes' },
    { key: 'insurance',     label: 'Insurance' },
    { key: 'utilities',     label: 'Utilities' },
    { key: 'maintenance',   label: 'Maintenance & Repairs' },
    { key: 'managementFee', label: 'Management Fee' },
    { key: 'reserves',      label: 'Reserves' },
    { key: 'landscaping',   label: 'Landscaping' },
    { key: 'janitorial',    label: 'Janitorial' },
    { key: 'marketing',     label: 'Marketing' },
    { key: 'administrative',label: 'Administrative' },
    { key: 'payroll',       label: 'Payroll' },
    { key: 'miscellaneous', label: 'Miscellaneous' },
  ];

  const allErrors = warnings.filter(w => w.level === 'error');
  const canSave = allErrors.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Step tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
        {STEPS.map((s, i) => {
          const hasWarning = warnings.some(w => w.step === s.key && w.level === 'warn');
          const hasError   = warnings.some(w => w.step === s.key && w.level === 'error');
          return (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className="flex-1 py-2 text-xs font-medium transition-colors"
              style={{
                color: s.key === step ? 'var(--accent)' : 'var(--muted)',
                borderBottom: s.key === step ? '2px solid var(--accent)' : '2px solid transparent',
                backgroundColor: 'transparent',
              }}
            >
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-xs mr-1"
                style={{
                  backgroundColor: hasError ? 'var(--danger)' : hasWarning ? 'var(--warning)' : s.key === step ? 'var(--accent)' : 'var(--border)',
                  color: (hasError || hasWarning || s.key === step) ? '#fff' : 'var(--muted)',
                }}
              >
                {i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Per-step warnings */}
        <WarningBanner warnings={stepWarnings} />

        {step === 'property' && (
          <>
            <button
              onClick={() => setShowFileImportModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm"
              style={{ border: '1px dashed var(--accent)', color: 'var(--accent)', backgroundColor: 'rgba(37,99,235,0.04)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Import from Spreadsheet or PDF
            </button>
            <Field label="Property Type">
              <div className="flex gap-2">
                {(['residential', 'commercial', 'mixed'] as const).map(pt => (
                  <button
                    key={pt}
                    onClick={() => set('propertyType', pt)}
                    className="flex-1 py-2 text-sm rounded capitalize"
                    style={{
                      backgroundColor: inputs.propertyType === pt ? 'var(--accent)' : 'var(--surface)',
                      color: inputs.propertyType === pt ? '#fff' : 'var(--text)',
                      border: `1px solid ${inputs.propertyType === pt ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {pt}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Purchase Price">
              <NumberInput value={inputs.purchasePrice} onChange={v => set('purchasePrice', v)} prefix="$" />
            </Field>
            <Field label="Closing Cost Rate" hint="Typically 2–4% of purchase price">
              <PctInput value={inputs.closingCostRate} onChange={v => set('closingCostRate', v)} />
            </Field>
            <Field label="CapEx Budget" hint="Planned capital improvements at purchase">
              <NumberInput value={inputs.capexBudget} onChange={v => set('capexBudget', v)} prefix="$" />
            </Field>
            <Field label="Depreciation Schedule">
              <div className="flex gap-2">
                {([27.5, 39] as const).map(yr => (
                  <button
                    key={yr}
                    onClick={() => set('depreciationYears', yr)}
                    className="flex-1 py-2 text-sm rounded"
                    style={{
                      backgroundColor: inputs.depreciationYears === yr ? 'var(--accent)' : 'var(--surface)',
                      color: inputs.depreciationYears === yr ? '#fff' : 'var(--text)',
                      border: `1px solid ${inputs.depreciationYears === yr ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {yr} yr {yr === 27.5 ? '(Residential)' : '(Commercial)'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Land Value Rate" hint="Portion of price that is non-depreciable land">
              <PctInput value={inputs.landValueRate} onChange={v => set('landValueRate', v)} />
            </Field>
          </>
        )}

        {step === 'financing' && (
          <>
            <Field label="Down Payment" hint="Dollar amount (not a percentage)">
              <NumberInput value={inputs.downPayment} onChange={v => set('downPayment', v)} prefix="$" />
            </Field>
            {inputs.purchasePrice > 0 && inputs.downPayment > 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Loan: ${((inputs.purchasePrice - inputs.downPayment) / 1000).toFixed(1)}K
                ({((1 - inputs.downPayment / inputs.purchasePrice) * 100).toFixed(1)}% LTV)
              </p>
            )}
            <Field label="Interest Rate (Annual)">
              <PctInput value={inputs.interestRate} onChange={v => set('interestRate', v)} />
            </Field>
            <Field label="Amortization Period">
              <NumberInput value={inputs.amortizationYears} onChange={v => set('amortizationYears', v)} suffix="years" />
            </Field>
            <Field label="Loan Term (Balloon)" hint="When the balloon payment is due (≤ amortization period)">
              <NumberInput value={inputs.loanTermYears} onChange={v => set('loanTermYears', v)} suffix="years" />
            </Field>
          </>
        )}

        {step === 'income' && (
          <>
            {hasHistory && (
              <button
                onClick={() => setShowT12Modal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
                style={{
                  border: '1px dashed var(--accent)',
                  color: 'var(--accent)',
                  backgroundColor: 'rgba(37,99,235,0.04)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Import from T12 Analysis
              </button>
            )}
            <Field label="Gross Scheduled Income" hint="Annual potential rental income at 100% occupancy">
              <NumberInput value={inputs.grossScheduledIncome} onChange={v => set('grossScheduledIncome', v)} prefix="$" />
            </Field>
            <Field label="Other Income" hint="Annual parking, laundry, storage, etc.">
              <NumberInput value={inputs.otherIncome} onChange={v => set('otherIncome', v)} prefix="$" />
            </Field>
          </>
        )}

        {step === 'expenses' && (
          <>
            {hasHistory && (
              <button
                onClick={() => setShowT12Modal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
                style={{
                  border: '1px dashed var(--accent)',
                  color: 'var(--accent)',
                  backgroundColor: 'rgba(37,99,235,0.04)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Import from T12 Analysis
              </button>
            )}
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Enter annual operating expenses. Leave at $0 for categories that don&apos;t apply.
            </p>
            {expenseFields.map(({ key, label }) => (
              <Field key={key} label={label}>
                <NumberInput
                  value={inputs.expenses[key]}
                  onChange={v => setExpense(key, v)}
                  prefix="$"
                />
              </Field>
            ))}
            <div className="card" style={{ backgroundColor: 'var(--surface)' }}>
              <div className="flex justify-between text-sm font-semibold">
                <span style={{ color: 'var(--text)' }}>Total Annual Expenses</span>
                <span style={{ color: 'var(--text)' }}>
                  ${Object.values(inputs.expenses).reduce((a, b) => a + b, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </>
        )}

        {step === 'assumptions' && (
          <>
            <Field label="Vacancy Rate" hint="Expected percentage of time units are empty">
              <PctInput value={inputs.vacancyRate} onChange={v => set('vacancyRate', v)} />
            </Field>
            <Field label="Annual Rent Growth">
              <PctInput value={inputs.rentGrowthRate} onChange={v => set('rentGrowthRate', v)} />
            </Field>
            <Field label="Annual Expense Growth">
              <PctInput value={inputs.expenseGrowthRate} onChange={v => set('expenseGrowthRate', v)} />
            </Field>
            <Field label="Exit Cap Rate" hint="Expected cap rate when you sell">
              <PctInput value={inputs.exitCapRate} onChange={v => set('exitCapRate', v)} />
            </Field>
            <Field label="Hold Period">
              <NumberInput value={inputs.holdPeriod} onChange={v => set('holdPeriod', v)} suffix="years" />
            </Field>
            <Field label="Selling Cost Rate" hint="Broker commissions, transfer taxes, etc.">
              <PctInput value={inputs.sellingCostRate} onChange={v => set('sellingCostRate', v)} />
            </Field>
            <Field label="Tax Bracket (Ordinary Income)">
              <PctInput value={inputs.taxBracket} onChange={v => set('taxBracket', v)} />
            </Field>
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={isFirst ? onCancel : () => setStep(STEPS[stepIndex - 1].key)}
          className="px-4 py-2 text-sm rounded"
          style={{ border: '1px solid var(--border)', color: 'var(--text)', backgroundColor: 'var(--surface)' }}
        >
            {isFirst ? 'Cancel' : '← Back'}
          </button>

          {draftSaveState === 'saving' && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              Saving…
            </span>
          )}
          {draftSaveState === 'saved' && <span className="text-xs" style={{ color: 'var(--success)' }}>✓ Saved</span>}
          {draftSaveState === 'error' && <span className="text-xs" style={{ color: 'var(--danger)' }}>Save failed</span>}
        </div>

        {isLast ? (
          <div className="flex flex-col items-end gap-1">
            {!canSave && (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                {allErrors.length} error{allErrors.length > 1 ? 's' : ''} must be fixed before saving
              </p>
            )}
            {warnings.filter(w => w.level === 'warn').length > 0 && canSave && (
              <p className="text-xs" style={{ color: 'var(--warning)' }}>
                {warnings.filter(w => w.level === 'warn').length} warning{warnings.filter(w => w.level === 'warn').length > 1 ? 's' : ''}, review before proceeding
              </p>
            )}
            <button
              onClick={() => onSave(inputs)}
              disabled={saving || !canSave}
              className="btn-primary px-5 py-2 text-sm"
              style={!canSave ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              {saving ? 'Saving...' : 'Save & Analyze'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setStep(STEPS[stepIndex + 1].key)}
            className="btn-primary px-5 py-2 text-sm"
          >
            Next →
          </button>
        )}
      </div>

      {/* T12 Import Modal */}
      {showT12Modal && (
        <T12ImportModal
          history={history ?? []}
          onImport={applyT12Import}
          onClose={() => setShowT12Modal(false)}
        />
      )}

      {/* Spreadsheet Import Modal */}
      {showFileImportModal && (
        <FileImportModal
          onImport={applyFileImport}
          onClose={() => setShowFileImportModal(false)}
        />
      )}
    </div>
  );
}
