import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InvestorProfile } from '@/lib/models/deal';

// GET /api/investor-profile
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('investor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ profile: null });
  }

  const profile: InvestorProfile = {
    taxBracket: data.tax_bracket,
    targetCashOnCash: data.target_cash_on_cash,
    targetIRR: data.target_irr,
    riskTolerance: data.risk_tolerance,
    holdPeriod: data.hold_period,
  };

  return NextResponse.json({ profile });
}

// PATCH /api/investor-profile - upsert investor profile
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as Partial<InvestorProfile>;

  const row: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (body.taxBracket !== undefined) row.tax_bracket = body.taxBracket;
  if (body.targetCashOnCash !== undefined) row.target_cash_on_cash = body.targetCashOnCash;
  if (body.targetIRR !== undefined) row.target_irr = body.targetIRR;
  if (body.riskTolerance !== undefined) row.risk_tolerance = body.riskTolerance;
  if (body.holdPeriod !== undefined) row.hold_period = body.holdPeriod;

  const { data, error } = await supabase
    .from('investor_profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  return NextResponse.json({
    profile: {
      taxBracket: data.tax_bracket,
      targetCashOnCash: data.target_cash_on_cash,
      targetIRR: data.target_irr,
      riskTolerance: data.risk_tolerance,
      holdPeriod: data.hold_period,
    },
  });
}
