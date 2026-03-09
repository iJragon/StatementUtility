import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractKeyFiguresWithAI } from '@/lib/parser/ai-extractor';
import { calculateRatios } from '@/lib/analysis/ratio-calculator';
import { detectAnomalies } from '@/lib/analysis/anomaly-detector';
import { analyzeTrends } from '@/lib/analysis/trend-analyzer';
import type { AnalysisResult, FinancialStatement } from '@/lib/models/statement';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { fileHash } = await request.json() as { fileHash: string };

    const { data: existing, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', user.id)
      .eq('file_hash', fileHash)
      .single();

    if (error || !existing) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const storedStatement: FinancialStatement = existing.statement_data;

    // Re-run AI extraction using stored allRows (no original file needed)
    const headerText = storedStatement.propertyName + ' ' + storedStatement.period;
    const extracted = await extractKeyFiguresWithAI(storedStatement.allRows, headerText);

    const statement: FinancialStatement = {
      ...storedStatement,
      keyFigures: extracted.keyFigures,
      parserReport: extracted.parserReport,
      propertyName: extracted.propertyName || storedStatement.propertyName,
      period: extracted.period || storedStatement.period,
      bookType: extracted.bookType || storedStatement.bookType,
    };

    const ratios = calculateRatios(statement);
    const anomalies = detectAnomalies(statement);
    const trends = analyzeTrends(statement);
    const analyzedAt = new Date().toISOString();

    await supabase.from('analyses').update({
      statement_data: statement,
      ratios_data: ratios,
      anomalies_data: anomalies,
      trends_data: trends,
      analyzed_at: analyzedAt,
      summary_text: null,
    })
      .eq('user_id', user.id)
      .eq('file_hash', fileHash);

    const result: AnalysisResult = {
      statement,
      ratios,
      anomalies,
      trends,
      fileName: existing.file_name,
      fileHash,
      analyzedAt,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('Reprocess error:', err);
    return NextResponse.json({ error: 'Reprocess failed' }, { status: 500 });
  }
}
