'use client';

import { useState, useRef, useCallback } from 'react';
import type { HistoryEntry } from '@/app/dashboard/page';

interface SidebarProps {
  userEmail: string;
  history: HistoryEntry[];
  onFileSelect: (file: File) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  onHistorySelect: (entry: HistoryEntry) => void;
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
  onFileSelect,
  onAnalyze,
  isAnalyzing,
  onHistorySelect,
  onSignOut,
}: SidebarProps) {
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setSelectedFileName(file.name);
    onFileSelect(file);
  }, [onFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFile(file);
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 280,
        minWidth: 280,
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Statement Utility</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>P&L Analysis Platform</p>
      </div>

      {/* Upload */}
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
            borderColor: isDragOver ? 'var(--accent)' : 'var(--border)',
            backgroundColor: isDragOver ? 'rgba(59,130,246,0.05)' : 'transparent',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--muted)' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--muted)' }}>
            {selectedFileName || 'Drop Excel file or click to browse'}
          </p>
          {selectedFileName && (
            <p className="text-xs mt-1 font-medium truncate max-w-full" style={{ color: 'var(--accent)' }}>
              {selectedFileName}
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
          disabled={!selectedFileName || isAnalyzing}
          className="btn-primary w-full mt-3"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {/* Separator */}
      <div className="border-t mx-4" style={{ borderColor: 'var(--border)' }} />

      {/* History */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          History
        </p>
        {history.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>No analyses yet</p>
        ) : (
          <div className="space-y-1">
            {history.map(entry => (
              <button
                key={entry.id}
                onClick={() => onHistorySelect(entry)}
                className="w-full text-left p-2 rounded-md transition-colors hover:opacity-80"
                style={{ backgroundColor: 'var(--bg)' }}
              >
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                  {entry.propertyName || entry.fileName}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                  {entry.period} &middot; {formatDate(entry.analyzedAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User / Sign out */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs truncate mb-2" style={{ color: 'var(--muted)' }}>
          {userEmail}
        </p>
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
