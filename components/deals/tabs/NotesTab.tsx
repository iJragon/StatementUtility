'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  dealId: string;
  initialNotes: string;
  onSaved?: (notes: string) => void;
}

export default function NotesTab({ dealId, initialNotes, onSaved }: Props) {
  const [text, setText] = useState(initialNotes);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialNotes);

  const save = useCallback(async (value: string) => {
    if (value === lastSavedRef.current) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: value }),
      });
      if (!res.ok) throw new Error('Save failed');
      lastSavedRef.current = value;
      setSaveState('saved');
      onSaved?.(value);
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  }, [dealId, onSaved]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    setSaveState('idle');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(val), 1500);
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const charCount = text.length;

  return (
    <div className="p-4 flex flex-col overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Deal Notes</h4>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Private notes, memos, and due-diligence findings. Auto-saved as you type.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          {saveState === 'saving' && (
            <span className="flex items-center gap-1">
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              Saving…
            </span>
          )}
          {saveState === 'saved' && <span style={{ color: 'var(--success)' }}>✓ Saved</span>}
          {saveState === 'error' && <span style={{ color: 'var(--danger)' }}>Save failed</span>}
          <span>{charCount.toLocaleString()} chars</span>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={handleChange}
        placeholder="Add notes about this deal — due diligence findings, broker conversations, inspection notes, concerns, or anything else worth remembering…"
        className="flex-1 w-full p-4 text-sm rounded-lg resize-none outline-none"
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          minHeight: 320,
          lineHeight: 1.7,
          fontFamily: 'inherit',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--border)';
          save(text);
        }}
      />

      {/* Markdown hint */}
      <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
        Plain text. Use blank lines for paragraphs. Changes are auto-saved after 1.5 seconds.
      </p>
    </div>
  );
}
