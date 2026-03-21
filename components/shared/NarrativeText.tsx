import type React from 'react';

/**
 * Renders AI-generated narrative markdown into styled JSX.
 * Handles ## headings (rendered as small-caps section headers) and **bold** text.
 */
// A line consisting entirely of **Bold Text** — treat as a section header
// (fallback for models that ignore the ## instruction)
const BOLD_ONLY = /^\*\*([^*]+)\*\*$/;

export function renderNarrative(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const isMarkdownHeader = line.startsWith('## ') || line.startsWith('# ');
    const boldOnly = !isMarkdownHeader ? BOLD_ONLY.exec(line) : null;

    if (isMarkdownHeader || boldOnly) {
      const heading = isMarkdownHeader
        ? line.replace(/^#+\s*/, '')
        : boldOnly![1];
      elements.push(
        <h4
          key={key++}
          className="text-sm font-semibold mt-4 mb-1 uppercase tracking-wide"
          style={{ color: 'var(--muted)' }}
        >
          {heading}
        </h4>,
      );
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={key++} className="text-sm leading-7 mb-1" style={{ color: 'var(--text)' }}>
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} style={{ color: 'var(--text)' }}>{part.slice(2, -2)}</strong>
              : part,
          )}
        </p>,
      );
    }
  }

  return elements;
}
