'use client';

import { useState, useRef, useCallback } from 'react';
import type { HistoryEntry } from '@/app/dashboard/page';
import type { PropertyEntry } from '@/lib/models/portfolio';

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
  onClearHistory: () => void;
  onPropertySelect: (property: PropertyEntry) => void;
  onPropertyCreate: (name: string, address?: string) => Promise<void>;
  onSignOut: () => void;
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
  onClearHistory,
  onPropertySelect,
  onPropertyCreate,
  onSignOut,
}: SidebarProps) {
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showNewProperty, setShowNewProperty] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropAddress, setNewPropAddress] = useState('');
  const [creatingProp, setCreatingProp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (arr.length === 0) return;
    setQueuedFiles(arr);
    onFilesSelect(arr);
  }, [onFilesSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // Reset so same file can be re-selected
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

  // Progress label shown during analysis
  const progressLabel = analyzeProgress
    ? `Analyzing ${analyzeProgress.current} of ${analyzeProgress.total}…`
    : 'Analyzing…';

  return (
    <div
      className="flex flex-col h-full"
      style={{ width: 280, minWidth: 280, backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Statement Utility</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>P&L Analysis Platform</p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Upload */}
        <div className="p-4">
          <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Upload Statement
          </p>

          {/* Drop zone — always interactive */}
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
                {queuedFiles.length === 1 ? (
                  <p className="text-xs mt-2 font-medium truncate max-w-full text-center" style={{ color: 'var(--accent)' }}>
                    {queuedFiles[0].name}
                  </p>
                ) : (
                  <p className="text-xs mt-2 font-medium text-center" style={{ color: 'var(--accent)' }}>
                    {queuedFiles.length} files queued
                  </p>
                )}
                <p className="text-xs mt-1 text-center" style={{ color: 'var(--muted)' }}>
                  Drop or click to replace
                </p>
              </>
            ) : (
              <p className="text-xs mt-2 text-center" style={{ color: 'var(--muted)' }}>
                Drop Excel file(s) or click to browse
              </p>
            )}
          </div>

          {/* Multi-file queue list */}
          {queuedFiles.length > 1 && (
            <div className="mt-2 space-y-0.5">
              {queuedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
                  style={{ backgroundColor: 'var(--bg)', color: 'var(--muted)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="truncate">{f.name}</span>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={handleInputChange}
          />

          <button
            onClick={onAnalyze}
            disabled={!canAnalyze}
            className="btn-primary w-full mt-3"
          >
            {isAnalyzing
              ? progressLabel
              : queuedFiles.length > 1
                ? `Analyze ${queuedFiles.length} Files`
                : 'Analyze'}
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
              {properties.map(prop => (
                <button
                  key={prop.id}
                  onClick={() => onPropertySelect(prop)}
                  className="w-full text-left p-2 rounded-md transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: activePropertyId === prop.id ? 'rgba(59,130,246,0.1)' : 'var(--bg)',
                    border: activePropertyId === prop.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ color: 'var(--accent)', flexShrink: 0 }}>
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                      {prop.name}
                    </p>
                  </div>
                  <p className="text-xs ml-[18px]" style={{ color: 'var(--muted)' }}>
                    {prop.statementCount} statement{prop.statementCount !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t mx-4" style={{ borderColor: 'var(--border)' }} />

        {/* History */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              History
            </p>
            {history.length > 0 && (
              <button
                onClick={onClearHistory}
                className="text-xs hover:opacity-80 transition-opacity"
                style={{ color: 'var(--muted)' }}
              >
                Clear all
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No analyses yet</p>
          ) : (
            <div className="space-y-1">
              {history.map(entry => (
                <div key={entry.id} className="group flex items-start gap-1">
                  <button
                    onClick={() => onHistorySelect(entry)}
                    className="flex-1 text-left p-2 rounded-md transition-colors hover:opacity-80 min-w-0"
                    style={{ backgroundColor: 'var(--bg)' }}
                  >
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                      {entry.propertyName || entry.fileName}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                      {entry.period} &middot; {formatDate(entry.analyzedAt)}
                    </p>
                  </button>
                  <button
                    onClick={() => onHistoryDelete(entry.id)}
                    className="flex-shrink-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:opacity-80"
                    style={{ color: 'var(--muted)' }}
                    title="Delete"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User / Sign out */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs truncate mb-2" style={{ color: 'var(--muted)' }}>{userEmail}</p>
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
