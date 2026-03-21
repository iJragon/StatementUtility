import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPortfolioStream } from '@/lib/agents/portfolio-agent';
import type { AnalysisResult } from '@/lib/models/statement';

// POST /api/properties/[id]/analyze - stream portfolio summary
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: propertyId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  try {
    const { propertyName, analyses, yearLabels } = await request.json() as {
      propertyName: string;
      analyses: AnalysisResult[];
      yearLabels: string[];
    };

    if (!analyses || analyses.length < 1) {
      return new NextResponse('At least one analysis is required', { status: 400 });
    }

    const groqStream = await createPortfolioStream(propertyName, analyses, yearLabels);
    const encoder = new TextEncoder();
    let accumulated = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of groqStream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              accumulated += text;
              controller.enqueue(encoder.encode(text));
            }
          }
          // Persist the summary
          await supabase
            .from('properties')
            .update({
              portfolio_summary: accumulated,
              portfolio_analyzed_at: new Date().toISOString(),
            })
            .eq('id', propertyId)
            .eq('user_id', user.id);
        } catch (err) {
          console.error('Portfolio analysis error:', err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Portfolio analyze error:', err);
    return NextResponse.json({ error: 'Failed to generate portfolio summary' }, { status: 500 });
  }
}
