import { getGroqClient, DEFAULT_MODEL } from './base';
import type { Anomaly } from '../models/statement';

export async function* generateExecutiveSummary(context: string): AsyncIterable<string> {
  const groq = getGroqClient();

  const stream = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    stream: true,
    messages: [
      {
        role: 'system',
        content: `You are a senior financial analyst specializing in multifamily real estate P&L analysis.
Generate exactly 3-5 bullet points analyzing the provided P&L statement data.
Each bullet must:
- Start with "- **[Bold Topic]:** " (e.g., "- **Revenue Performance:** ")
- Explain WHY the metric matters and WHAT ACTION should be taken, not just state the number
- Be specific to the data provided
- Highlight risks, opportunities, and recommendations
No headers, no preamble, no filler text. No intro sentence. Start directly with "- **".`,
      },
      {
        role: 'user',
        content: `Please analyze this financial statement and provide your executive summary:\n\n${context}`,
      },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) yield text;
  }
}

export async function* explainAnomaly(anomaly: Anomaly, context: string): AsyncIterable<string> {
  const groq = getGroqClient();

  const anomalyDetails = `
Anomaly Type: ${anomaly.type}
Severity: ${anomaly.severity}
Label: ${anomaly.label}
Cell Reference: ${anomaly.cellRef}
Description: ${anomaly.description}
Detected: ${anomaly.detected}
Expected: ${anomaly.expected}
Category: ${anomaly.category}
`.trim();

  const stream = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    stream: true,
    messages: [
      {
        role: 'system',
        content: `You are a financial analyst reviewing a real estate P&L anomaly.
In 2-3 sentences, explain:
1. What this anomaly likely means in the context of the property's financials
2. What action a property manager or analyst should take to investigate or address it
Be concise, specific, and actionable. No filler. No headers.`,
      },
      {
        role: 'user',
        content: `Anomaly details:\n${anomalyDetails}\n\nFinancial context:\n${context}`,
      },
    ],
    max_tokens: 256,
    temperature: 0.2,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) yield text;
  }
}
