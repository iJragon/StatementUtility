'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { HistoryEntry } from '@/app/dashboard/page';
import type { PropertyEntry } from '@/lib/models/portfolio';
import ThemeToggle from '@/components/ThemeToggle';

const MIN_WIDTH = 220;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 280;

interface SidebarProps {
  userEmail: string;
  history: HistoryEntry[];
  hasAnalysis: boolean;
  properties: PropertyEntry[];
  activePropertyId?: string;
  isAnalyzing: boolean;
  analyzeProgress?: { current: number; total: number } | null;
  onFilesSelect: (files: File[]) => void;
  onAnalyze: () => void;
  onForceAnalyze: () => void;
  onHistorySelect: (entry: HistoryEntry) => void;
  onHistoryDelete: (id: string) => void;
  onHistoryRename: (id: string, newName: string) => Promise<void>;
  onClearHistory: () => void;
  onPropertySelect: (property: PropertyEntry) => void;
  onPropertyCreate: (name: string, address?: string) => Promise<void>;
  onPropertyRename: (id: string, name: string) => Promise<void>;
  onPropertyAddressEdit: (id: string, address: string) => Promise<void>;
  onPropertyDelete: (id: string) => void;
  onNavigateHome: () => void;
  onSignOut: () => void;
  loadingHistoryId?: string | null;
  loadingPropertyId?: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function Sidebar({
  userEmail,
  history,
  hasAnalysis,
  properties,
  activePropertyId,
  isAnalyzing,
  analyzeProgress,
  onFilesSelect,
  onAnalyze,
  onForceAnalyze,
  onHistorySelect,
  onHistoryDelete,
  onHistoryRename,
  onClearHistory,
  onPropertySelect,
  onPropertyCreate,
  onPropertyRename,
  onPropertyAddressEdit,
  onPropertyDelete,
  onNavigateHome,
  onSignOut,
  loadingHistoryId,
  loadingPropertyId,
}: SidebarProps) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showNewProperty, setShowNewProperty] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropAddress, setNewPropAddress] = useState('');
  const [creatingProp, setCreatingProp] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryName, setEditingHistoryName] = useState('');
  // Property inline editing
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [editingPropField, setEditingPropField] = useState<'name' | 'address' | null>(null);
  const [editingPropValue, setEditingPropValue] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  // Confirmation modal
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sidebarWidthRef = useRef(DEFAULT_WIDTH);

  function startPropEdit(id: string, field: 'name' | 'address', current: string) {
    setEditingPropId(id);
    setEditingPropField(field);
    setEditingPropValue(current);
  }

  async function commitPropEdit() {
    if (!editingPropId || !editingPropField) return;
    const val = editingPropValue.trim();
    if (editingPropField === 'name' && val) {
      await onPropertyRename(editingPropId, val);
    } else if (editingPropField === 'address') {
      await onPropertyAddressEdit(editingPropId, val);
    }
    setEditingPropId(null);
    setEditingPropField(null);
    setEditingPropValue('');
  }

  function cancelPropEdit() {
    setEditingPropId(null);
    setEditingPropField(null);
    setEditingPropValue('');
  }

  // Load persisted sidebar width on mount
  useEffect(() => {
    const stored = localStorage.getItem('sidebar_width');
    if (stored) {
      const w = parseInt(stored, 10);
      if (!isNaN(w)) {
        const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
        setSidebarWidth(clamped);
        sidebarWidthRef.current = clamped;
      }
    }
  }, []);

  // Persist sidebar width on change
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
    localStorage.setItem('sidebar_width', String(sidebarWidth));
  }, [sidebarWidth]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (arr.length === 0) return;
    // Standalone upload only accepts one file at a time
    const single = [arr[0]];
    setQueuedFiles(single);
    onFilesSelect(single);
  }, [onFilesSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  async function handleCreateProperty() {
    if (!newPropName.trim()) return;
    setCreatingProp(true);
    try {
      await onPropertyCreate(newPropName.trim(), newPropAddress.trim() || undefined);
      setNewPropName('');
      setNewPropAddress('');
      setShowNewProperty(false);
    } finally {
      setCreatingProp(false);
    }
  }

  const hasFiles = queuedFiles.length > 0;
  const canAnalyze = hasFiles && !isAnalyzing;

  const progressLabel = analyzeProgress
    ? `Analyzing ${analyzeProgress.current} of ${analyzeProgress.total}…`
    : 'Analyzing…';

  return (
    <div
      className="relative flex flex-col h-full flex-shrink-0"
      style={{ width: sidebarWidth, backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)' }}
    >
      {/* Drag-to-resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 right-0 h-full w-1 z-10 transition-colors"
        style={{ cursor: 'col-resize' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      />

      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1
          className="text-lg font-bold cursor-pointer hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text)' }}
          onClick={onNavigateHome}
        >Estatelytics</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>AI-powered financial analysis</p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* Properties */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Properties
            </p>
            <button
              onClick={() => setShowNewProperty(v => !v)}
              className="text-xs hover:opacity-80 transition-opacity flex items-center gap-1"
              style={{ color: 'var(--accent)' }}
              title="New property"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New
            </button>
          </div>

          {showNewProperty && (
            <div className="mb-3 space-y-2">
              <input
                type="text"
                value={newPropName}
                onChange={e => setNewPropName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProperty()}
                placeholder="Property name"
                autoFocus
                className="input-field text-xs w-full"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <input
                type="text"
                value={newPropAddress}
                onChange={e => setNewPropAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProperty()}
                placeholder="Address (optional)"
                className="input-field text-xs w-full"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleCreateProperty}
                  disabled={!newPropName.trim() || creatingProp}
                  className="flex-1 btn-primary text-xs py-1.5"
                >
                  {creatingProp ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => { setShowNewProperty(false); setNewPropName(''); setNewPropAddress(''); }}
                  className="px-3 py-1.5 text-xs rounded-md border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {properties.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No properties yet</p>
          ) : (
            <div className="space-y-1">
              {properties.map(prop => {
                const isActive = activePropertyId === prop.id;
                const isEditingThis = editingPropId === prop.id;
                return (
                  <div key={prop.id}>
                    <button
                      onClick={() => onPropertySelect(prop)}
                      className="w-full text-left p-2 rounded-md transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: isActive ? 'rgba(59,130,246,0.1)' : 'var(--bg)',
                        border: isActive ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        {loadingPropertyId === prop.id ? (
                          <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            style={{ color: 'var(--accent)', flexShrink: 0 }}>
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                        )}
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                          {prop.name}
                        </p>
                      </div>
                      {prop.address && (
                        <p className="text-xs ml-[18px] truncate" style={{ color: 'var(--muted)' }}>{prop.address}</p>
                      )}
                      <p className="text-xs ml-[18px]" style={{ color: 'var(--muted)' }}>
                        {prop.statementCount} statement{prop.statementCount !== 1 ? 's' : ''}
                      </p>
                    </button>

                    {/* Inline controls when this property is active */}
                    {isActive && (
                      <div className="mx-1 mb-1 rounded-b-md px-2 py-1.5 space-y-1.5"
                        style={{ backgroundColor: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderTop: 'none' }}>

                        {isEditingThis && editingPropField === 'name' ? (
                          <form className="flex gap-1" onSubmit={e => { e.preventDefault(); commitPropEdit(); }}>
                            <input
                              autoFocus
                              value={editingPropValue}
                              onChange={e => setEditingPropValue(e.target.value)}
                              onBlur={commitPropEdit}
                              placeholder="Property name"
                              className="flex-1 text-xs bg-transparent outline-none border-b"
                              style={{ color: 'var(--text)', borderColor: 'var(--accent)' }}
                            />
                            <button type="button" onClick={cancelPropEdit} className="text-xs hover:opacity-70" style={{ color: 'var(--muted)' }}>✕</button>
                          </form>
                        ) : isEditingThis && editingPropField === 'address' ? (
                          <form className="flex gap-1" onSubmit={e => { e.preventDefault(); commitPropEdit(); }}>
                            <input
                              autoFocus
                              value={editingPropValue}
                              onChange={e => setEditingPropValue(e.target.value)}
                              onBlur={commitPropEdit}
                              placeholder="Property address"
                              className="flex-1 text-xs bg-transparent outline-none border-b"
                              style={{ color: 'var(--text)', borderColor: 'var(--accent)' }}
                            />
                            <button type="button" onClick={cancelPropEdit} className="text-xs hover:opacity-70" style={{ color: 'var(--muted)' }}>✕</button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startPropEdit(prop.id, 'name', prop.name)}
                              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
                              style={{ color: 'var(--muted)' }}
                              title="Rename property"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              Name
                            </button>
                            <button
                              onClick={() => startPropEdit(prop.id, 'address', prop.address ?? '')}
                              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
                              style={{ color: 'var(--muted)' }}
                              title="Edit address"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                              Address
                            </button>
                            <button
                              onClick={() => setConfirm({
                                title: 'Delete Property?',
                                body: `This will permanently delete "${prop.name}"${prop.statementCount > 0 ? ` and remove its ${prop.statementCount} statement link${prop.statementCount !== 1 ? 's' : ''}` : ''}. Your underlying analysis data will remain in History. This cannot be undone.`,
                                action: () => onPropertyDelete(prop.id),
                              })}
                              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ml-auto"
                              style={{ color: 'var(--danger)' }}
                              title="Delete property"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                              Delete
                            </button>
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

        <div className="border-t mx-4" style={{ borderColor: 'var(--border)' }} />

        {/* Upload Statement */}
        <div className="p-4">
          <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Upload Statement
          </p>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
            style={{
              borderColor: isDragOver ? 'var(--accent)' : hasFiles ? 'rgba(59,130,246,0.4)' : 'var(--border)',
              backgroundColor: isDragOver
                ? 'rgba(59,130,246,0.05)'
                : hasFiles
                  ? 'rgba(59,130,246,0.04)'
                  : 'transparent',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              style={{ color: hasFiles ? 'var(--accent)' : 'var(--muted)' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>

            {hasFiles ? (
              <>
                <p className="text-xs mt-2 font-medium truncate max-w-full text-center" style={{ color: 'var(--accent)' }}>
                  {queuedFiles[0].name}
                </p>
                <p className="text-xs mt-1 text-center" style={{ color: 'var(--muted)' }}>
                  Drop or click to replace
                </p>
              </>
            ) : (
              <p className="text-xs mt-2 text-center" style={{ color: 'var(--muted)' }}>
                Drop an Excel file or click to browse
              </p>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleInputChange}
          />

          <button
            onClick={onAnalyze}
            disabled={!canAnalyze}
            className="btn-primary w-full mt-3"
          >
            {isAnalyzing ? progressLabel : 'Analyze'}
          </button>

          {(hasFiles || hasAnalysis) && !isAnalyzing && (
            <button
              onClick={onForceAnalyze}
              className="w-full mt-1.5 text-xs py-1.5 px-3 rounded-md border transition-colors hover:opacity-80 flex items-center justify-center gap-1.5"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Force Re-analyze
            </button>
          )}
        </div>

        <div className="border-t mx-4" style={{ borderColor: 'var(--border)' }} />

        {/* Analyses */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Analyses
              {history.length > 0 && (
                <span className="ml-1 font-normal normal-case tracking-normal" style={{ opacity: 0.55 }}>
                  ({history.length})
                </span>
              )}
            </p>
            {history.length > 0 && (
              <button
                onClick={() => setConfirm({
                  title: 'Delete All Analyses?',
                  body: `Permanently delete all ${history.length} saved analys${history.length !== 1 ? 'es' : 'is'}? This cannot be undone.`,
                  action: onClearHistory,
                })}
                className="text-xs hover:opacity-80 transition-opacity"
                style={{ color: 'var(--muted)' }}
              >
                Delete all
              </button>
            )}
          </div>

          {/* Search */}
          {history.length > 3 && (
            <div className="relative mb-2">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--muted)' }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search analyses..."
                className="w-full text-xs pl-6 pr-6 py-1.5 rounded-md border outline-none"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--muted)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {(() => {
            const q = historySearch.toLowerCase();
            const filtered = q
              ? history.filter(e =>
                  (e.propertyName || '').toLowerCase().includes(q) ||
                  (e.fileName || '').toLowerCase().includes(q) ||
                  (e.period || '').toLowerCase().includes(q),
                )
              : history;

            if (history.length === 0) {
              return <p className="text-xs" style={{ color: 'var(--muted)' }}>No analyses yet</p>;
            }
            if (filtered.length === 0) {
              return <p className="text-xs" style={{ color: 'var(--muted)' }}>No results for &ldquo;{historySearch}&rdquo;</p>;
            }

            return (
              <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 280 }}>
                {filtered.map(entry => (
                  <div key={entry.id} className="group relative rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
                    {editingHistoryId === entry.id ? (
                      <form
                        className="flex items-center gap-1 px-2 py-2"
                        onSubmit={async e => {
                          e.preventDefault();
                          const name = editingHistoryName.trim();
                          if (name && name !== entry.propertyName) await onHistoryRename(entry.id, name);
                          setEditingHistoryId(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={editingHistoryName}
                          onChange={e => setEditingHistoryName(e.target.value)}
                          onBlur={async () => {
                            const name = editingHistoryName.trim();
                            if (name && name !== entry.propertyName) await onHistoryRename(entry.id, name);
                            setEditingHistoryId(null);
                          }}
                          className="flex-1 min-w-0 bg-transparent outline-none text-xs font-medium border-b"
                          style={{ color: 'var(--text)', borderColor: 'var(--accent)' }}
                        />
                        <button type="submit" className="flex-shrink-0 p-0.5 hover:opacity-70" style={{ color: 'var(--accent)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          onClick={() => onHistorySelect(entry)}
                          className="w-full text-left px-2 py-2 pr-14 rounded-lg transition-colors hover:opacity-80"
                        >
                          <div className="flex items-center gap-1.5">
                            {loadingHistoryId === entry.id && (
                              <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                            )}
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                              {entry.propertyName || entry.fileName}
                            </p>
                          </div>
                          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                            {[entry.period, entry.fileName].filter(Boolean).join(' · ')}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)', opacity: 0.6 }}>
                            {formatDate(entry.analyzedAt)}
                          </p>
                        </button>
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingHistoryId(entry.id); setEditingHistoryName(entry.propertyName || entry.fileName); }}
                            className="p-1 rounded hover:opacity-70 transition-opacity"
                            style={{ color: 'var(--muted)' }}
                            title="Rename"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setConfirm({
                              title: 'Delete Analysis?',
                              body: `Permanently delete the analysis for "${entry.propertyName || entry.fileName}"${entry.period ? ` (${entry.period})` : ''}? This cannot be undone.`,
                              action: () => onHistoryDelete(entry.id),
                            })}
                            className="p-1 rounded hover:opacity-70 transition-opacity"
                            style={{ color: 'var(--muted)' }}
                            title="Delete"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{confirm.title}</h3>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>{confirm.body}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 text-xs rounded-md border transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { confirm.action(); setConfirm(null); }}
                className="px-3 py-1.5 text-xs rounded-md transition-colors hover:opacity-80"
                style={{ backgroundColor: 'var(--danger)', color: 'white' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer: theme toggle + user / sign out */}
      <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Theme</span>
          <ThemeToggle />
        </div>
        <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{userEmail}</p>
        <button
          onClick={onSignOut}
          className="w-full text-xs py-1.5 px-3 rounded-md border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
