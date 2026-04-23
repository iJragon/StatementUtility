import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildProForma, calculateMetrics, buildSensitivityMatrix, runMonteCarlo } from '@/lib/analysis/deal-engine';
import { scoreDeal } from '@/lib/analysis/deal-score';
import { streamDealNarrative } from '@/lib/agents/deal-agent';
import { DEFAULT_INVESTOR_PROFILE } from '@/lib/models/deal';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/deals/[id]/analyze
// Runs full analysis + streams AI narrative back as SSE
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Load deal + investor profile in parallel
  const [dealResult, profileResult] = await Promise.all([
    supabase
      .from('deals')
      .select('inputs')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('investor_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (dealResult.error || !dealResult.data) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }
  if (!dealResult.data.inputs) {
    return NextResponse.json({ error: 'Deal has no inputs to analyze' }, { status: 400 });
  }

  const inputs = dealResult.data.inputs;
  const profile = profileResult.data
    ? {
        taxBracket: profileResult.data.tax_bracket,
        targetCashOnCash: profileResult.data.target_cash_on_cash,
        targetIRR: profileResult.data.target_irr,
        riskTolerance: profileResult.data.risk_tolerance,
        holdPeriod: profileResult.data.hold_period,
      }
    : DEFAULT_INVESTOR_PROFILE;

  // Run all financial calculations synchronously
  const proForma = buildProForma(inputs);
  const metrics = calculateMetrics(inputs, proForma, profile);
  const sensitivity = buildSensitivityMatrix(inputs, profile);
  const score = scoreDeal(metrics, profile);
  const monteCarlo = runMonteCarlo(inputs, profile, 1000);

  const analysis = { metrics, proForma, sensitivity, score, monteCarlo };

  // Persist computed analysis + the profile snapshot used for scoring
  await supabase
    .from('deals')
    .update({
      analysis,
      status: 'analyzed',
      profile_snapshot: profile,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);

  // Stream AI narrative as SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      // Send pre-computed metrics so client can update immediately
      send('analysis', JSON.stringify(analysis));

      let narrative = '';
      try {
        narrative = await streamDealNarrative(
          inputs,
          metrics,
          score,
          proForma,
          (chunk) => send('chunk', JSON.stringify({ text: chunk })),
        );
      } catch {
        send('error', JSON.stringify({ message: 'AI narrative generation failed' }));
      }

      if (narrative) {
        await supabase
          .from('deals')
          .update({
            ai_narrative: narrative,
            ai_analyzed_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('user_id', user.id);
      }

      send('done', JSON.stringify({ narrativeLength: narrative.length }));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
