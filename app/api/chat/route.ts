import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGroqClient, DEFAULT_MODEL } from '@/lib/agents/base';
import type { ChatMessage } from '@/lib/agents/chat-agent';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { question, history, context, groundingData } = await request.json() as {
      question: string;
      history: ChatMessage[];
      context: string;
      groundingData: string;
    };

    const groq = getGroqClient();

    const recentHistory = history.slice(-8);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `You are a financial analyst assistant specializing in multifamily real estate P&L analysis.
Answer questions accurately based on the financial data provided.
Be concise, specific, and actionable. Use dollar amounts and percentages where relevant.

${context}`,
      },
    ];

    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const userContent = groundingData
      ? `GROUNDING DATA:\n${groundingData}\n\nQuestion: ${question}`
      : question;

    messages.push({ role: 'user', content: userContent });

    const stream = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      stream: true,
      messages,
      max_tokens: 512,
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
    console.error('Chat error:', err);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
