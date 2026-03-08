'use client';

import { useState, useRef, useEffect } from 'react';
import type { AnalysisResult } from '@/lib/models/statement';
import type { ChatMessage } from '@/lib/agents/chat-agent';

interface ChatTabProps {
  analysis: AnalysisResult;
  chatHistory: ChatMessage[];
  isChatStreaming: boolean;
  onSend: (question: string) => void;
}

const SUGGESTED_QUESTIONS = [
  'What is the overall financial health of this property?',
  'Why is the NOI margin where it is?',
  'Which months had the highest vacancy rate?',
  'What are the top 3 areas to reduce expenses?',
  'How does the cash flow compare to net income?',
  'Is the payroll percentage within industry norms?',
  'What trends should I be concerned about?',
  'How is the management fee performing vs benchmark?',
  'What months had negative NOI and why?',
  'Which expenses are growing the fastest?',
  'What is the break-even occupancy rate?',
  'How are utilities trending over the period?',
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

export default function ChatTab({ analysis, chatHistory, isChatStreaming, onSend }: ChatTabProps) {
  const [input, setInput] = useState('');
  const [suggestions] = useState(() => {
    // Pick 6 random suggestions
    const shuffled = [...SUGGESTED_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  function handleSend() {
    const q = input.trim();
    if (!q || isChatStreaming) return;
    setInput('');
    onSend(q);
  }

  function handleSuggestion(q: string) {
    if (isChatStreaming) return;
    onSend(q);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {chatHistory.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
              Ask any question about {analysis.statement.propertyName}
            </p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {suggestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestion(q)}
                  className="text-left p-3 text-xs rounded-lg border transition-colors hover:opacity-80"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[85%] rounded-lg p-3"
                style={{
                  backgroundColor: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                  color: msg.role === 'user' ? 'white' : 'var(--text)',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                }}
              >
                {msg.role === 'assistant' ? (
                  renderMessage(msg.content)
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
                {msg.role === 'assistant' && i === chatHistory.length - 1 && isChatStreaming && (
                  <span
                    className="inline-block w-1 h-4 ml-0.5 animate-pulse"
                    style={{ backgroundColor: 'var(--accent)', verticalAlign: 'middle' }}
                  />
                )}
              </div>
            </div>
          ))
        )}

        {isChatStreaming && chatHistory[chatHistory.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div
              className="rounded-lg p-3 text-sm"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="pt-4 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this property's financials..."
            rows={2}
            disabled={isChatStreaming}
            className="flex-1 input-field text-sm resize-none"
            style={{ backgroundColor: 'var(--bg)' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isChatStreaming}
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
