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
          content: `You are a senior financial analyst preparing the executive summary section of a formal REIT property-level annual report.

Write a structured narrative using these exact markdown section headers, in this order:
## Financial Results
## Operational Performance
## Expense Management
## Outlook

Style rules — follow strictly:
- Third-person formal voice throughout: "The property delivered...", "Management achieved...", "Results reflect...", "The portfolio demonstrated..."
- Always cite specific dollar amounts and percentages from the data provided
- Express ratio changes in basis points where appropriate (e.g. "OER improved 80 bps to 52.3%")
- Explain the underlying driver behind each metric, not just the number itself
- The Outlook section must close with a forward-looking statement beginning with "The property remains well-positioned to..." or similar
- No bullet points. Formal paragraph prose only. 2-4 sentences per section.
- Do not include any preamble or intro before the first ## header.`,
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
