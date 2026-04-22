import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGroqClient, DEFAULT_MODEL } from '@/lib/agents/base';
import type { DealInputs } from '@/lib/models/deal';
import type { LineItem } from '@/lib/models/statement';

// POST /api/deals/t12-import
// Accepts any analyzed statement and uses AI to extract deal inputs —
// does NOT depend on specific keyFigure keys or sheet layout.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { analysisId } = await req.json() as { analysisId: string };
  if (!analysisId) return NextResponse.json({ error: 'analysisId required' }, { status: 400 });

  // Fetch the full analysis from history
  const { data, error } = await supabase
    .from('analyses')
    .select('statement')
    .eq('id', analysisId)
    .eq('user_id', user.id)
    .maybeSingle();

  // Some projects use file_hash as PK; try both
  let statement = data?.statement;
  if (!statement) {
    const { data: data2 } = await supabase
      .from('analyses')
      .select('statement')
      .eq('file_hash', analysisId)
      .eq('user_id', user.id)
      .maybeSingle();
    statement = data2?.statement;
  }

  if (error || !statement) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  // Build a compact text representation of ALL rows for the AI
  // We include: label, annual total, and whether it's a header/subtotal
  // This way the AI can identify any row regardless of how the source was formatted.
  const rows: LineItem[] = statement.allRows ?? [];

  const rowLines = rows
    .filter((r: LineItem) => r.annualTotal !== null && !r.isHeader)
    .map((r: LineItem) => {
      const flag = r.isSubtotal ? ' [subtotal]' : '';
      return `  "${r.label}"${flag}: $${(r.annualTotal ?? 0).toLocaleString()}`;
    })
    .join('\n');

  // Also include keyFigures if present, as a hint (but not a requirement)
  const kfLines = Object.entries(statement.keyFigures ?? {})
    .filter(([, v]) => (v as LineItem).annualTotal !== null)
    .map(([k, v]) => `  ${k}: $${((v as LineItem).annualTotal ?? 0).toLocaleString()} ("${(v as LineItem).label}")`)
    .join('\n');

  const prompt = `You are a real estate financial analyst. Below is a property operating statement with all line items and their annual totals.

Your task: extract the figures needed to underwrite this deal as a purchase. Return ONLY valid JSON — no explanation, no markdown.

STATEMENT LINE ITEMS:
${rowLines || '(none)'}

SEMANTIC KEY FIGURES (AI-extracted hints, may be empty or wrong):
${kfLines || '(none)'}

Return this exact JSON shape (all values in whole dollars per year, 0 if not found):
{
  "grossScheduledIncome": <number>,
  "otherIncome": <number>,
  "expenses": {
    "propertyTaxes": <number>,
    "insurance": <number>,
    "utilities": <number>,
    "maintenance": <number>,
    "managementFee": <number>,
    "landscaping": <number>,
    "janitorial": <number>,
    "marketing": <number>,
    "administrative": <number>,
    "payroll": <number>,
    "reserves": <number>,
    "miscellaneous": <number>
  },
  "notes": "<brief explanation of what you mapped and any caveats, max 2 sentences>"
}

Rules:
- grossScheduledIncome = maximum possible rental income (100% occupied, no vacancy)
- otherIncome = laundry, parking, fees, etc. — NOT rent
- Do NOT include vacancy loss in any expense; leave it for the user's vacancy rate assumption
- For expense categories, sum all relevant sub-lines into the best-fit category
- If a figure genuinely cannot be found, use 0
- Return ONLY the JSON object`;

  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 800,
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';

  // Strip any accidental markdown fences
  const jsonStr = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  let extracted: {
    grossScheduledIncome: number;
    otherIncome: number;
    expenses: DealInputs['expenses'];
    notes: string;
  };

  try {
    extracted = JSON.parse(jsonStr);
  } catch {
    return NextResponse.json({ error: 'AI extraction failed — could not parse response', raw }, { status: 422 });
  }

  return NextResponse.json({
    inputs: {
      grossScheduledIncome: extracted.grossScheduledIncome ?? 0,
      otherIncome: extracted.otherIncome ?? 0,
      expenses: {
        propertyTaxes:  extracted.expenses?.propertyTaxes  ?? 0,
        insurance:      extracted.expenses?.insurance      ?? 0,
        utilities:      extracted.expenses?.utilities      ?? 0,
        maintenance:    extracted.expenses?.maintenance    ?? 0,
        managementFee:  extracted.expenses?.managementFee  ?? 0,
        landscaping:    extracted.expenses?.landscaping    ?? 0,
        janitorial:     extracted.expenses?.janitorial     ?? 0,
        marketing:      extracted.expenses?.marketing      ?? 0,
        administrative: extracted.expenses?.administrative ?? 0,
        payroll:        extracted.expenses?.payroll        ?? 0,
        reserves:       extracted.expenses?.reserves       ?? 0,
        miscellaneous:  extracted.expenses?.miscellaneous  ?? 0,
      },
    } satisfies Partial<DealInputs>,
    importNotes: extracted.notes ?? '',
  });
}
