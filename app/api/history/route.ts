import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('analyses')
    .select('id, file_name, property_name, period, analyzed_at')
    .eq('user_id', user.id)
    .order('analyzed_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const history = (data ?? []).map(a => ({
    id: a.id,
    fileName: a.file_name,
    propertyName: a.property_name ?? 'Unknown',
    period: a.period ?? '',
    analyzedAt: a.analyzed_at,
  }));

  return NextResponse.json(history);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const all = searchParams.get('all') === 'true';

  if (!id && !all) {
    return NextResponse.json({ error: 'Missing id or all parameter' }, { status: 400 });
  }

  const query = supabase.from('analyses').delete().eq('user_id', user.id);
  const { error } = all ? await query : await query.eq('id', id!);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
