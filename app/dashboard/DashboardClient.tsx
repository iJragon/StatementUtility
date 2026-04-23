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
import type { Deal, DealEntry, InvestorProfile } from '@/lib/models/deal';
import type { HistoryEntry } from './page';
import Sidebar from '@/components/dashboard/Sidebar';
import SummaryTab from '@/components/dashboard/tabs/SummaryTab';
import RevenueTab from '@/components/dashboard/tabs/RevenueTab';
import ExpensesTab from '@/components/dashboard/tabs/ExpensesTab';
import RatiosTab from '@/components/dashboard/tabs/RatiosTab';
import TrendsTab from '@/components/dashboard/tabs/TrendsTab';
import AnomaliesTab from '@/components/dashboard/tabs/AnomaliesTab';
import PropertyContextTab, { type PropertyInputs, DEFAULT_PROPERTY_INPUTS } from '@/components/dashboard/tabs/PropertyContextTab';
import ChatTab from '@/components/dashboard/tabs/ChatTab';
import CustomChartsTab from '@/components/dashboard/tabs/CustomChartsTab';
import BenchmarksTab from '@/components/dashboard/tabs/BenchmarksTab';
import PropertyView from '@/components/portfolio/PropertyView';
import DealView from '@/components/deals/DealView';
import DealCompareView from '@/components/deals/DealCompareView';
import InvestorProfilePanel from '@/components/deals/InvestorProfilePanel';
import NetworkAnimation from '@/components/dashboard/NetworkAnimation';
import { useTheme } from 'next-themes';

interface DashboardClientProps {
  userEmail: string;
  initialHistory: HistoryEntry[];
  initialProperties: PropertyEntry[];
  initialDeals: DealEntry[];
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
  { id: 'context', label: 'Property Context' },
  { id: 'chat', label: 'Chat' },
  { id: 'charts', label: 'Charts' },
];

export default function DashboardClient({ userEmail, initialHistory, initialProperties, initialDeals }: DashboardClientProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

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
  const [propertyInputs, setPropertyInputs] = useState<PropertyInputs>(DEFAULT_PROPERTY_INPUTS);
  const [anomalyExplanations, setAnomalyExplanations] = useState<Record<number, string>>({});
  const [resolvedAnomalies, setResolvedAnomalies] = useState<Set<number>>(new Set());
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const selectedFileRef = useRef<File | null>(null);
  const fileQueueRef = useRef<File[]>([]);

  // ── Deals state ───────────────────────────────────────────────────────────
  const [deals, setDeals] = useState<DealEntry[]>(initialDeals);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [activeDealId, setActiveDealId] = useState<string | undefined>();
  const [showCompare, setShowCompare] = useState(false);
  const [compareDeals, setCompareDeals] = useState<Deal[]>([]);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [investorProfile, setInvestorProfile] = useState<InvestorProfile | null>(null);
  const [showCompareSelector, setShowCompareSelector] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<Set<string>>(new Set());
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');

  // ── Portfolio view state ───────────────────────────────────────────────────
  const [properties, setProperties] = useState<PropertyEntry[]>(initialProperties);
  const [activeView, setActiveView] = useState<'analysis' | 'property' | 'deal'>('analysis');
  const [activePropertyId, setActivePropertyId] = useState<string | undefined>();
  const [propertyDetail, setPropertyDetail] = useState<PropertyDetail | null>(null);
  const [propertyAnalyses, setPropertyAnalyses] = useState<AnalysisResult[]>([]);
  const [portfolioSummaryText, setPortfolioSummaryText] = useState('');
  const [portfolioStreaming, setPortfolioStreaming] = useState(false);
  const [portfolioCrossYearFlags, setPortfolioCrossYearFlags] = useState<CrossYearFlag[]>([]);
  const [portfolioKeyMetrics, setPortfolioKeyMetrics] = useState<PortfolioKeyMetric[]>([]);
  const [propertyLoading, setPropertyLoading] = useState(false);
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);

  // ── Tool state persistence ─────────────────────────────────────────────────
  useEffect(() => {
    if (!analysis) return;
    try { localStorage.setItem(`sa_charts_${analysis.fileHash}`, JSON.stringify(customCharts)); } catch {}
  }, [customCharts, analysis?.fileHash]);

  useEffect(() => {
    if (!analysis) return;
    try { localStorage.setItem(`sa_context_${analysis.fileHash}`, JSON.stringify(propertyInputs)); } catch {}
  }, [propertyInputs, analysis?.fileHash]);

  function loadToolsFromStorage(fileHash: string) {
    try {
      const charts = localStorage.getItem(`sa_charts_${fileHash}`);
      setCustomCharts(charts ? JSON.parse(charts) : []);
      const ctx = localStorage.getItem(`sa_context_${fileHash}`);
      setPropertyInputs(ctx ? JSON.parse(ctx) : DEFAULT_PROPERTY_INPUTS);
    } catch {
      setCustomCharts([]);
      setPropertyInputs(DEFAULT_PROPERTY_INPUTS);
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
          id: result.id ?? result.fileHash,
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
            id: result.id ?? result.fileHash,
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

  async function refreshProperties() {
    try {
      const res = await fetch('/api/properties');
      if (!res.ok) return;
      const { properties: updated } = await res.json() as { properties: PropertyEntry[] };
      setProperties(updated);
    } catch {}
  }

  async function handleHistoryDelete(id: string) {
    await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
    setHistory(prev => prev.filter(h => h.id !== id));

    // Update the active property view if it references the deleted analysis
    if (propertyDetail) {
      const stmtIdx = propertyDetail.statements.findIndex(s => s.analysisId === id);
      if (stmtIdx !== -1) {
        const updatedStmts = propertyDetail.statements.filter((_, i) => i !== stmtIdx);
        const updatedAnalyses = propertyAnalyses.filter((_, i) => i !== stmtIdx);
        setPropertyDetail(prev => prev ? { ...prev, statements: updatedStmts } : prev);
        setPropertyAnalyses(updatedAnalyses);
        setPortfolioCrossYearFlags(detectCrossYearAnomalies(updatedAnalyses, updatedStmts.map(s => s.yearLabel)));
        setPortfolioKeyMetrics(buildPortfolioKeyMetrics(updatedAnalyses, updatedStmts.map(s => s.yearLabel)));
      }
    }

    // Refresh sidebar counts — the deleted analysis may have belonged to any property
    refreshProperties();
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

    // All analyses are gone — clear the active property view if open
    if (propertyDetail) {
      setPropertyDetail(prev => prev ? { ...prev, statements: [] } : prev);
      setPropertyAnalyses([]);
      setPortfolioCrossYearFlags([]);
      setPortfolioKeyMetrics([]);
    }

    // Refresh sidebar to show 0 statement counts
    refreshProperties();
  }

  async function handleHistorySelect(entry: HistoryEntry) {
    setLoadingHistoryId(entry.id);
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
    } finally {
      setLoadingHistoryId(null);
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
      // Auto-generate narrative on first open if statements exist but no narrative yet
      if (!property.portfolioSummary && analyses.length > 0) {
        handlePortfolioGenerateSummary(analyses, property.statements);
      }
    } catch (err) {
      console.error('Failed to load property:', err);
    } finally {
      setPropertyLoading(false);
    }
  }

  async function handlePortfolioGenerateSummary(
    overrideAnalyses?: AnalysisResult[],
    overrideStmts?: { yearLabel: string }[],
  ) {
    if (!propertyDetail) return;
    const analyses = overrideAnalyses ?? propertyAnalyses;
    const yearLabels = (overrideStmts ?? propertyDetail.statements).map(s => s.yearLabel);
    if (analyses.length === 0) return;
    setPortfolioStreaming(true);
    setPortfolioSummaryText('');
    let acc = '';
    try {
      await streamText(
        `/api/properties/${propertyDetail.id}/analyze`,
        { propertyName: propertyDetail.name, analyses, yearLabels },
        chunk => { acc += chunk; setPortfolioSummaryText(acc); },
      );
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
    // Auto-generate property narrative with fresh data (bypasses stale closure)
    handlePortfolioGenerateSummary(updatedAnalyses, updatedStmts);
  }

  async function handleOpenAnalysisFromProperty(analysisId: string) {
    setLoadingHistoryId(analysisId);
    try {
      const res = await fetch(`/api/history/${analysisId}`);
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
      console.error('Failed to load analysis:', err);
    } finally {
      setLoadingHistoryId(null);
    }
  }

  // Analyze a file for a property context - adds to history and auto-generates AI narrative
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
        id: result.id ?? result.fileHash,
        fileHash: result.fileHash,
        fileName: result.fileName,
        propertyName: result.statement.propertyName,
        period: result.statement.period,
        analyzedAt: result.analyzedAt,
      };
      return [newEntry, ...prev].slice(0, 200);
    });
    // Auto-generate AI narrative if not already cached
    if (!result.summaryText) {
      const context = buildFinancialContext(result.statement, result.ratios, result.anomalies, result.trends);
      let acc = '';
      try {
        await streamText('/api/summary', { context }, chunk => { acc += chunk; });
        fetch('/api/analyze', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileHash: result.fileHash, summaryText: acc }),
        }).catch(console.error);
        result.summaryText = acc;
      } catch { /* non-critical, narrative can be generated later */ }
    }
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

  // ── Deals ──────────────────────────────────────────────────────────────────
  async function handleDealCreate(name: string, address?: string) {
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, address }),
    });
    if (!res.ok) throw new Error('Failed to create deal');
    const { deal } = await res.json() as { deal: DealEntry };
    setDeals(prev => [deal, ...prev]);
    await handleDealSelect(deal);
  }

  async function handleDealSelect(entry: DealEntry) {
    setActiveView('deal');
    setActiveDealId(entry.id);
    try {
      const res = await fetch(`/api/deals/${entry.id}`);
      if (!res.ok) throw new Error('Failed to load deal');
      const { deal } = await res.json() as { deal: Deal };
      setActiveDeal(deal);
      setDeals(prev => prev.map(d => d.id === deal.id
        ? { ...d, status: deal.status, dealScore: deal.analysis?.score?.total ?? d.dealScore }
        : d,
      ));
    } catch (err) {
      console.error('Failed to load deal:', err);
    }
  }

  function handleDealUpdate(updated: Deal) {
    // When a fresh analysis arrives, stamp the current profile as the snapshot
    // so the banner clears immediately without waiting for a server round-trip.
    const withSnapshot: Deal = updated.analysis && investorProfile
      ? { ...updated, profileSnapshot: investorProfile }
      : updated;
    setActiveDeal(withSnapshot);
    setDeals(prev => prev.map(d => d.id === updated.id
      ? { ...d, status: updated.status, dealScore: updated.analysis?.score?.total ?? d.dealScore }
      : d,
    ));
  }

  async function handleDealDelete(id: string) {
    await fetch(`/api/deals/${id}`, { method: 'DELETE' });
    setDeals(prev => prev.filter(d => d.id !== id));
    if (activeDealId === id) {
      setActiveDeal(null);
      setActiveDealId(undefined);
      setActiveView('analysis');
    }
  }

  function handleShowCompare() {
    setSelectedCompareIds(new Set());
    setCompareError('');
    setShowCompareSelector(true);
  }

  async function handleConfirmCompare() {
    setCompareLoading(true);
    setCompareError('');
    const toLoad = deals.filter(d => selectedCompareIds.has(d.id));
    const loaded: Deal[] = [];
    let failed = 0;
    await Promise.all(toLoad.map(async entry => {
      try {
        const res = await fetch(`/api/deals/${entry.id}`);
        if (!res.ok) { failed++; return; }
        const { deal } = await res.json() as { deal: Deal };
        loaded.push(deal);
      } catch { failed++; }
    }));
    setCompareLoading(false);
    if (loaded.length < 2) {
      setCompareError(failed > 0 ? `Failed to load ${failed} deal${failed > 1 ? 's' : ''}. Try again.` : 'Select at least 2 deals to compare.');
      return;
    }
    const ordered = toLoad.map(e => loaded.find(d => d.id === e.id)).filter((d): d is Deal => !!d);
    setCompareDeals(ordered);
    setShowCompareSelector(false);
    setShowCompare(true);
  }

  // Eagerly load the investor profile whenever a deal is opened so the
  // profile-staleness banner can compare values without waiting for the user
  // to manually open the profile panel.
  useEffect(() => {
    if (activeDeal && !investorProfile) {
      fetch('/api/investor-profile')
        .then(r => r.ok ? r.json() : null)
        .then(async (data: { profile: InvestorProfile | null } | null) => {
          if (!data) return;
          const { DEFAULT_INVESTOR_PROFILE } = await import('@/lib/models/deal');
          setInvestorProfile(data.profile ?? DEFAULT_INVESTOR_PROFILE);
        })
        .catch(() => {});
    }
  }, [activeDeal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLoadProfile() {
    if (investorProfile) { setShowProfilePanel(true); return; }
    try {
      const res = await fetch('/api/investor-profile');
      if (!res.ok) return;
      const { profile } = await res.json() as { profile: InvestorProfile | null };
      const { DEFAULT_INVESTOR_PROFILE } = await import('@/lib/models/deal');
      setInvestorProfile(profile ?? DEFAULT_INVESTOR_PROFILE);
    } catch { /* use defaults */ } finally {
      setShowProfilePanel(true);
    }
  }

  async function handleSaveProfile(profile: InvestorProfile) {
    const res = await fetch('/api/investor-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (res.ok) {
      const { profile: saved } = await res.json() as { profile: InvestorProfile };
      setInvestorProfile(saved);
    }
  }

  async function handleDealRename(id: string, name: string) {
    await fetch(`/api/deals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setDeals(prev => prev.map(d => d.id === id ? { ...d, name } : d));
    if (activeDeal?.id === id) {
      setActiveDeal(prev => prev ? { ...prev, name } : prev);
    }
  }

  function handleViewInPortfolio(propertyId: string) {
    const prop = properties.find(p => p.id === propertyId);
    if (prop) {
      setShowCompare(false);
      handlePropertySelect(prop);
    }
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
        onHistorySelect={handleHistorySelect}
        onHistoryDelete={handleHistoryDelete}
        onHistoryRename={handleHistoryRename}
        onClearHistory={handleClearHistory}
        onPropertySelect={handlePropertySelect}
        onPropertyCreate={handlePropertyCreate}
        onPropertyRename={handlePropertyRename}
        onPropertyAddressEdit={handlePropertyAddressEdit}
        onPropertyDelete={handlePropertyDelete}
        onNavigateHome={() => { setActiveView('analysis'); setActivePropertyId(undefined); setActiveDealId(undefined); setActiveDeal(null); setAnalysis(null); }}
        onSignOut={handleSignOut}
        loadingHistoryId={loadingHistoryId}
        loadingPropertyId={propertyLoading ? activePropertyId : undefined}
        deals={deals}
        activeDealId={activeDealId}
        onDealSelect={handleDealSelect}
        onDealCreate={handleDealCreate}
        onDealDelete={handleDealDelete}
        onDealRename={handleDealRename}
        onDealCompare={handleShowCompare}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showCompare ? (
          <DealCompareView
            deals={compareDeals}
            onClose={() => setShowCompare(false)}
            onSelectDeal={deal => {
              setShowCompare(false);
              setActiveDeal(deal);
              setActiveDealId(deal.id);
              setActiveView('deal');
              setDeals(prev => prev.map(d => d.id === deal.id
                ? { ...d, status: deal.status, dealScore: deal.analysis?.score?.total ?? d.dealScore }
                : d,
              ));
            }}
          />
        ) : activeView === 'deal' && activeDeal ? (
          <DealView
            key={activeDeal.id}
            deal={activeDeal}
            onUpdate={handleDealUpdate}
            onDelete={handleDealDelete}
            onShowProfile={handleLoadProfile}
            onViewInPortfolio={handleViewInPortfolio}
            onPropertyLinked={refreshProperties}
            history={history}
            properties={properties}
            investorProfile={investorProfile}
          />
        ) : activeView === 'property' && (propertyLoading || propertyDetail) ? (
          // ── Property portfolio view ────────────────────────────────────────
          propertyLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
              <p style={{ color: 'var(--muted)' }}>Loading property data...</p>
            </div>
          ) : (
            <PropertyView
              property={propertyDetail!}
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
              onRenameProperty={(name) => handlePropertyRename(propertyDetail!.id, name)}
              onDeleteProperty={() => handlePropertyDelete(propertyDetail!.id)}
              onOpenAnalysis={handleOpenAnalysisFromProperty}
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
              {analysis && !isAnalyzing && (
                <button
                  onClick={handleForceAnalyze}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)', backgroundColor: 'var(--surface)' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Re-analyze
                </button>
              )}
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
                  {duplicateNotice} Click Re-analyze (top right) to re-run the AI extraction.
                </div>
              )}

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                  <p style={{ color: 'var(--muted)' }}>Analyzing your statement...</p>
                </div>
              )}

              {!isAnalyzing && !analysis && (
                <div className="relative flex flex-col items-center justify-center h-full overflow-hidden rounded-lg">
                  {/* Full-bleed animated background */}
                  <div className="absolute inset-0">
                    <NetworkAnimation />
                  </div>

                  {/* Content overlay */}
                  <div className="relative z-10 flex flex-col items-center gap-5 text-center px-8 py-12">
                    <p
                      className="text-xs font-semibold uppercase tracking-[0.25em]"
                      style={{
                        color: resolvedTheme === 'light' ? 'rgba(30,80,140,0.65)' : 'rgba(140,200,255,0.55)',
                        letterSpacing: '0.25em',
                      }}
                    >
                      Real Estate Intelligence
                    </p>

                    <h1
                      className="font-black uppercase"
                      style={{
                        fontSize: 'clamp(2.4rem, 6vw, 4.5rem)',
                        letterSpacing: '0.18em',
                        lineHeight: 1,
                        color: resolvedTheme === 'light' ? '#0f2744' : '#e8f4ff',
                        textShadow: resolvedTheme === 'light'
                          ? 'none'
                          : '0 0 60px rgba(0,160,255,0.35), 0 0 120px rgba(0,100,200,0.2)',
                      }}
                    >
                      ESTATELYTICS
                    </h1>

                    <p
                      className="text-sm leading-relaxed max-w-xs"
                      style={{
                        color: resolvedTheme === 'light' ? 'rgba(20,60,110,0.6)' : 'rgba(180,210,240,0.65)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Underwrite deals. Analyze properties. Decide with confidence.
                    </p>

                    <p
                      className="text-xs mt-2"
                      style={{ color: resolvedTheme === 'light' ? 'rgba(30,80,140,0.45)' : 'rgba(140,190,240,0.4)' }}
                    >
                      Upload a file or open a deal from the sidebar to begin.
                    </p>
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
                  {activeTab === 'context' && (
                    <PropertyContextTab
                      analysis={analysis}
                      inputs={propertyInputs}
                      onInputChange={(key, value) => setPropertyInputs(prev => ({ ...prev, [key]: value }))}
                      onPromotedRowsChange={async (rows) => {
                        setAnalysis(prev => prev ? {
                          ...prev,
                          statement: { ...prev.statement, promotedRows: rows },
                        } : prev);
                        await fetch('/api/analyze', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ fileHash: analysis.fileHash, promotedRows: rows }),
                        });
                      }}
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

      {/* Investor Profile Panel */}
      {showProfilePanel && investorProfile && (
        <InvestorProfilePanel
          profile={investorProfile}
          onSave={handleSaveProfile}
          onClose={() => setShowProfilePanel(false)}
        />
      )}

      {/* Compare Selector Modal */}
      {showCompareSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl shadow-2xl w-full max-w-md mx-4" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Select Deals to Compare</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Choose 2–6 analyzed deals</p>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
              {deals.filter(d => d.status !== 'draft' || d.dealScore !== undefined).length === 0 ? (
                <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--muted)' }}>No analyzed deals yet.</p>
              ) : (
                deals.filter(d => d.status !== 'draft' || d.dealScore !== undefined).map(deal => {
                  const isChecked = selectedCompareIds.has(deal.id);
                  const isDisabled = !isChecked && selectedCompareIds.size >= 6;
                  return (
                    <label
                      key={deal.id}
                      className="flex items-center gap-3 px-5 py-3 cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border)', opacity: isDisabled ? 0.45 : 1 }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={e => {
                          const next = new Set(selectedCompareIds);
                          if (e.target.checked) next.add(deal.id);
                          else next.delete(deal.id);
                          setSelectedCompareIds(next);
                        }}
                        className="w-4 h-4 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{deal.name}</p>
                        {deal.address && <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{deal.address}</p>}
                      </div>
                      {deal.dealScore !== undefined && (
                        <span className="text-xs font-bold shrink-0 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(37,99,235,0.1)', color: 'var(--accent)' }}>
                          {deal.dealScore}/100
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
            {compareError && (
              <p className="px-5 py-2 text-xs" style={{ color: 'var(--danger)', backgroundColor: 'rgba(239,68,68,0.05)' }}>{compareError}</p>
            )}
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { setShowCompareSelector(false); setCompareError(''); }}
                className="text-sm"
                style={{ color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCompare}
                disabled={selectedCompareIds.size < 2 || compareLoading}
                className="btn-primary px-4 py-2 text-sm"
              >
                {compareLoading ? 'Loading…' : `Compare${selectedCompareIds.size >= 2 ? ` (${selectedCompareIds.size})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
