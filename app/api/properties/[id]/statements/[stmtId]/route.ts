import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// DELETE /api/properties/[id]/statements/[stmtId] - remove a statement link
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stmtId: string }> },
) {
  const { id: propertyId, stmtId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the property_statement belongs to the user via the property
  const { error } = await supabase
    .from('property_statements')
    .delete()
    .eq('id', stmtId)
    .eq('property_id', propertyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// PATCH /api/properties/[id]/statements/[stmtId] - update year_label
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stmtId: string }> },
) {
  const { id: propertyId, stmtId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { yearLabel } = await request.json() as { yearLabel: string };

  const { error } = await supabase
    .from('property_statements')
    .update({ year_label: yearLabel })
    .eq('id', stmtId)
    .eq('property_id', propertyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
