'use client';

import { useState, useRef, useEffect } from 'react';
import type { AnalysisResult } from '@/lib/models/statement';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PropertyChatTabProps {
  propertyName: string;
  analyses: AnalysisResult[];
  periods: string[];
}

function fmt$(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function buildContext(propertyName: string, analyses: AnalysisResult[], periods: string[]): string {
  const lines: string[] = [];
  lines.push(`=== PROPERTY: ${propertyName} ===`);
  lines.push(`Periods analyzed: ${periods.join(', ')}`);
  lines.push('');

  for (let i = 0; i < analyses.length; i++) {
    const a = analyses[i];
    const label = periods[i] || a.statement.period;
    lines.push(`--- ${label} ---`);

    const kf = a.statement.keyFigures;
    const keys = [
      'gross_potential_rent', 'vacancy_loss', 'net_rental_revenue',
      'total_revenue', 'total_operating_expenses', 'noi',
      'total_payroll', 'management_fees', 'utilities',
      'real_estate_taxes', 'insurance', 'net_income', 'cash_flow',
    ];
    for (const key of keys) {
      const row = kf[key];
      if (row?.annualTotal !== undefined && row.annualTotal !== null) {
        lines.push(`  ${row.label}: ${fmt$(row.annualTotal)}`);
      }
    }

    const r = a.ratios;
    lines.push(`  OER: ${r.oer.value !== null ? r.oer.value.toFixed(1) + '%' : 'N/A'} [${r.oer.status}]`);
    lines.push(`  NOI Margin: ${r.noiMargin.value !== null ? r.noiMargin.value.toFixed(1) + '%' : 'N/A'} [${r.noiMargin.status}]`);
    lines.push(`  Vacancy Rate: ${r.vacancyRate.value !== null ? r.vacancyRate.value.toFixed(1) + '%' : 'N/A'} [${r.vacancyRate.status}]`);
    lines.push(`  Payroll %: ${r.payrollPct.value !== null ? r.payrollPct.value.toFixed(1) + '%' : 'N/A'} [${r.payrollPct.status}]`);
    lines.push('');
  }

  return lines.join('\n');
}

const INITIAL_SUGGESTIONS = [
  'What drove the biggest changes in NOI across periods?',
  'How has vacancy trended and what is the impact?',
  'Compare expense growth to revenue growth',
  'Which period performed best and why?',
  'What are the key risks to NOI going forward?',
  'Is payroll as a percentage of revenue within norms?',
];

function renderMessage(content: string) {
  const lines = content.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className={`text-sm leading-6 ${i > 0 ? 'mt-1' : ''}`}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : part,
        )}
      </p>
    );
  });
}

export default function PropertyChatTab({ propertyName, analyses, periods }: PropertyChatTabProps) {
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const prevStreamingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const context = buildContext(propertyName, analyses, periods);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Fetch contextual follow-up suggestions when streaming ends
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    if (wasStreaming && !isStreaming && chatHistory.length >= 2) {
      const lastAssistant = [...chatHistory].reverse().find(m => m.role === 'assistant');
      const lastUser = [...chatHistory].reverse().find(m => m.role === 'user');
      if (lastAssistant?.content && lastUser?.content) {
        setLoadingSuggestions(true);
        fetch('/api/chat/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: lastUser.content, answer: lastAssistant.content }),
        })
          .then(r => r.json())
          .then(data => setFollowUpSuggestions(data.suggestions ?? []))
          .catch(() => setFollowUpSuggestions([]))
          .finally(() => setLoadingSuggestions(false));
      }
    }
  }, [isStreaming, chatHistory]);

  async function handleSend(q?: string) {
    const text = (q ?? input).trim();
    if (!text || isStreaming) return;

    setInput('');
    setFollowUpSuggestions([]);

    const history = chatHistory.map(m => ({ role: m.role, content: m.content }));
    const userMsg: Message = { role: 'user', content: text };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setIsStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, history, context, groundingData: context }),
      });

      if (!res.ok) throw new Error('Chat request failed');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      // Add empty assistant message to stream into
      setChatHistory([...newHistory, { role: 'assistant', content: '' }]);

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setChatHistory(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      }
    } catch {
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = chatHistory.length === 0;

  return (
    <div className="flex flex-col h-full" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {/* Clear button */}
      {!isEmpty && (
        <div className="flex justify-end mb-2">
          <button
            onClick={() => { setChatHistory([]); setFollowUpSuggestions([]); }}
            disabled={isStreaming}
            className="text-xs px-2 py-1 rounded border transition-colors hover:opacity-70"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Clear chat
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {isEmpty ? (
          <div className="space-y-4">
            <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
              Ask any question about {propertyName}
            </p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {INITIAL_SUGGESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  className="text-left p-3 text-xs rounded-lg border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-lg p-3"
                  style={{
                    backgroundColor: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                    color: msg.role === 'user' ? 'white' : 'var(--text)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {msg.role === 'assistant' ? renderMessage(msg.content) : <p className="text-sm">{msg.content}</p>}
                  {msg.role === 'assistant' && i === chatHistory.length - 1 && isStreaming && (
                    <span
                      className="inline-block w-1 h-4 ml-0.5 animate-pulse"
                      style={{ backgroundColor: 'var(--accent)', verticalAlign: 'middle' }}
                    />
                  )}
                </div>
              </div>
            ))}

            {isStreaming && chatHistory[chatHistory.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  Thinking...
                </div>
              </div>
            )}

            {/* Contextual follow-up suggestions */}
            {!isStreaming && (followUpSuggestions.length > 0 || loadingSuggestions) && (
              <div className="space-y-1.5">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>You might also ask:</p>
                {loadingSuggestions ? (
                  <div className="flex gap-1">
                    {[80, 60, 70].map((w, i) => (
                      <div key={i} className="h-7 rounded-full animate-pulse" style={{ width: w + '%', backgroundColor: 'var(--border)' }} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {followUpSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(s)}
                        className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:opacity-80"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this property's financials..."
            rows={2}
            disabled={isStreaming}
            className="flex-1 input-field text-sm resize-none"
            style={{ backgroundColor: 'var(--bg)' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            className="btn-primary px-4 self-end"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Press Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  );
}
