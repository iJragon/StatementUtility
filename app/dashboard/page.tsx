import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardClient from './DashboardClient';

export interface HistoryEntry {
  id: string;
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
    .select('id, file_name, property_name, period, analyzed_at')
    .eq('user_id', user.id)
    .order('analyzed_at', { ascending: false })
    .limit(20);

  const history: HistoryEntry[] = (analyses ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    propertyName: a.property_name ?? 'Unknown',
    period: a.period ?? '',
    analyzedAt: a.analyzed_at,
  }));

  return (
    <DashboardClient
      userEmail={user.email ?? ''}
      initialHistory={history}
    />
  );
}
