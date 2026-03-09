'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { buildFinancialContext } from '@/lib/agents/base';
import type { AnalysisResult } from '@/lib/models/statement';
import type { ChatMessage } from '@/lib/agents/chat-agent';
import type { ChartSpec } from '@/lib/agents/viz-agent';
import type { HistoryEntry } from './page';
import Sidebar from '@/components/dashboard/Sidebar';
import ThemeToggle from '@/components/ThemeToggle';
import SummaryTab from '@/components/dashboard/tabs/SummaryTab';
import RevenueTab from '@/components/dashboard/tabs/RevenueTab';
import ExpensesTab from '@/components/dashboard/tabs/ExpensesTab';
import RatiosTab from '@/components/dashboard/tabs/RatiosTab';
import TrendsTab from '@/components/dashboard/tabs/TrendsTab';
import AnomaliesTab from '@/components/dashboard/tabs/AnomaliesTab';
import DealDetailsTab from '@/components/dashboard/tabs/DealDetailsTab';
import ChatTab from '@/components/dashboard/tabs/ChatTab';
import CustomChartsTab from '@/components/dashboard/tabs/CustomChartsTab';

interface DashboardClientProps {
  userEmail: string;
  initialHistory: HistoryEntry[];
}

const ANALYSIS_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'ratios', label: 'Ratios' },
  { id: 'trends', label: 'Trends' },
  { id: 'anomalies', label: 'Anomalies' },
];

const TOOL_TABS = [
  { id: 'deal', label: 'Deal Details' },
  { id: 'chat', label: 'Chat' },
  { id: 'charts', label: 'Charts' },
];

export default function DashboardClient({ userEmail, initialHistory }: DashboardClientProps) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [duplicateNotice, setDuplicateNotice] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [summaryStreaming, setSummaryStreaming] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [customCharts, setCustomCharts] = useState<Array<{ spec: ChartSpec; explanation: string; title: string }>>([]);
  const [anomalyExplanations, setAnomalyExplanations] = useState<Record<number, string>>({});
  const [resolvedAnomalies, setResolvedAnomalies] = useState<Set<number>>(new Set());
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const selectedFileRef = useRef<File | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    selectedFileRef.current = file;
    setAnalyzeError('');
    setDuplicateNotice('');
  }, []);

  async function streamText(
    url: string,
    body: object,
    onChunk: (chunk: string) => void,
    onDone?: () => void,
  ) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Request failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
    onDone?.();
  }

  async function runAnalyze(force = false) {
    const file = selectedFileRef.current;
    if (!file) return;

    setIsAnalyzing(true);
    setAnalyzeError('');
    setDuplicateNotice('');
    setSummaryText('');

    // Only reset tool state on a fresh analysis, not on force re-analyze
    if (!force) {
      setChatHistory([]);
      setCustomCharts([]);
      setAnomalyExplanations({});
      setResolvedAnomalies(new Set());
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const url = force ? '/api/analyze?force=true' : '/api/analyze';
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(err.error || 'Analysis failed');
      }

      const result: AnalysisResult = await res.json();
      setAnalysis(result);
      setActiveTab('summary');

      if (result.fromCache && !force) {
        // Duplicate file: load stored state, skip streaming, do NOT modify history
        setDuplicateNotice(`This file was already analyzed. Loaded from history.`);
        setSummaryText(result.summaryText ?? '');
        setChatHistory(result.chatHistory ?? []);
        setAnomalyExplanations({});
        setResolvedAnomalies(new Set());
        return;
      }

      // Update history
      setHistory(prev => {
        const existing = prev.find(h => h.id === result.fileHash);
        if (existing) return prev;
        const newEntry: HistoryEntry = {
          id: result.fileHash,
          fileName: result.fileName,
          propertyName: result.statement.propertyName,
          period: result.statement.period,
          analyzedAt: result.analyzedAt,
        };
        return [newEntry, ...prev].slice(0, 20);
      });

      // Stream executive summary then persist it
      setSummaryStreaming(true);
      const context = buildFinancialContext(result.statement, result.ratios, result.anomalies, result.trends);
      let summaryAcc = '';
      try {
        await streamText(
          '/api/summary',
          { context },
          chunk => {
            summaryAcc += chunk;
            setSummaryText(summaryAcc);
          },
        );
        // Save summary to DB so it's available on history reload
        fetch('/api/analyze', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileHash: result.fileHash, summaryText: summaryAcc }),
        }).catch(console.error);
      } finally {
        setSummaryStreaming(false);
      }
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }

  const handleAnalyze = () => runAnalyze(false);

  function handleForceAnalyze() {
    setShowForceConfirm(true);
  }

  function confirmForceAnalyze() {
    setShowForceConfirm(false);
    runAnalyze(true);
  }

  async function handleHistoryDelete(id: string) {
    await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
    setHistory(prev => prev.filter(h => h.id !== id));
  }

  async function handleClearHistory() {
    await fetch('/api/history?all=true', { method: 'DELETE' });
    setHistory([]);
  }

  async function handleHistorySelect(entry: HistoryEntry) {
    try {
      const res = await fetch(`/api/history/${entry.id}`);
      if (!res.ok) throw new Error('Failed to load analysis');
      const result: AnalysisResult = await res.json();
      setAnalysis(result);
      setSummaryText(result.summaryText ?? '');
      setChatHistory(result.chatHistory ?? []);
      setActiveTab('summary');
      setCustomCharts([]);
      setAnomalyExplanations({});
      setResolvedAnomalies(new Set());
      setDuplicateNotice('');
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  async function handleSendChat(question: string) {
    if (!analysis) return;
    const context = buildFinancialContext(analysis.statement, analysis.ratios, analysis.anomalies, analysis.trends);
    const userMsg: ChatMessage = { role: 'user', content: question };
    setChatHistory(prev => [...prev, userMsg]);
    setIsChatStreaming(true);

    let accResponse = '';
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setChatHistory(prev => [...prev, assistantMsg]);

    try {
      await streamText(
        '/api/chat',
        { question, history: chatHistory, context, groundingData: '' },
        chunk => {
          accResponse += chunk;
          setChatHistory(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: accResponse };
            return updated;
          });
        },
      );
      // Persist updated chat history
      const finalHistory = [...chatHistory, userMsg, { role: 'assistant' as const, content: accResponse }];
      fetch('/api/analyze', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileHash: analysis.fileHash, chatHistory: finalHistory }),
      }).catch(console.error);
    } finally {
      setIsChatStreaming(false);
    }
  }

  function handleClearChat() {
    setChatHistory([]);
  }

  async function handleExplainAnomaly(index: number) {
    if (!analysis) return;
    const anomaly = analysis.anomalies[index];
    if (!anomaly) return;
    const context = buildFinancialContext(analysis.statement, analysis.ratios, analysis.anomalies, analysis.trends);

    setAnomalyExplanations(prev => ({ ...prev, [index]: '' }));

    let acc = '';
    try {
      await streamText(
        '/api/explain',
        { anomaly, context },
        chunk => {
          acc += chunk;
          setAnomalyExplanations(prev => ({ ...prev, [index]: acc }));
        },
      );
    } catch {
      setAnomalyExplanations(prev => ({ ...prev, [index]: 'Failed to generate explanation.' }));
    }
  }

  function handleResolveAnomaly(index: number) {
    setResolvedAnomalies(prev => new Set([...prev, index]));
  }

  async function handleGenerateChart(request: string): Promise<string | undefined> {
    if (!analysis) return;
    const res = await fetch('/api/charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request, statement: analysis.statement }),
    });
    if (!res.ok) return 'Failed to reach the chart generation service.';
    const result = await res.json();
    if ('error' in result) {
      return result.error as string;
    }
    setCustomCharts(prev => [
      { spec: result.spec, explanation: result.explanation, title: result.spec.title },
      ...prev,
    ]);
    return undefined;
  }

  function handleRemoveChart(index: number) {
    setCustomCharts(prev => prev.filter((_, i) => i !== index));
  }

  function handleClearCharts() {
    setCustomCharts([]);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Sidebar */}
      <Sidebar
        userEmail={userEmail}
        history={history}
        onFileSelect={handleFileSelect}
        onAnalyze={handleAnalyze}
        onForceAnalyze={handleForceAnalyze}
        isAnalyzing={isAnalyzing}
        onHistorySelect={handleHistorySelect}
        onHistoryDelete={handleHistoryDelete}
        onClearHistory={handleClearHistory}
        onSignOut={handleSignOut}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-6 py-3 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <div>
            {analysis ? (
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--text)' }}>
                  {analysis.statement.propertyName}
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {analysis.statement.period} &middot; {analysis.fileName}
                </p>
              </div>
            ) : (
              <p style={{ color: 'var(--muted)' }}>No file analyzed</p>
            )}
          </div>
          <ThemeToggle />
        </div>

        {/* Tabs */}
        {analysis && (
          <div
            className="flex border-b overflow-x-auto"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
          >
            {/* Analysis tabs */}
            {ANALYSIS_TABS.map(tab => (
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
                {tab.id === 'anomalies' && analysis.anomalies.filter((a, i) => a.severity === 'high' && !resolvedAnomalies.has(i)).length > 0 && (
                  <span
                    className="ml-1 px-1.5 py-0.5 text-xs rounded-full"
                    style={{ backgroundColor: 'var(--danger)', color: 'white' }}
                  >
                    {analysis.anomalies.filter((a, i) => a.severity === 'high' && !resolvedAnomalies.has(i)).length}
                  </span>
                )}
              </button>
            ))}

            {/* Spacer pushes Tools to the right */}
            <div className="flex-1" />

            {/* Separator */}
            <div className="flex items-center" style={{ borderLeft: '1px solid var(--border)', margin: '6px 0' }} />
            <span
              className="self-center px-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
              style={{ color: 'var(--muted)', opacity: 0.5 }}
            >
              Tools
            </span>

            {/* Tool tabs */}
            {TOOL_TABS.map(tab => (
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
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {analyzeError && (
            <div className="mb-4 p-3 rounded-md text-sm" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
              {analyzeError}
            </div>
          )}

          {duplicateNotice && (
            <div className="mb-4 p-3 rounded-md text-sm flex items-center gap-2" style={{ backgroundColor: 'rgba(59,130,246,0.08)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {duplicateNotice} Use Force Re-analyze in the sidebar to re-run the AI extraction.
            </div>
          )}

          {isAnalyzing && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div
                className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
              />
              <p style={{ color: 'var(--muted)' }}>Analyzing your statement...</p>
            </div>
          )}

          {!isAnalyzing && !analysis && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text)' }}>
                  Welcome to Statement Utility
                </h2>
                <p className="max-w-md" style={{ color: 'var(--muted)' }}>
                  Upload an Excel P&L statement using the sidebar to get started. You&apos;ll receive
                  automated ratio analysis, AI insights, trend detection, and anomaly alerts.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {['Financial Ratios', 'AI Insights', 'Trend Analysis', 'Anomaly Detection', 'Chat Interface', 'Custom Charts'].map(f => (
                  <div key={f} className="card text-sm text-center" style={{ color: 'var(--muted)' }}>
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isAnalyzing && analysis && (
            <>
              {activeTab === 'summary' && (
                <SummaryTab
                  analysis={analysis}
                  summaryText={summaryText}
                  summaryStreaming={summaryStreaming}
                />
              )}
              {activeTab === 'revenue' && <RevenueTab analysis={analysis} />}
              {activeTab === 'expenses' && <ExpensesTab analysis={analysis} />}
              {activeTab === 'ratios' && <RatiosTab analysis={analysis} />}
              {activeTab === 'trends' && <TrendsTab analysis={analysis} />}
              {activeTab === 'anomalies' && (
                <AnomaliesTab
                  analysis={analysis}
                  anomalyExplanations={anomalyExplanations}
                  resolvedAnomalies={resolvedAnomalies}
                  onExplain={handleExplainAnomaly}
                  onResolve={handleResolveAnomaly}
                />
              )}
              {activeTab === 'deal' && <DealDetailsTab analysis={analysis} />}
              {activeTab === 'chat' && (
                <ChatTab
                  analysis={analysis}
                  chatHistory={chatHistory}
                  isChatStreaming={isChatStreaming}
                  onSend={handleSendChat}
                  onClearChat={handleClearChat}
                />
              )}
              {activeTab === 'charts' && (
                <CustomChartsTab
                  analysis={analysis}
                  customCharts={customCharts}
                  onGenerate={handleGenerateChart}
                  onRemoveChart={handleRemoveChart}
                  onClearCharts={handleClearCharts}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Force Re-analyze confirmation modal */}
      {showForceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Re-run AI Analysis?</h3>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              This will re-run the AI extraction and analysis on this file, bypassing the cached result.
              Your current chat messages, custom charts, and deal detail inputs will be preserved.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowForceConfirm(false)}
                className="px-4 py-2 text-sm rounded-md border transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmForceAnalyze}
                className="px-4 py-2 text-sm rounded-md transition-colors hover:opacity-80"
                style={{ backgroundColor: '#f59e0b', color: 'white' }}
              >
                Re-analyze
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
