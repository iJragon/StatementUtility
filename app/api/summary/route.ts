import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGroqClient, DEFAULT_MODEL } from '@/lib/agents/base';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { context } = await request.json() as { context: string };
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
          content: `Please analyze this financial statement:\n\n${context}`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
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
    console.error('Summary error:', err);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
