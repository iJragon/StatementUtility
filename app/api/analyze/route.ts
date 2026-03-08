import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseExcel } from '@/lib/parser/excel-parser';
import { calculateRatios } from '@/lib/analysis/ratio-calculator';
import { detectAnomalies } from '@/lib/analysis/anomaly-detector';
import { analyzeTrends } from '@/lib/analysis/trend-analyzer';
import type { AnalysisResult } from '@/lib/models/statement';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compute MD5 hash
    const fileHash = crypto.createHash('md5').update(buffer).digest('hex');

    // Check if analysis already exists
    const { data: existing } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', user.id)
      .eq('file_hash', fileHash)
      .single();

    if (existing) {
      const result: AnalysisResult = {
        statement: existing.statement_data,
        ratios: existing.ratios_data,
        anomalies: existing.anomalies_data,
        trends: existing.trends_data,
        summaryText: existing.summary_text,
        chatHistory: existing.chat_history,
        fileName: existing.file_name,
        fileHash,
        analyzedAt: existing.analyzed_at,
      };
      return NextResponse.json(result);
    }

    // Parse and analyze
    const statement = await parseExcel(buffer);
    const ratios = calculateRatios(statement);
    const anomalies = detectAnomalies(statement);
    const trends = analyzeTrends(statement);
    const analyzedAt = new Date().toISOString();

    // Save to Supabase
    const { error: insertError } = await supabase.from('analyses').upsert({
      user_id: user.id,
      file_hash: fileHash,
      file_name: file.name,
      property_name: statement.propertyName,
      period: statement.period,
      analyzed_at: analyzedAt,
      statement_data: statement,
      ratios_data: ratios,
      anomalies_data: anomalies,
      trends_data: trends,
      summary_text: null,
      chat_history: [],
    }, { onConflict: 'user_id,file_hash' });

    if (insertError) {
      console.error('Supabase insert error:', insertError);
    }

    const result: AnalysisResult = {
      statement,
      ratios,
      anomalies,
      trends,
      fileName: file.name,
      fileHash,
      analyzedAt,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('Analysis error:', err);
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
