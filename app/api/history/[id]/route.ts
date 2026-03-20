import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AnalysisResult } from '@/lib/models/statement';
import { migrateStatement } from '@/lib/models/statement';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  const result: AnalysisResult = {
    statement: migrateStatement(data.statement_data),
    ratios: data.ratios_data,
    anomalies: data.anomalies_data,
    trends: data.trends_data,
    summaryText: data.summary_text,
    chatHistory: data.chat_history,
    fileName: data.file_name,
    fileHash: data.file_hash,
    analyzedAt: data.analyzed_at,
  };

  return NextResponse.json(result);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { propertyName } = await request.json() as { propertyName: string };

  const { error } = await supabase
    .from('analyses')
    .update({ property_name: propertyName })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
