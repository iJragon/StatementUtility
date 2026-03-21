import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/properties - list all properties for the current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('properties')
    .select('id, name, address, created_at, property_statements(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const properties = (data ?? []).map((p: {
    id: string;
    name: string;
    address?: string;
    created_at: string;
    property_statements: { count: number }[];
  }) => ({
    id: p.id,
    name: p.name,
    address: p.address,
    createdAt: p.created_at,
    statementCount: p.property_statements?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ properties });
}

// POST /api/properties - create a new property
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, address } = await request.json() as { name: string; address?: string };
  if (!name?.trim()) return NextResponse.json({ error: 'Property name is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('properties')
    .insert({ user_id: user.id, name: name.trim(), address: address?.trim() || null })
    .select('id, name, address, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    property: {
      id: data.id,
      name: data.name,
      address: data.address,
      createdAt: data.created_at,
      statementCount: 0,
    },
  });
}
