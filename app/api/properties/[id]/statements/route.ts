import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/properties/[id]/statements — add one or more statements to a property
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: propertyId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify property belongs to user
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
  const added: unknown[] = [];

  for (const item of items) {
    // Look up by file_hash (works for both fresh analyses and history-loaded entries)
    const { data: analysis } = await supabase
      .from('analyses')
      .select('id, period')
      .eq('file_hash', item.fileHash)
      .eq('user_id', user.id)
      .single();

    if (!analysis) {
      errors.push(`Analysis not found for hash ${item.fileHash}`);
      continue;
    }

    const { data, error } = await supabase
      .from('property_statements')
      .insert({
        property_id: propertyId,
        analysis_id: analysis.id,
        year_label: item.yearLabel?.trim() || analysis.period || '',
      })
      .select('id, analysis_id, year_label, added_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        errors.push('Already linked');
      } else {
        errors.push(error.message);
      }
    } else {
      added.push(data);
    }
  }

  if (added.length === 0 && errors.length > 0) {
    return NextResponse.json({ error: errors[0] }, { status: 409 });
  }

  return NextResponse.json({ added, errors });
}
