import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AnalysisResult } from '@/lib/models/statement';
import { migrateStatement } from '@/lib/models/statement';
import type { PropertyStatement } from '@/lib/models/portfolio';

// POST /api/properties/[id]/statements - add one or more statements to a property
// Returns full analysis data for each added statement so the client can update
// incrementally without reloading the entire property (O(K) vs O(N)).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: propertyId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prop } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('user_id', user.id)
    .single();
  if (!prop) return NextResponse.json({ error: 'Property not found' }, { status: 404 });

  const body = await request.json() as
    | { fileHash: string; yearLabel?: string }
    | { statements: Array<{ fileHash: string; yearLabel?: string }> };

  const items = 'statements' in body ? body.statements : [body];
  const errors: string[] = [];

  interface AddedStatement {
    stmt: PropertyStatement;
    analysis: AnalysisResult;
  }
  const added: AddedStatement[] = [];

  for (const item of items) {
    const { data: analysis } = await supabase
      .from('analyses')
      .select('id, file_hash, file_name, property_name, period, statement_data, ratios_data, anomalies_data, trends_data, analyzed_at')
      .eq('file_hash', item.fileHash)
      .eq('user_id', user.id)
      .single();

    if (!analysis) {
      errors.push(`Analysis not found for hash ${item.fileHash}`);
      continue;
    }

    const { data: linkData, error } = await supabase
      .from('property_statements')
      .insert({
        property_id: propertyId,
        analysis_id: analysis.id,
        year_label: item.yearLabel?.trim() || analysis.period || '',
      })
      .select('id, analysis_id, year_label, added_at')
      .single();

    if (error) {
      errors.push(error.code === '23505' ? 'Already linked' : error.message);
    } else {
      added.push({
        stmt: {
          id: linkData.id,
          analysisId: analysis.id,
          fileHash: analysis.file_hash,
          fileName: analysis.file_name,
          propertyName: analysis.property_name ?? '',
          period: analysis.period ?? '',
          yearLabel: linkData.year_label || analysis.period || '',
          addedAt: linkData.added_at,
        },
        analysis: {
          statement: migrateStatement(analysis.statement_data),
          ratios: analysis.ratios_data,
          anomalies: analysis.anomalies_data,
          trends: analysis.trends_data,
          fileName: analysis.file_name,
          fileHash: analysis.file_hash,
          analyzedAt: analysis.analyzed_at,
        },
      });
    }
  }

  if (added.length === 0 && errors.length > 0) {
    return NextResponse.json({ error: errors[0] }, { status: 409 });
  }

  return NextResponse.json({ added, errors });
}
