import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { VizAgent } from '@/lib/agents/viz-agent';
import type { FinancialStatement } from '@/lib/models/statement';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { request: chartRequest, statement } = await request.json() as {
      request: string;
      statement: FinancialStatement;
    };

    const agent = new VizAgent();
    const result = await agent.generate(chartRequest, statement);

    return NextResponse.json(result);
  } catch (err) {
    console.error('Chart generation error:', err);
    return NextResponse.json({ error: 'Failed to generate chart' }, { status: 500 });
  }
}
