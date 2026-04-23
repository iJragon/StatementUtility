import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGroqClient, DEFAULT_MODEL } from '@/lib/agents/base';
import type { DealInputs } from '@/lib/models/deal';
import { DEFAULT_DEAL_INPUTS } from '@/lib/models/deal';
import * as XLSX from 'xlsx';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default ?? (pdfParseModule as unknown as (buf: Buffer) => Promise<{ text: string }>);

// POST /api/deals/file-import
// Accepts Excel, CSV, or PDF (OMs, pro formas, rent rolls) and uses AI to extract
// deal underwriting inputs. Any field the AI cannot confidently extract is omitted.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const fileName = file instanceof File ? file.name.toLowerCase() : '';
  const isPdf = fileName.endsWith('.pdf') || file.type === 'application/pdf';

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows: string[] = [];

  if (isPdf) {
    try {
      const data = await pdfParse(buffer);
      const text = data.text ?? '';
      if (!text.trim()) {
        return NextResponse.json(
          { error: 'Could not extract text from this PDF. It may be a scanned image — try a text-based PDF.' },
          { status: 422 },
        );
      }
      // Split into non-empty lines, cap at 400 lines to stay within token budget
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
      rows.push(...lines.slice(0, 400));
    } catch {
      return NextResponse.json(
        { error: 'Could not parse the PDF. Please try a different file.' },
        { status: 422 },
      );
    }
  } else {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
        for (const row of data) {
          if (!Array.isArray(row)) continue;
          const cells = row.map(c => String(c ?? '').trim()).filter(Boolean);
          if (cells.length > 0) rows.push(cells.join(' | '));
        }
      }
    } catch {
      return NextResponse.json(
        { error: 'Could not parse file. Please upload an Excel (.xlsx, .xls), CSV, or PDF file.' },
        { status: 422 },
      );
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 422 });
  }

  const prompt = `You are a real estate financial analyst. Below is text extracted from a ${isPdf ? 'PDF offering memorandum, pro forma, or deal document' : 'spreadsheet'} that may contain deal assumptions, acquisition details, a rent roll, pro forma projections, or any other property-related data.

Extract deal underwriting inputs. Return ONLY valid JSON — no explanation, no markdown.

DOCUMENT TEXT:
${rows.join('\n')}

Return this exact JSON shape (rates as decimals, dollar amounts as annual figures):
{
  "purchasePrice": <number or null>,
  "downPayment": <dollar amount or null>,
  "downPaymentPct": <decimal or null — only if given as a %, e.g. 0.25>,
  "interestRate": <decimal or null, e.g. 0.07 for 7%>,
  "amortizationYears": <integer or null>,
  "loanTermYears": <integer or null>,
  "closingCostRate": <decimal or null>,
  "capexBudget": <dollar amount or null>,
  "grossScheduledIncome": <annual dollars or null>,
  "otherIncome": <annual dollars or null>,
  "expenses": {
    "propertyTaxes": <annual dollars or null>,
    "insurance": <annual dollars or null>,
    "utilities": <annual dollars or null>,
    "maintenance": <annual dollars or null>,
    "managementFee": <annual dollars or null>,
    "landscaping": <annual dollars or null>,
    "janitorial": <annual dollars or null>,
    "marketing": <annual dollars or null>,
    "administrative": <annual dollars or null>,
    "payroll": <annual dollars or null>,
    "reserves": <annual dollars or null>,
    "miscellaneous": <annual dollars or null>
  },
  "vacancyRate": <decimal or null>,
  "rentGrowthRate": <decimal or null>,
  "expenseGrowthRate": <decimal or null>,
  "exitCapRate": <decimal or null>,
  "holdPeriod": <integer years or null>,
  "propertyType": <"residential"|"commercial"|"mixed" or null>,
  "notes": "<what you found and any caveats, max 2 sentences>"
}

Rules:
- Use null for any field you cannot confidently extract — do NOT guess
- purchasePrice is the asking/offer/acquisition price
- If income or expenses are shown monthly, multiply by 12 to get annual
- grossScheduledIncome = potential rent at 100% occupancy (no vacancy deducted)
- managementFee as an annual dollar amount (convert from % of income if needed)
- If a percentage down payment is given (not a dollar amount), use downPaymentPct and null for downPayment
- Return ONLY the JSON object`;

  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1000,
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';
  const jsonStr = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  type Extracted = {
    purchasePrice: number | null;
    downPayment: number | null;
    downPaymentPct: number | null;
    interestRate: number | null;
    amortizationYears: number | null;
    loanTermYears: number | null;
    closingCostRate: number | null;
    capexBudget: number | null;
    grossScheduledIncome: number | null;
    otherIncome: number | null;
    expenses: Record<string, number | null>;
    vacancyRate: number | null;
    rentGrowthRate: number | null;
    expenseGrowthRate: number | null;
    exitCapRate: number | null;
    holdPeriod: number | null;
    propertyType: 'residential' | 'commercial' | 'mixed' | null;
    notes: string;
  };

  let extracted: Extracted;
  try {
    extracted = JSON.parse(jsonStr) as Extracted;
  } catch {
    return NextResponse.json(
      { error: 'AI extraction failed — could not parse response', raw },
      { status: 422 },
    );
  }

  // Resolve downPayment: dollar amount preferred; fall back to pct × price
  let downPayment = extracted.downPayment;
  if ((downPayment == null || downPayment === 0) && extracted.downPaymentPct != null && extracted.purchasePrice != null) {
    downPayment = extracted.purchasePrice * extracted.downPaymentPct;
  }

  // Only include fields the AI actually extracted — let callers merge with defaults
  const inputs: Partial<DealInputs> = {};
  if (extracted.purchasePrice != null)       inputs.purchasePrice        = extracted.purchasePrice;
  if (downPayment != null && downPayment > 0) inputs.downPayment          = downPayment;
  if (extracted.interestRate != null)         inputs.interestRate         = extracted.interestRate;
  if (extracted.amortizationYears != null)    inputs.amortizationYears    = extracted.amortizationYears;
  if (extracted.loanTermYears != null)        inputs.loanTermYears        = extracted.loanTermYears;
  if (extracted.closingCostRate != null)      inputs.closingCostRate      = extracted.closingCostRate;
  if (extracted.capexBudget != null)          inputs.capexBudget          = extracted.capexBudget;
  if (extracted.grossScheduledIncome != null) inputs.grossScheduledIncome = extracted.grossScheduledIncome;
  if (extracted.otherIncome != null)          inputs.otherIncome          = extracted.otherIncome;
  if (extracted.vacancyRate != null)          inputs.vacancyRate          = extracted.vacancyRate;
  if (extracted.rentGrowthRate != null)       inputs.rentGrowthRate       = extracted.rentGrowthRate;
  if (extracted.expenseGrowthRate != null)    inputs.expenseGrowthRate    = extracted.expenseGrowthRate;
  if (extracted.exitCapRate != null)          inputs.exitCapRate          = extracted.exitCapRate;
  if (extracted.holdPeriod != null)           inputs.holdPeriod           = extracted.holdPeriod;
  if (extracted.propertyType != null)         inputs.propertyType         = extracted.propertyType;

  const expenseKeys = Object.keys(DEFAULT_DEAL_INPUTS.expenses) as Array<keyof typeof DEFAULT_DEAL_INPUTS.expenses>;
  const rawExpenses = extracted.expenses ?? {};
  const expenses: Partial<typeof DEFAULT_DEAL_INPUTS.expenses> = {};
  let hasExpense = false;
  for (const key of expenseKeys) {
    const val = rawExpenses[key];
    if (val != null) { expenses[key] = val; hasExpense = true; }
  }
  if (hasExpense) inputs.expenses = { ...DEFAULT_DEAL_INPUTS.expenses, ...expenses };

  const fieldCount = Object.keys(inputs).length;
  const aiNote = extracted.notes ?? '';
  const importNotes = fieldCount === 0
    ? 'No deal inputs could be extracted. Please fill in the form manually.'
    : `${fieldCount} field${fieldCount > 1 ? 's' : ''} populated. Any missing fields use current market-rate defaults.${aiNote ? ' ' + aiNote : ''}`;

  return NextResponse.json({ inputs, importNotes });
}
