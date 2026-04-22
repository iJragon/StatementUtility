import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { DealInputs } from '@/lib/models/deal';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/deals/[id] - fetch a single deal with full analysis
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    deal: {
      id: data.id,
      name: data.name,
      address: data.address,
      status: data.status,
      inputs: data.inputs,
      analysis: data.analysis,
      aiNarrative: data.ai_narrative,
      aiAnalyzedAt: data.ai_analyzed_at,
      propertyId: data.property_id,
      notes: data.notes ?? '',
      createdAt: data.created_at,
      dealScore: data.analysis?.score?.total ?? null,
    },
  });
}

// PATCH /api/deals/[id] - update inputs, name, status, or address
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as {
    name?: string;
    address?: string;
    status?: string;
    inputs?: DealInputs;
    notes?: string;
    propertyId?: string | null;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.address !== undefined) patch.address = body.address.trim() || null;
  if (body.status !== undefined) patch.status = body.status;
  if (body.inputs !== undefined) patch.inputs = body.inputs;
  if (body.notes !== undefined) patch.notes = body.notes;
  if ('propertyId' in body) patch.property_id = body.propertyId ?? null;

  const { data, error } = await supabase
    .from('deals')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, address, status, updated_at')
    .single();

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  return NextResponse.json({ deal: data });
}

// DELETE /api/deals/[id] - remove a deal
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('deals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
