import { getGroqClient, DEFAULT_MODEL, buildFinancialContext } from './base';
import type { FinancialStatement, RatioReport, Anomaly, TrendReport } from '../models/statement';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type IntentType = 'ratio' | 'month' | 'anomaly' | 'trend' | 'cashflow' | 'general';

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  ratio: ['vacancy', 'noi margin', 'oer', 'dscr', 'ratio', 'benchmark', 'operating expense ratio',
    'concession', 'bad debt', 'payroll percent', 'management fee', 'break-even', 'cash flow margin'],
  month: ['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  anomaly: ['spike', 'anomal', 'unusual', 'flag', 'issue', 'problem', 'concern', 'warning', 'alert', 'weird'],
  trend: ['trend', 'improv', 'worsen', 'over time', 'month over month', 'mom', 'growing', 'declining'],
  cashflow: ['cash flow', 'why is cash', 'cash vs', 'net cash', 'cash from operations'],
  general: [],
};

function detectIntent(question: string): IntentType {
  const lower = question.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [IntentType, string[]][]) {
    if (intent === 'general') continue;
    if (keywords.some(k => lower.includes(k))) return intent;
  }
  return 'general';
}

function buildGroundingBlock(
  intent: IntentType,
  question: string,
  statement: FinancialStatement,
  ratios: RatioReport,
  anomalies: Anomaly[],
  trends: TrendReport,
): string {
  const lines: string[] = ['GROUNDING DATA:'];

  if (intent === 'ratio') {
    lines.push('--- RATIOS ---');
    const ratioList = [
      ratios.oer, ratios.noiMargin, ratios.vacancyRate, ratios.concessionRate,
      ratios.badDebtRate, ratios.payrollPct, ratios.mgmtFeePct, ratios.controllablePct,
      ratios.breakEvenOccupancy, ratios.cashFlowMargin, ratios.dscr,
    ];
    for (const r of ratioList) {
      const val = r.value !== null
        ? r.unit === '%' ? `${r.value.toFixed(1)}%` : r.unit === 'x' ? `${r.value.toFixed(2)}x` : `$${r.value.toFixed(0)}`
        : 'N/A';
      lines.push(`${r.label}: ${val} [${r.status}] benchmark: ${r.benchmark}`);
    }
  } else if (intent === 'month') {
    lines.push('--- MONTHLY KEY FIGURES ---');
    const keyRows = ['total_revenue', 'total_operating_expenses', 'noi', 'cash_flow'];
    for (const key of keyRows) {
      const row = statement.keyFigures[key];
      if (!row) continue;
      lines.push(`${row.label}:`);
      for (const month of statement.months) {
        const val = row.montlyValues[month];
        lines.push(`  ${month}: ${val !== null ? '$' + val.toFixed(0) : 'N/A'}`);
      }
    }
  } else if (intent === 'anomaly') {
    lines.push('--- ANOMALIES ---');
    for (const a of anomalies.slice(0, 15)) {
      lines.push(`[${a.severity.toUpperCase()}] ${a.label} (${a.cellRef}): ${a.description}`);
    }
  } else if (intent === 'trend') {
    lines.push('--- TRENDS ---');
    for (const series of trends.series) {
      const pct = series.overallPctChange !== null ? `${series.overallPctChange.toFixed(1)}%` : 'N/A';
      lines.push(`${series.label}: ${series.trendDirection}, overall change: ${pct}, avg: ${series.avgValue !== null ? '$' + series.avgValue.toFixed(0) : 'N/A'}`);
      if (series.peakMonth) lines.push(`  Peak: ${series.peakMonth}`);
      if (series.troughMonth) lines.push(`  Trough: ${series.troughMonth}`);
    }
  } else if (intent === 'cashflow') {
    lines.push('--- CASH FLOW vs NET INCOME ---');
    const cfRow = statement.keyFigures['cash_flow'];
    const niRow = statement.keyFigures['net_income'];
    const noiRow = statement.keyFigures['noi'];
    const finRow = statement.keyFigures['financial_expense'];
    const replRow = statement.keyFigures['replacement_expense'];

    if (cfRow) lines.push(`Cash Flow (annual): $${cfRow.annualTotal?.toFixed(0) ?? 'N/A'}`);
    if (niRow) lines.push(`Net Income (annual): $${niRow.annualTotal?.toFixed(0) ?? 'N/A'}`);
    if (noiRow) lines.push(`NOI (annual): $${noiRow.annualTotal?.toFixed(0) ?? 'N/A'}`);
    if (finRow) lines.push(`Financial Expense: $${finRow.annualTotal?.toFixed(0) ?? 'N/A'}`);
    if (replRow) lines.push(`Replacement Reserve: $${replRow.annualTotal?.toFixed(0) ?? 'N/A'}`);

    const cfAnomalies = anomalies.filter(a => a.type === 'cashflow_vs_netincome');
    if (cfAnomalies.length > 0) {
      lines.push('Related anomalies:');
      for (const a of cfAnomalies) lines.push(`  - ${a.description}`);
    }
  } else {
    // General: include summary stats
    lines.push('--- SUMMARY ---');
    const summaryKeys = ['total_revenue', 'total_operating_expenses', 'noi', 'net_income', 'cash_flow'];
    for (const key of summaryKeys) {
      const row = statement.keyFigures[key];
      if (row) lines.push(`${row.label}: $${row.annualTotal?.toFixed(0) ?? 'N/A'} (annual)`);
    }
  }

  lines.push('');
  lines.push(`Question: ${question}`);
  return lines.join('\n');
}

export class ChatAgent {
  private context = '';
  private statement: FinancialStatement | null = null;
  private ratios: RatioReport | null = null;
  private anomalies: Anomaly[] = [];
  private trends: TrendReport | null = null;

  setContext(
    statement: FinancialStatement,
    ratios: RatioReport,
    anomalies: Anomaly[],
    trends: TrendReport,
  ): void {
    this.statement = statement;
    this.ratios = ratios;
    this.anomalies = anomalies;
    this.trends = trends;
    this.context = buildFinancialContext(statement, ratios, anomalies, trends);
  }

  async *ask(question: string, history: ChatMessage[]): AsyncIterable<string> {
    if (!this.statement || !this.ratios || !this.trends) {
      yield 'No financial data loaded. Please upload and analyze a file first.';
      return;
    }

    const groq = getGroqClient();
    const intent = detectIntent(question);
    const groundingBlock = buildGroundingBlock(
      intent,
      question,
      this.statement,
      this.ratios,
      this.anomalies,
      this.trends,
    );

    // Keep last 8 turns
    const recentHistory = history.slice(-8);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `You are a financial analyst assistant specializing in multifamily real estate P&L analysis.
You have access to the financial data below. Answer questions accurately based on this data.
Be concise, specific, and actionable. Use dollar amounts and percentages where relevant.

${this.context}`,
      },
    ];

    // Add conversation history
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add grounded question as user message
    messages.push({ role: 'user', content: groundingBlock });

    const stream = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      stream: true,
      messages,
      max_tokens: 512,
      temperature: 0.2,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) yield text;
    }
  }
}
