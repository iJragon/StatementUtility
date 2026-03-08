import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGroqClient, DEFAULT_MODEL } from '@/lib/agents/base';
import type { Anomaly } from '@/lib/models/statement';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { anomaly, context } = await request.json() as { anomaly: Anomaly; context: string };
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

    return new Response(
      new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) controller.enqueue(new TextEncoder().encode(text));
          }
          controller.close();
        },
      }),
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  } catch (err) {
    console.error('Explain error:', err);
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 });
  }
}
