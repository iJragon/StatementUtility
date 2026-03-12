import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AnalysisResult } from '@/lib/models/statement';
import type { PropertyDetail, PropertyStatement } from '@/lib/models/portfolio';

// GET /api/properties/[id] — returns property detail with statements and analyses
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch property
  const { data: prop, error: propError } = await supabase
    .from('properties')
    .select('id, name, address, portfolio_summary, portfolio_analyzed_at, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (propError || !prop) return NextResponse.json({ error: 'Property not found' }, { status: 404 });

  // Fetch associated statements (joined with analyses)
  const { data: stmts, error: stmtError } = await supabase
    .from('property_statements')
    .select(`
      id,
      analysis_id,
      year_label,
      added_at,
      analyses(
        id,
        file_hash,
        file_name,
        property_name,
        period,
        statement_data,
        ratios_data,
        anomalies_data,
        trends_data,
        summary_text,
        chat_history,
        analyzed_at
      )
    `)
    .eq('property_id', id)
    .order('year_label', { ascending: true });

  if (stmtError) return NextResponse.json({ error: stmtError.message }, { status: 500 });

  const statements: PropertyStatement[] = [];
  const analyses: AnalysisResult[] = [];

  for (const s of stmts ?? []) {
    // Supabase returns joined data as unknown type, so we cast
    const a = (s.analyses as unknown) as {
      id: string;
      file_hash: string;
      file_name: string;
      property_name: string;
      period: string;
      statement_data: AnalysisResult['statement'];
      ratios_data: AnalysisResult['ratios'];
      anomalies_data: AnalysisResult['anomalies'];
      trends_data: AnalysisResult['trends'];
      summary_text: string | null;
      chat_history: AnalysisResult['chatHistory'];
      analyzed_at: string;
    } | null;

    if (!a) continue;

    statements.push({
      id: s.id,
      analysisId: a.id,
      fileHash: a.file_hash,
      fileName: a.file_name,
      propertyName: a.property_name ?? '',
      period: a.period ?? '',
      yearLabel: s.year_label || a.period || '',
      addedAt: s.added_at,
    });

    analyses.push({
      statement: a.statement_data,
      ratios: a.ratios_data,
      anomalies: a.anomalies_data,
      trends: a.trends_data,
      summaryText: a.summary_text ?? undefined,
      chatHistory: a.chat_history ?? [],
      fileName: a.file_name,
      fileHash: a.file_hash,
      analyzedAt: a.analyzed_at,
    });
  }

  const detail: PropertyDetail = {
    id: prop.id,
    name: prop.name,
    address: prop.address ?? undefined,
    portfolioSummary: prop.portfolio_summary ?? undefined,
    portfolioAnalyzedAt: prop.portfolio_analyzed_at ?? undefined,
    createdAt: prop.created_at,
    statements,
  };

  return NextResponse.json({ property: detail, analyses });
}

// DELETE /api/properties/[id] — deletes a property
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('properties')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// PATCH /api/properties/[id] — update portfolio_summary
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { portfolioSummary?: string; name?: string };
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.portfolioSummary !== undefined) {
    updates.portfolio_summary = body.portfolioSummary;
    updates.portfolio_analyzed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('properties')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
