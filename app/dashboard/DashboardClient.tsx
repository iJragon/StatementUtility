'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { buildFinancialContext } from '@/lib/agents/base';
import { detectCrossYearAnomalies, buildPortfolioKeyMetrics } from '@/lib/agents/portfolio-agent';
import type { AnalysisResult } from '@/lib/models/statement';
import type { ChatMessage } from '@/lib/agents/chat-agent';
import type { ChartSpec } from '@/lib/agents/viz-agent';
import type { PropertyEntry, PropertyDetail, PropertyStatement, CrossYearFlag, PortfolioKeyMetric } from '@/lib/models/portfolio';
import type { HistoryEntry } from './page';
import Sidebar from '@/components/dashboard/Sidebar';
import SummaryTab from '@/components/dashboard/tabs/SummaryTab';
import RevenueTab from '@/components/dashboard/tabs/RevenueTab';
import ExpensesTab from '@/components/dashboard/tabs/ExpensesTab';
import RatiosTab from '@/components/dashboard/tabs/RatiosTab';
import TrendsTab from '@/components/dashboard/tabs/TrendsTab';
import AnomaliesTab from '@/components/dashboard/tabs/AnomaliesTab';
import DealDetailsTab, { type DealInputs, DEFAULT_DEAL_INPUTS } from '@/components/dashboard/tabs/DealDetailsTab';
import ChatTab from '@/components/dashboard/tabs/ChatTab';
import CustomChartsTab from '@/components/dashboard/tabs/CustomChartsTab';
import BenchmarksTab from '@/components/dashboard/tabs/BenchmarksTab';
import PropertyView from '@/components/portfolio/PropertyView';

interface DashboardClientProps {
  userEmail: string;
  initialHistory: HistoryEntry[];
  initialProperties: PropertyEntry[];
}

const ANALYSIS_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'ratios', label: 'Ratios' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'trends', label: 'Trends' },
  { id: 'anomalies', label: 'Anomalies' },
];

const TOOL_TABS = [
  { id: 'deal', label: 'Deal Details' },
  { id: 'chat', label: 'Chat' },
  { id: 'charts', label: 'Charts' },
];

export default function DashboardClient({ userEmail, initialHistory, initialProperties }: DashboardClientProps) {
  const router = useRouter();

  // ── Analysis view state ────────────────────────────────────────────────────
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ current: number; total: number } | null>(null);
  const [analyzeError, setAnalyzeError] = useState('');
  const [duplicateNotice, setDuplicateNotice] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [summaryStreaming, setSummaryStreaming] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [customCharts, setCustomCharts] = useState<Array<{ spec: ChartSpec; explanation: string; title: string }>>([]);
  const [dealInputs, setDealInputs] = useState<DealInputs>(DEFAULT_DEAL_INPUTS);
  const [anomalyExplanations, setAnomalyExplanations] = useState<Record<number, string>>({});
  const [resolvedAnomalies, setResolvedAnomalies] = useState<Set<number>>(new Set());
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const selectedFileRef = useRef<File | null>(null);
  const fileQueueRef = useRef<File[]>([]);

  // ── Portfolio view state ───────────────────────────────────────────────────
  const [properties, setProperties] = useState<PropertyEntry[]>(initialProperties);
  const [activeView, setActiveView] = useState<'analysis' | 'property'>('analysis');
  const [activePropertyId, setActivePropertyId] = useState<string | undefined>();
  const [propertyDetail, setPropertyDetail] = useState<PropertyDetail | null>(null);
  const [propertyAnalyses, setPropertyAnalyses] = useState<AnalysisResult[]>([]);
  const [portfolioSummaryText, setPortfolioSummaryText] = useState('');
  const [portfolioStreaming, setPortfolioStreaming] = useState(false);
  const [portfolioCrossYearFlags, setPortfolioCrossYearFlags] = useState<CrossYearFlag[]>([]);
  const [portfolioKeyMetrics, setPortfolioKeyMetrics] = useState<PortfolioKeyMetric[]>([]);
  const [propertyLoading, setPropertyLoading] = useState(false);

  // ── Tool state persistence ─────────────────────────────────────────────────
  useEffect(() => {
    if (!analysis) return;
    try { localStorage.setItem(`sa_charts_${analysis.fileHash}`, JSON.stringify(customCharts)); } catch {}
  }, [customCharts, analysis?.fileHash]);

  useEffect(() => {
    if (!analysis) return;
    try { localStorage.setItem(`sa_deal_${analysis.fileHash}`, JSON.stringify(dealInputs)); } catch {}
  }, [dealInputs, analysis?.fileHash]);

  function loadToolsFromStorage(fileHash: string) {
    try {
      const charts = localStorage.getItem(`sa_charts_${fileHash}`);
      setCustomCharts(charts ? JSON.parse(charts) : []);
      const deal = localStorage.getItem(`sa_deal_${fileHash}`);
      setDealInputs(deal ? JSON.parse(deal) : DEFAULT_DEAL_INPUTS);
    } catch {
      setCustomCharts([]);
      setDealInputs(DEFAULT_DEAL_INPUTS);
    }
  }

  // ── File upload / analysis ─────────────────────────────────────────────────
  const handleFilesSelect = useCallback((files: File[]) => {
    fileQueueRef.current = files;
    selectedFileRef.current = files[0] ?? null;
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
    setActiveView('analysis');

    if (!force) {
      setChatHistory([]);
      setAnomalyExplanations({});
      setResolvedAnomalies(new Set());
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const url = force ? '/api/analyze?force=true' : '/api/analyze';
      const res = await fetch(url, { method: 'POST', body: formData });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(err.error || 'Analysis failed');
      }

      const result: AnalysisResult = await res.json();
      setAnalysis(result);
      setActiveTab('summary');

      if (result.fromCache && !force) {
        setDuplicateNotice(`This file was already analyzed. Loaded from history.`);
        setSummaryText(result.summaryText ?? '');
        setChatHistory(result.chatHistory ?? []);
        setAnomalyExplanations({});
        setResolvedAnomalies(new Set());
        loadToolsFromStorage(result.fileHash);
        return;
      }

      loadToolsFromStorage(result.fileHash);

      setHistory(prev => {
        const existing = prev.find(h => h.fileHash === result.fileHash);
        if (existing) return prev;
        const newEntry: HistoryEntry = {
          id: result.fileHash, // will be replaced on next page load with real UUID
          fileHash: result.fileHash,
          fileName: result.fileName,
          propertyName: result.statement.propertyName,
          period: result.statement.period,
          analyzedAt: result.analyzedAt,
        };
        return [newEntry, ...prev].slice(0, 200);
      });

      setSummaryStreaming(true);
      const context = buildFinancialContext(result.statement, result.ratios, result.anomalies, result.trends);
      let summaryAcc = '';
      try {
        await streamText('/api/summary', { context }, chunk => {
          summaryAcc += chunk;
          setSummaryText(summaryAcc);
        });
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

  const handleAnalyze = async () => {
    const queue = fileQueueRef.current;
    if (queue.length <= 1) {
      await runAnalyze(false);
      return;
    }
    // Multi-file: process in parallel for constant-time performance
    setIsAnalyzing(true);
    setAnalyzeError('');
    setDuplicateNotice('');
    setActiveView('analysis');
    setChatHistory([]);
    setAnomalyExplanations({});
    setResolvedAnomalies(new Set());
    setAnalyzeProgress({ current: queue.length, total: queue.length });

    const results = await Promise.all(queue.map(async file => {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/analyze', { method: 'POST', body: formData });
        if (!res.ok) return null;
        return await res.json() as AnalysisResult;
      } catch {
        return null;
      }
    }));

    const successful = results.filter((r): r is AnalysisResult => r !== null);

    // Add all to history in one pass
    setHistory(prev => {
      let updated = [...prev];
      for (const result of successful) {
        if (!updated.find(h => h.fileHash === result.fileHash)) {
          updated = [{
            id: result.fileHash,
            fileHash: result.fileHash,
            fileName: result.fileName,
            propertyName: result.statement.propertyName,
            period: result.statement.period,
            analyzedAt: result.analyzedAt,
          }, ...updated];
        }
      }
      return updated.slice(0, 200);
    });

    setAnalyzeProgress(null);
    setIsAnalyzing(false);

    // Show last successful result and stream its summary
    const lastResult = successful[successful.length - 1];
    if (lastResult) {
      selectedFileRef.current = queue[queue.length - 1];
      setAnalysis(lastResult);
      setActiveTab('summary');
      loadToolsFromStorage(lastResult.fileHash);
      if (!lastResult.fromCache) {
        setSummaryStreaming(true);
        const context = buildFinancialContext(lastResult.statement, lastResult.ratios, lastResult.anomalies, lastResult.trends);
        let acc = '';
        try {
          await streamText('/api/summary', { context }, chunk => {
            acc += chunk;
            setSummaryText(acc);
          });
          fetch('/api/analyze', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileHash: lastResult.fileHash, summaryText: acc }),
          }).catch(console.error);
        } finally {
          setSummaryStreaming(false);
        }
      } else {
        setSummaryText(lastResult.summaryText ?? '');
      }
    }
  };

  function handleForceAnalyze() {
    setShowForceConfirm(true);
  }

  async function confirmForceAnalyze() {
    setShowForceConfirm(false);

    if (selectedFileRef.current) {
      runAnalyze(true);
      return;
    }

    if (!analysis) return;
    setIsAnalyzing(true);
    setAnalyzeError('');
    setDuplicateNotice('');
    setSummaryText('');
    setAnomalyExplanations({});
    setResolvedAnomalies(new Set());

    try {
      const res = await fetch('/api/analyze/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileHash: analysis.fileHash }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Reprocess failed' }));
        throw new Error(err.error || 'Reprocess failed');
      }

      const result: AnalysisResult = await res.json();
      setAnalysis(result);
      setActiveTab('summary');
      setHistory(prev => prev.map(h =>
        h.id === result.fileHash ? { ...h, analyzedAt: result.analyzedAt } : h,
      ));

      setSummaryStreaming(true);
      const context = buildFinancialContext(result.statement, result.ratios, result.anomalies, result.trends);
      let summaryAcc = '';
      try {
        await streamText('/api/summary', { context }, chunk => {
          summaryAcc += chunk;
          setSummaryText(summaryAcc);
        });
        fetch('/api/analyze', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileHash: result.fileHash, summaryText: summaryAcc }),
        }).catch(console.error);
      } finally {
        setSummaryStreaming(false);
      }
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Reprocess failed');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleHistoryDelete(id: string) {
    await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
    setHistory(prev => prev.filter(h => h.id !== id));
  }

  async function handleHistoryRename(id: string, newName: string) {
    await fetch(`/api/history/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyName: newName }),
    });
    setHistory(prev => prev.map(h => h.id === id ? { ...h, propertyName: newName } : h));
    // Update currently loaded analysis name if it's the same entry
    if (analysis && (analysis.fileHash === id || history.find(h => h.id === id)?.fileHash === analysis.fileHash)) {
      setAnalysis(prev => prev ? { ...prev, statement: { ...prev.statement, propertyName: newName } } : prev);
    }
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
      setAnomalyExplanations({});
      setResolvedAnomalies(new Set());
      setDuplicateNotice('');
      loadToolsFromStorage(result.fileHash);
      setActiveView('analysis');
      setActivePropertyId(undefined);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
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

  function handleClearChat() { setChatHistory([]); }

  // ── Anomalies ──────────────────────────────────────────────────────────────
  async function handleExplainAnomaly(index: number) {
    if (!analysis) return;
    const anomaly = analysis.anomalies[index];
    if (!anomaly) return;
    const context = buildFinancialContext(analysis.statement, analysis.ratios, analysis.anomalies, analysis.trends);
    setAnomalyExplanations(prev => ({ ...prev, [index]: '' }));
    let acc = '';
    try {
      await streamText('/api/explain', { anomaly, context }, chunk => {
        acc += chunk;
        setAnomalyExplanations(prev => ({ ...prev, [index]: acc }));
      });
    } catch {
      setAnomalyExplanations(prev => ({ ...prev, [index]: 'Failed to generate explanation.' }));
    }
  }

  function handleResolveAnomaly(index: number) {
    setResolvedAnomalies(prev => new Set([...prev, index]));
  }
  function handleUnresolveAnomaly(index: number) {
    setResolvedAnomalies(prev => { const next = new Set(prev); next.delete(index); return next; });
  }

  // ── Charts ─────────────────────────────────────────────────────────────────
  async function handleGenerateChart(request: string): Promise<string | undefined> {
    if (!analysis) return;
    const res = await fetch('/api/charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request, statement: analysis.statement }),
    });
    if (!res.ok) return 'Failed to reach the chart generation service.';
    const result = await res.json();
    if ('error' in result) return result.error as string;
    setCustomCharts(prev => [
      { spec: result.spec, explanation: result.explanation, title: result.spec.title },
      ...prev,
    ]);
    return undefined;
  }
  function handleRemoveChart(index: number) { setCustomCharts(prev => prev.filter((_, i) => i !== index)); }
  function handleClearCharts() { setCustomCharts([]); }

  // ── Sign out ───────────────────────────────────────────────────────────────
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  }

  // ── Portfolio / Properties ─────────────────────────────────────────────────
  async function handlePropertyCreate(name: string, address?: string) {
    const res = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, address }),
    });
    if (!res.ok) throw new Error('Failed to create property');
    const { property } = await res.json() as { property: PropertyEntry };
    setProperties(prev => [property, ...prev]);
    // Auto-open the newly created property
    await handlePropertySelect(property);
  }

  async function handlePropertyDelete(id: string) {
    await fetch(`/api/properties/${id}`, { method: 'DELETE' });
    setProperties(prev => prev.filter(p => p.id !== id));
    if (activePropertyId === id) {
      setActivePropertyId(undefined);
      setPropertyDetail(null);
      setPropertyAnalyses([]);
      setActiveView('analysis');
    }
  }

  async function handlePropertySelect(prop: PropertyEntry) {
    setActiveView('property');
    setActivePropertyId(prop.id);
    setPropertyLoading(true);
    setPortfolioSummaryText('');

    try {
      const res = await fetch(`/api/properties/${prop.id}`);
      if (!res.ok) throw new Error('Failed to load property');
      const { property, analyses } = await res.json() as {
        property: PropertyDetail;
        analyses: AnalysisResult[];
      };
      setPropertyDetail(property);
      setPropertyAnalyses(analyses);
      setPortfolioSummaryText(property.portfolioSummary ?? '');
      setPortfolioCrossYearFlags(detectCrossYearAnomalies(analyses, property.statements.map(s => s.yearLabel)));
      setPortfolioKeyMetrics(buildPortfolioKeyMetrics(analyses, property.statements.map(s => s.yearLabel)));
    } catch (err) {
      console.error('Failed to load property:', err);
    } finally {
      setPropertyLoading(false);
    }
  }

  async function handlePortfolioGenerateSummary() {
    if (!propertyDetail || propertyAnalyses.length === 0) return;
    setPortfolioStreaming(true);
    setPortfolioSummaryText('');
    const yearLabels = propertyDetail.statements.map(s => s.yearLabel);
    let acc = '';
    try {
      await streamText(
        `/api/properties/${propertyDetail.id}/analyze`,
        { propertyName: propertyDetail.name, analyses: propertyAnalyses, yearLabels },
        chunk => { acc += chunk; setPortfolioSummaryText(acc); },
      );
      // Update local property detail
      setPropertyDetail(prev => prev ? { ...prev, portfolioSummary: acc, portfolioAnalyzedAt: new Date().toISOString() } : prev);
    } finally {
      setPortfolioStreaming(false);
    }
  }

  async function handleAddStatement(statements: Array<{ fileHash: string; yearLabel: string }>) {
    if (!propertyDetail) return;
    const res = await fetch(`/api/properties/${propertyDetail.id}/statements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statements }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add statement' }));
      throw new Error(err.error || 'Failed to add statement');
    }
    const { added } = await res.json() as {
      added: Array<{ stmt: PropertyStatement; analysis: AnalysisResult }>;
      errors: string[];
    };
    if (added.length === 0) return;

    const newStmts = added.map(a => a.stmt);
    const newAnalyses = added.map(a => a.analysis);
    const updatedStmts = [...propertyDetail.statements, ...newStmts];
    const updatedAnalyses = [...propertyAnalyses, ...newAnalyses];

    setPropertyDetail(prev => prev ? { ...prev, statements: updatedStmts } : prev);
    setPropertyAnalyses(updatedAnalyses);
    setProperties(prev => prev.map(p =>
      p.id === propertyDetail.id ? { ...p, statementCount: p.statementCount + added.length } : p,
    ));
    setPortfolioCrossYearFlags(detectCrossYearAnomalies(updatedAnalyses, updatedStmts.map(s => s.yearLabel)));
    setPortfolioKeyMetrics(buildPortfolioKeyMetrics(updatedAnalyses, updatedStmts.map(s => s.yearLabel)));
  }

  // Analyze a file for a property context — adds to history automatically
  async function handleAnalyzeFileForProperty(file: File): Promise<AnalysisResult> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/analyze', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
      throw new Error(err.error || 'Analysis failed');
    }
    const result: AnalysisResult = await res.json();
    // Add to history immediately so it appears without a page refresh
    setHistory(prev => {
      if (prev.find(h => h.fileHash === result.fileHash)) return prev;
      const newEntry: HistoryEntry = {
        id: result.fileHash,
        fileHash: result.fileHash,
        fileName: result.fileName,
        propertyName: result.statement.propertyName,
        period: result.statement.period,
        analyzedAt: result.analyzedAt,
      };
      return [newEntry, ...prev].slice(0, 200);
    });
    return result;
  }

  async function handleRemoveStatement(stmtId: string) {
    if (!propertyDetail) return;
    await fetch(`/api/properties/${propertyDetail.id}/statements/${stmtId}`, { method: 'DELETE' });

    const removedStmt = propertyDetail.statements.find(s => s.id === stmtId);
    const updatedStmts = propertyDetail.statements.filter(s => s.id !== stmtId);
    const updatedAnalyses = removedStmt
      ? propertyAnalyses.filter(a => a.fileHash !== removedStmt.fileHash)
      : propertyAnalyses;

    setPropertyDetail(prev => prev ? { ...prev, statements: updatedStmts } : prev);
    setPropertyAnalyses(updatedAnalyses);
    setProperties(prev => prev.map(p =>
      p.id === propertyDetail.id ? { ...p, statementCount: Math.max(0, p.statementCount - 1) } : p,
    ));
    setPortfolioCrossYearFlags(detectCrossYearAnomalies(updatedAnalyses, updatedStmts.map(s => s.yearLabel)));
    setPortfolioKeyMetrics(buildPortfolioKeyMetrics(updatedAnalyses, updatedStmts.map(s => s.yearLabel)));
  }

  async function handlePropertyRename(id: string, newName: string) {
    await fetch(`/api/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    setProperties(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
    if (propertyDetail?.id === id) {
      setPropertyDetail(prev => prev ? { ...prev, name: newName } : prev);
    }
  }

  async function handlePropertyAddressEdit(id: string, address: string) {
    await fetch(`/api/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim() || null }),
    });
    const normalized = address.trim() || undefined;
    setProperties(prev => prev.map(p => p.id === id ? { ...p, address: normalized } : p));
    if (propertyDetail?.id === id) {
      setPropertyDetail(prev => prev ? { ...prev, address: normalized } : prev);
    }
  }

  async function handleRenameStatement(stmtId: string, newLabel: string) {
    if (!propertyDetail) return;
    await fetch(`/api/properties/${propertyDetail.id}/statements/${stmtId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearLabel: newLabel }),
    });
    // Update local state without full reload
    setPropertyDetail(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        statements: prev.statements.map(s => s.id === stmtId ? { ...s, yearLabel: newLabel } : s),
      };
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      <Sidebar
        userEmail={userEmail}
        history={history}
        hasAnalysis={analysis !== null}
        properties={properties}
        activePropertyId={activePropertyId}
        isAnalyzing={isAnalyzing}
        analyzeProgress={analyzeProgress}
        onFilesSelect={handleFilesSelect}
        onAnalyze={handleAnalyze}
        onForceAnalyze={handleForceAnalyze}
        onHistorySelect={handleHistorySelect}
        onHistoryDelete={handleHistoryDelete}
        onHistoryRename={handleHistoryRename}
        onClearHistory={handleClearHistory}
        onPropertySelect={handlePropertySelect}
        onPropertyCreate={handlePropertyCreate}
        onPropertyRename={handlePropertyRename}
        onPropertyAddressEdit={handlePropertyAddressEdit}
        onPropertyDelete={handlePropertyDelete}
        onNavigateHome={() => { setActiveView('analysis'); setActivePropertyId(undefined); setAnalysis(null); }}
        onSignOut={handleSignOut}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeView === 'property' && propertyDetail ? (
          // ── Property portfolio view ────────────────────────────────────────
          propertyLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
              <p style={{ color: 'var(--muted)' }}>Loading property data...</p>
            </div>
          ) : (
            <PropertyView
              property={propertyDetail}
              analyses={propertyAnalyses}
              crossYearFlags={portfolioCrossYearFlags}
              keyMetrics={portfolioKeyMetrics}
              summaryText={portfolioSummaryText}
              summaryStreaming={portfolioStreaming}
              history={history}
              onGenerateSummary={handlePortfolioGenerateSummary}
              onAddStatements={handleAddStatement}
              onAnalyzeFile={handleAnalyzeFileForProperty}
              onRemoveStatement={handleRemoveStatement}
              onRenameStatement={handleRenameStatement}
              onRenameProperty={(name) => handlePropertyRename(propertyDetail.id, name)}
              onDeleteProperty={() => handlePropertyDelete(propertyDetail.id)}
            />
          )
        ) : (
          // ── Individual statement analysis view ─────────────────────────────
          <>
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
            </div>

            {/* Tabs */}
            {analysis && (
              <div
                className="flex border-b overflow-x-auto"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
              >
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

                <div className="flex-1" />
                <div className="flex items-center" style={{ borderLeft: '1px solid var(--border)', margin: '6px 0' }} />
                <span
                  className="self-center px-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: 'var(--muted)', opacity: 0.5 }}
                >
                  Tools
                </span>

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
                <div className="alert-error mb-4 p-3 rounded-md text-sm">
                  {analyzeError}
                </div>
              )}

              {duplicateNotice && (
                <div className="alert-info mb-4 p-3 rounded-md text-sm flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  {duplicateNotice} Use Force Re-analyze in the sidebar to re-run the AI extraction.
                </div>
              )}

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                  <p style={{ color: 'var(--muted)' }}>Analyzing your statement...</p>
                </div>
              )}

              {!isAnalyzing && !analysis && (
                <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                  <div>
                    <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text)' }}>
                      Welcome to Estatelytics
                    </h2>
                    <p className="max-w-md" style={{ color: 'var(--muted)' }}>
                      Upload an Excel P&L statement using the sidebar to get started. You&apos;ll receive
                      automated ratio analysis, AI insights, trend detection, and anomaly alerts.
                      Or create a Property to track multiple statements over time.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 max-w-lg">
                    {['Financial Ratios', 'AI Insights', 'Trend Analysis', 'Anomaly Detection', 'Chat Interface', 'Property Portfolio'].map(f => (
                      <div key={f} className="card text-sm text-center" style={{ color: 'var(--muted)' }}>{f}</div>
                    ))}
                  </div>
                </div>
              )}

              {!isAnalyzing && analysis && (
                <>
                  {activeTab === 'summary' && (
                    <SummaryTab analysis={analysis} summaryText={summaryText} summaryStreaming={summaryStreaming} onTabChange={setActiveTab} />
                  )}
                  {activeTab === 'revenue' && <RevenueTab analysis={analysis} />}
                  {activeTab === 'expenses' && <ExpensesTab analysis={analysis} />}
                  {activeTab === 'ratios' && <RatiosTab analysis={analysis} />}
                  {activeTab === 'benchmarks' && <BenchmarksTab ratios={analysis.ratios} />}
                  {activeTab === 'trends' && <TrendsTab analysis={analysis} />}
                  {activeTab === 'anomalies' && (
                    <AnomaliesTab
                      analysis={analysis}
                      anomalyExplanations={anomalyExplanations}
                      resolvedAnomalies={resolvedAnomalies}
                      onExplain={handleExplainAnomaly}
                      onResolve={handleResolveAnomaly}
                      onUnresolve={handleUnresolveAnomaly}
                    />
                  )}
                  {activeTab === 'deal' && (
                    <DealDetailsTab
                      analysis={analysis}
                      inputs={dealInputs}
                      onInputChange={(key, value) => setDealInputs(prev => ({ ...prev, [key]: value }))}
                    />
                  )}
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
          </>
        )}
      </div>

      {/* Force Re-analyze confirmation modal */}
      {showForceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
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
