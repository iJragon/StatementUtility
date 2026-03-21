'use client';

import { useState, useRef } from 'react';
import type { PropertyDetail, CrossYearFlag, PortfolioKeyMetric } from '@/lib/models/portfolio';
import type { AnalysisResult } from '@/lib/models/statement';
import type { HistoryEntry } from '@/app/dashboard/page';
import OverviewTab from './tabs/OverviewTab';
import KeyMetricsTab from './tabs/KeyMetricsTab';
import TrendChartsTab from './tabs/TrendChartsTab';
import ExpenseBreakdownTab from './tabs/ExpenseBreakdownTab';
import CrossYearFlagsTab from './tabs/CrossYearFlagsTab';
import PropertyChatTab from './tabs/PropertyChatTab';

interface PropertyViewProps {
  property: PropertyDetail;
  analyses: AnalysisResult[];
  crossYearFlags: CrossYearFlag[];
  keyMetrics: PortfolioKeyMetric[];
  summaryText: string;
  summaryStreaming: boolean;
  history: HistoryEntry[];
  onGenerateSummary: () => void;
  onAddStatements: (statements: Array<{ fileHash: string; yearLabel: string }>) => Promise<void>;
  onAnalyzeFile: (file: File) => Promise<AnalysisResult>;
  onRemoveStatement: (stmtId: string) => Promise<void>;
  onRenameStatement: (stmtId: string, newLabel: string) => Promise<void>;
  onRenameProperty: (newName: string) => Promise<void>;
  onDeleteProperty: () => void;
}

const MAIN_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'metrics', label: 'Key Metrics' },
  { id: 'trends', label: 'Trends' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'flags', label: 'Cross-Year Flags' },
];

const CHAT_TAB = { id: 'chat', label: 'Ask AI' };

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function fmtNoi(val: number | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '+';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M NOI`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K NOI`;
  return null;
}

export default function PropertyView({
  property,
  analyses,
  crossYearFlags,
  keyMetrics,
  summaryText,
  summaryStreaming,
  history,
  onGenerateSummary,
  onAddStatements,
  onAnalyzeFile,
  onRemoveStatement,
  onRenameStatement,
  onRenameProperty,
  onDeleteProperty,
}: PropertyViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingStmtId, setEditingStmtId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingPropertyName, setEditingPropertyName] = useState(false);
  const [propertyNameDraft, setPropertyNameDraft] = useState('');
  const [removeStmtConfirmId, setRemoveStmtConfirmId] = useState<string | null>(null);

  // Add modal state
  const [modalTab, setModalTab] = useState<'history' | 'upload'>('history');
  const [selectedEntries, setSelectedEntries] = useState<Map<string, string>>(new Map()); // fileHash -> yearLabel
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const linkedHashes = new Set(property.statements.map(s => s.fileHash));
  const availableHistory = history.filter(h => !linkedHashes.has(h.fileHash));
  const periods = property.statements.map(s => s.yearLabel || s.period);
  const highFlagCount = crossYearFlags.filter(f => f.severity === 'high').length;

  function toggleEntry(entry: HistoryEntry) {
    setSelectedEntries(prev => {
      const next = new Map(prev);
      if (next.has(entry.fileHash)) {
        next.delete(entry.fileHash);
      } else {
        next.set(entry.fileHash, entry.period || '');
      }
      return next;
    });
  }

  function updateYearLabel(fileHash: string, label: string) {
    setSelectedEntries(prev => {
      const next = new Map(prev);
      next.set(fileHash, label);
      return next;
    });
  }

  function closeModal() {
    setShowAddModal(false);
    setSelectedEntries(new Map());
    setAddError('');
    setUploadStatus('');
    setModalTab('history');
  }

  async function handleAdd() {
    if (selectedEntries.size === 0) return;
    setAddLoading(true);
    setAddError('');
    try {
      const statements = [...selectedEntries.entries()].map(([fileHash, yearLabel]) => ({
        fileHash,
        yearLabel,
      }));
      await onAddStatements(statements);
      closeModal();
      onGenerateSummary();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add statements');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleFilesUpload(files: File[]) {
    const valid = files.filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (valid.length === 0) {
      setAddError('Please upload Excel files (.xlsx or .xls)');
      return;
    }
    setAddError('');
    setUploadStatus(valid.length === 1 ? `Analyzing ${valid[0].name}...` : `Analyzing ${valid.length} files...`);

    let completed = 0;
    if (valid.length > 1) setUploadProgress({ current: 0, total: valid.length });

    try {
      // Analyze in parallel; increment progress counter as each file completes
      const results = await Promise.all(valid.map(async f => {
        const result = await onAnalyzeFile(f);
        completed++;
        setUploadProgress(valid.length > 1 ? { current: completed, total: valid.length } : null);
        return result;
      }));
      await onAddStatements(results.map(r => ({
        fileHash: r.fileHash,
        yearLabel: r.statement.period || '',
      })));
      setUploadStatus('');
      setUploadProgress(null);
      closeModal();
      onGenerateSummary();
    } catch (err) {
      setUploadStatus('');
      setUploadProgress(null);
      setAddError(err instanceof Error ? err.message : 'Failed to analyze file');
    }
  }

  const isEmpty = property.statements.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Property header */}
      <div
        className="px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editingPropertyName ? (
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  const name = propertyNameDraft.trim();
                  if (name && name !== property.name) await onRenameProperty(name);
                  setEditingPropertyName(false);
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={propertyNameDraft}
                  onChange={e => setPropertyNameDraft(e.target.value)}
                  onBlur={async () => {
                    const name = propertyNameDraft.trim();
                    if (name && name !== property.name) await onRenameProperty(name);
                    setEditingPropertyName(false);
                  }}
                  className="input-field font-semibold text-lg w-full"
                  style={{ color: 'var(--text)', backgroundColor: 'var(--bg)', borderColor: 'var(--accent)' }}
                />
                <button type="submit" className="flex-shrink-0 p-1 hover:opacity-70" style={{ color: 'var(--accent)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 group/title">
                <h2 className="font-semibold text-lg truncate" style={{ color: 'var(--text)' }}>
                  {property.name}
                </h2>
                <button
                  onClick={() => { setEditingPropertyName(true); setPropertyNameDraft(property.name); }}
                  className="flex-shrink-0 opacity-0 group-hover/title:opacity-50 hover:opacity-100 transition-opacity"
                  title="Rename property"
                  style={{ color: 'var(--muted)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            )}
            {property.address && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{property.address}</p>
            )}
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-md border transition-colors hover:opacity-80"
            style={{ borderColor: 'rgba(var(--danger-rgb, 239,68,68),0.3)', color: 'var(--danger)' }}
          >
            Delete Property
          </button>
        </div>

        {/* Statement chips */}
        {!isEmpty && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {property.statements.map((stmt, stmtIdx) => {
              const stmtAnalysis = analyses[stmtIdx];
              const noi = stmtAnalysis?.statement.keyFigures['noi']?.annualTotal;
              const noiLabel = fmtNoi(noi);
              return (
              <div key={stmt.id} className="group flex items-center">
                {editingStmtId === stmt.id ? (
                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      const label = editingLabel.trim();
                      if (label) await onRenameStatement(stmt.id, label);
                      setEditingStmtId(null);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                    style={{ backgroundColor: 'rgba(59,130,246,0.15)', border: '1px solid var(--accent)' }}
                  >
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={e => setEditingLabel(e.target.value)}
                      onBlur={async () => {
                        const label = editingLabel.trim();
                        if (label && label !== (stmt.yearLabel || stmt.period)) await onRenameStatement(stmt.id, label);
                        setEditingStmtId(null);
                      }}
                      className="w-20 bg-transparent outline-none text-xs"
                      style={{ color: 'var(--accent)' }}
                    />
                    <button type="submit" className="hover:opacity-70" style={{ color: 'var(--accent)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </form>
                ) : (
                  <div
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
                    style={{ backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--accent)' }}
                  >
                    <span>{stmt.yearLabel || stmt.period}</span>
                    {noiLabel && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: noi! >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          color: noi! >= 0 ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        {noiLabel}
                      </span>
                    )}
                    {/* Pencil edit */}
                    <button
                      onClick={() => { setEditingStmtId(stmt.id); setEditingLabel(stmt.yearLabel || stmt.period); }}
                      className="ml-0.5 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                      title="Rename"
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    {/* Remove */}
                    <button
                      onClick={() => setRemoveStmtConfirmId(stmt.id)}
                      className="ml-0.5 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
            })}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Statement
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {!isEmpty && (
        <div
          className="flex border-b overflow-x-auto"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          {/* Main tabs */}
          {MAIN_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {tab.label}
              {tab.id === 'flags' && highFlagCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'var(--danger)', color: 'white' }}>
                  {highFlagCount}
                </span>
              )}
            </button>
          ))}

          {/* Spacer + separator + Chat tab (right-justified) */}
          <div className="flex-1" />
          <div className="flex items-stretch" style={{ borderLeft: '1px solid var(--border)' }}>
            <button
              onClick={() => setActiveTab(CHAT_TAB.id)}
              className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5"
              style={{
                color: activeTab === CHAT_TAB.id ? 'var(--accent)' : 'var(--muted)',
                borderBottom: activeTab === CHAT_TAB.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {CHAT_TAB.label}
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isEmpty ? (
          // Empty state - prominent CTA
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent)' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text)' }}>
                No statements yet
              </h3>
              <p className="text-sm max-w-xs" style={{ color: 'var(--muted)' }}>
                Add P&L statements to start building a multi-year picture of this property.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-2 px-5 py-2.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add First Statement
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab
                property={property}
                analyses={analyses}
                crossYearFlags={crossYearFlags}
                summaryText={summaryText}
                summaryStreaming={summaryStreaming}
                onGenerateSummary={onGenerateSummary}
              />
            )}
            {activeTab === 'metrics' && <KeyMetricsTab metrics={keyMetrics} periods={periods} />}
            {activeTab === 'trends' && <TrendChartsTab analyses={analyses} periods={periods} />}
            {activeTab === 'expenses' && <ExpenseBreakdownTab analyses={analyses} periods={periods} />}
            {activeTab === 'flags' && <CrossYearFlagsTab flags={crossYearFlags} />}
            {activeTab === 'chat' && (
              <PropertyChatTab
                propertyName={property.name}
                analyses={analyses}
                periods={periods}
              />
            )}
          </>
        )}
      </div>

      {/* Add Statement Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl w-full max-w-lg mx-4 shadow-xl flex flex-col" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '80vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Add Statement</h3>
              <button onClick={closeModal} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--muted)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
              {(['history', 'upload'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setModalTab(t); setAddError(''); }}
                  className="flex-1 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    color: modalTab === t ? 'var(--accent)' : 'var(--muted)',
                    borderBottom: modalTab === t ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  {t === 'history' ? 'From History' : 'Upload New File'}
                </button>
              ))}
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-4">
              {modalTab === 'history' ? (
                <>
                  {availableHistory.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      {history.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>
                          No statements in history. Analyze a spreadsheet first, or switch to Upload.
                        </p>
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>
                          All statements in your history have already been added to this property.
                          To add a new statement, switch to the Upload tab.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {availableHistory.map(entry => {
                        const checked = selectedEntries.has(entry.fileHash);
                        return (
                          <div key={entry.fileHash}>
                            <button
                              onClick={() => toggleEntry(entry)}
                              className="w-full text-left p-3 rounded-lg border transition-colors hover:opacity-90 flex items-center gap-3"
                              style={{
                                borderColor: checked ? 'var(--accent)' : 'var(--border)',
                                backgroundColor: checked ? 'rgba(59,130,246,0.08)' : 'var(--bg)',
                              }}
                            >
                              {/* Checkbox */}
                              <div
                                className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors"
                                style={{
                                  borderColor: checked ? 'var(--accent)' : 'var(--border)',
                                  backgroundColor: checked ? 'var(--accent)' : 'transparent',
                                }}
                              >
                                {checked && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                                  {entry.propertyName || entry.fileName}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                                  {entry.period} &middot; {formatDate(entry.analyzedAt)}
                                </p>
                              </div>
                            </button>

                            {/* Year label input when selected */}
                            {checked && (
                              <div className="mx-3 mb-1 mt-0.5 flex items-center gap-2">
                                <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>Period label:</span>
                                <input
                                  type="text"
                                  value={selectedEntries.get(entry.fileHash) ?? ''}
                                  onChange={e => updateYearLabel(entry.fileHash, e.target.value)}
                                  placeholder={entry.period || 'e.g. 2023'}
                                  className="flex-1 input-field text-xs py-1"
                                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                // Upload tab
                <div className="space-y-4">
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Upload a new Excel P&L statement. It will be analyzed and immediately added to this property.
                  </p>
                  <div
                    onClick={() => !uploadStatus && fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length > 0) handleFilesUpload(files);
                    }}
                    className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-colors"
                    style={{
                      borderColor: isDragOver ? 'var(--accent)' : 'var(--border)',
                      backgroundColor: isDragOver ? 'rgba(59,130,246,0.05)' : 'transparent',
                      cursor: uploadStatus ? 'default' : 'pointer',
                    }}
                  >
                    {uploadStatus ? (
                      <>
                        <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin mb-3" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>{uploadStatus}</p>
                        {uploadProgress && uploadProgress.total > 1 && (
                          <p className="text-xs mt-1" style={{ color: 'var(--muted)', opacity: 0.7 }}>
                            {uploadProgress.current} of {uploadProgress.total} files
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2" style={{ color: 'var(--muted)' }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Drop Excel file(s) here</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>or click to browse (.xlsx, .xls, multiple files supported)</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    className="hidden"
                    onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length > 0) handleFilesUpload(files); }}
                  />
                </div>
              )}
            </div>

            {/* Modal footer */}
            {addError && (
              <p className="px-4 pb-2 text-xs" style={{ color: 'var(--danger)' }}>{addError}</p>
            )}
            {modalTab === 'history' && (
              <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {selectedEntries.size > 0 ? `${selectedEntries.size} selected` : 'Select one or more statements'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 text-sm rounded-md border transition-colors hover:opacity-80"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={selectedEntries.size === 0 || addLoading}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {addLoading ? 'Adding...' : `Add ${selectedEntries.size > 0 ? selectedEntries.size : ''} Statement${selectedEntries.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove Statement Confirmation */}
      {removeStmtConfirmId && (() => {
        const stmt = property.statements.find(s => s.id === removeStmtConfirmId);
        const label = stmt ? (stmt.yearLabel || stmt.period) : 'this statement';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text)' }}>Remove Statement?</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                Remove <strong>{label}</strong> from <strong>{property.name}</strong>?
                The underlying analysis will remain in your Analyses. Only the link to this property is removed.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRemoveStmtConfirmId(null)}
                  className="px-4 py-2 text-sm rounded-md border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setRemoveStmtConfirmId(null); onRemoveStatement(removeStmtConfirmId); }}
                  className="px-4 py-2 text-sm rounded-md transition-colors hover:opacity-80"
                  style={{ backgroundColor: 'var(--danger)', color: 'white' }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Property Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text)' }}>Permanently Delete Property?</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              This will <strong>permanently delete</strong> <strong>{property.name}</strong>
              {property.statements.length > 0 && ` and its ${property.statements.length} statement link${property.statements.length !== 1 ? 's' : ''}`}.
              Your underlying analysis data will remain in History. <strong>This cannot be undone.</strong>
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm rounded-md border transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); onDeleteProperty(); }}
                className="px-4 py-2 text-sm rounded-md transition-colors hover:opacity-80"
                style={{ backgroundColor: 'var(--danger)', color: 'white' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
