import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardClient from './DashboardClient';
import type { PropertyEntry } from '@/lib/models/portfolio';

export interface HistoryEntry {
  id: string;       // analyses.id (UUID)
  fileHash: string; // analyses.file_hash
  fileName: string;
  propertyName: string;
  period: string;
  analyzedAt: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: analyses } = await supabase
    .from('analyses')
    .select('id, file_hash, file_name, property_name, period, analyzed_at')
    .eq('user_id', user.id)
    .order('analyzed_at', { ascending: false })
    .limit(20);

  const history: HistoryEntry[] = (analyses ?? []).map((a) => ({
    id: a.id,
    fileHash: a.file_hash,
    fileName: a.file_name,
    propertyName: a.property_name ?? 'Unknown',
    period: a.period ?? '',
    analyzedAt: a.analyzed_at,
  }));

  const { data: propsData } = await supabase
    .from('properties')
    .select('id, name, address, created_at, property_statements(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const initialProperties: PropertyEntry[] = (propsData ?? []).map((p: {
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

  return (
    <DashboardClient
      userEmail={user.email ?? ''}
      initialHistory={history}
      initialProperties={initialProperties}
    />
  );
}
