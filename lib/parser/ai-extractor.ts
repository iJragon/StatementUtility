import Groq from 'groq-sdk';
import type { LineItem, ParserReportEntry } from '../models/statement';

// Use a more capable model for extraction. This is a one-time call per file,
// not a streaming chat, so accuracy matters more than speed.
const EXTRACTION_MODEL = 'llama-3.3-70b-versatile';

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ('status' in err && (err as { status: number }).status === 429) return true;
  return err.message.toLowerCase().includes('rate limit') || err.message.includes('429');
}

// Daily token cap (TPD) cannot be resolved by retrying, so fail immediately
function isDailyTokenCap(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('tokens per day') || err.message.includes('TPD');
}

async function callWithRetry(
  client: Groq,
  prompt: string,
  maxRetries = 4,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: EXTRACTION_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.05,
        max_tokens: 800,
      });
      return response.choices[0]?.message?.content ?? '';
    } catch (err) {
      if (!isRateLimitError(err) || attempt === maxRetries) throw err;
      if (isDailyTokenCap(err)) {
        const waitMatch = err instanceof Error ? err.message.match(/try again in ([^.]+)/i) : null;
        const waitHint = waitMatch ? ` Try again in ${waitMatch[1]}.` : ' Try again in a few hours.';
        throw new Error(`Daily analysis limit reached.${waitHint}`);
      }
      const delay = Math.pow(2, attempt) * 1000; // 1 s, 2 s, 4 s, 8 s
      console.warn(`[ai-extractor] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function extractKeyFiguresWithAI(
  allRows: LineItem[],
  headerText: string,
): Promise<{
  keyFigures: Record<string, LineItem>;
  parserReport: ParserReportEntry[];
  propertyName: string;
  period: string;
  bookType: string;
}> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[ai-extractor] No GROQ_API_KEY, returning empty key figures');
    return { keyFigures: {}, parserReport: [], propertyName: 'Unknown Property', period: 'Unknown Period', bookType: 'Accrual' };
  }

  const client = new Groq({ apiKey });

  // Build a numbered row list for the AI. Only rows with a numeric annual total
  // are included. Pure section-header rows (no dollar values) are noise.
  // Original row indices are preserved so the AI's returned row numbers map
  // back correctly to allRows. Capped at 200 rows to limit token usage.
  const rowList = allRows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row.annualTotal !== null)
    .slice(0, 200)
    .map(({ row, i }) => {
      const sign = row.annualTotal! < 0 ? '-' : '+';
      const total = `${sign}$${Math.abs(row.annualTotal!).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      const tag = row.isSubtotal ? ' [subtotal]' : '';
      return `${i + 1}. "${row.label}"${tag}  |  ${total}`;
    })
    .join('\n');

  const prompt = `You are an expert real estate financial analyst. You are reading a property income statement (P&L / operating statement) that has been extracted from an Excel spreadsheet.

Report header / metadata rows:
"${headerText}"

All data rows from the statement (row number | label | type | annual total):
${rowList}

YOUR TASKS:

TASK 1: Extract metadata from the header rows above:
- propertyName: name of the property or portfolio
- period: reporting period (e.g. "January – December 2024")
- bookType: "Accrual" or "Cash"

TASK 2: For each financial concept listed below, identify the SINGLE best-matching row number from the list above.

Selection rules:
- Prefer [subtotal] rows over [section header] rows (headers typically have no dollar amounts)
- Prefer the most specific and complete subtotal (e.g. "TOTAL GROSS POTENTIAL RENT" over "GROSS POTENTIAL RENT [section header]")
- For vacancy: find the specific deduction line for empty units (e.g. "Loss Due to Vacancies", "Vacancy Apartments", "Physical Vacancy"). Do NOT select a general "Total Loss" line that aggregates multiple deduction types
- For total_revenue / total_operating_expenses / noi: look for the main subtotal lines, not section headers
- Use null ONLY if the concept is genuinely absent from this statement. Do not guess if truly missing
- Negative annual totals are normal for expense and loss rows

Financial concepts to identify:
gross_potential_rent:      Max possible rent if all units occupied at full asking price (Gross Potential Rent / Scheduled Rent / GPR)
vacancy_loss:              Lost rent from vacant units specifically (NOT a combined loss/deduction total)
concession_loss:           Rent discounts / concessions / move-in specials
bad_debt:                  Uncollected rent written off (Bad Debt / Write-offs / Collection Loss)
net_rental_revenue:        Net rental income after vacancy/concession/bad debt deductions
other_tenant_charges:      Other income beyond base rent: pet fees, parking, laundry, misc tenant income
total_revenue:             Total effective gross income / total revenue (primary revenue subtotal)
controllable_expenses:     Subtotal of manageable operating costs (payroll, maintenance, marketing, etc.)
non_controllable_expenses: Subtotal of fixed costs management cannot easily change (taxes, insurance, etc.)
total_operating_expenses:  Grand total of ALL operating expenses before NOI
noi:                       Net Operating Income = revenue minus all operating expenses
total_payroll:             All personnel / payroll / labor costs subtotal
management_fees:           Property management company fee
utilities:                 Utilities subtotal (water, sewer, electric, gas combined)
real_estate_taxes:         Property / real estate taxes
insurance:                 Property insurance / hazard insurance
financial_expense:         Debt service / mortgage / interest expense / principal & interest (below NOI)
replacement_expense:       Replacement reserve / capital reserve
total_non_operating:       Total of all non-operating / below-the-line expenses
net_income:                Net income after ALL expenses including debt service (true bottom line)
cash_flow:                 Net cash flow / cash flow from operations

Respond with ONLY a valid JSON object. No markdown fences, no explanation, no extra text. Just the JSON:
{
  "propertyName": "...",
  "period": "...",
  "bookType": "...",
  "keyFigureRows": {
    "gross_potential_rent": <integer row number or null>,
    "vacancy_loss": <integer row number or null>,
    "concession_loss": <integer row number or null>,
    "bad_debt": <integer row number or null>,
    "net_rental_revenue": <integer row number or null>,
    "other_tenant_charges": <integer row number or null>,
    "total_revenue": <integer row number or null>,
    "controllable_expenses": <integer row number or null>,
    "non_controllable_expenses": <integer row number or null>,
    "total_operating_expenses": <integer row number or null>,
    "noi": <integer row number or null>,
    "total_payroll": <integer row number or null>,
    "management_fees": <integer row number or null>,
    "utilities": <integer row number or null>,
    "real_estate_taxes": <integer row number or null>,
    "insurance": <integer row number or null>,
    "financial_expense": <integer row number or null>,
    "replacement_expense": <integer row number or null>,
    "total_non_operating": <integer row number or null>,
    "net_income": <integer row number or null>,
    "cash_flow": <integer row number or null>
  }
}`;

  try {
    const text = await callWithRetry(client, prompt);
    console.log('[ai-extractor] Raw response:', text.slice(0, 300));

    // Strip any accidental markdown fences before parsing
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in AI response');

    const parsed = JSON.parse(jsonMatch[0]) as {
      propertyName?: string;
      period?: string;
      bookType?: string;
      keyFigureRows?: Record<string, number | null>;
    };

    const rowMap = parsed.keyFigureRows ?? {};
    const keyFigures: Record<string, LineItem> = {};
    const parserReport: ParserReportEntry[] = [];

    // Build parserReport for all 21 expected keys, whether found or not
    const ALL_KEYS = [
      'gross_potential_rent', 'vacancy_loss', 'concession_loss', 'bad_debt',
      'net_rental_revenue', 'other_tenant_charges', 'total_revenue',
      'controllable_expenses', 'non_controllable_expenses', 'total_operating_expenses',
      'noi', 'total_payroll', 'management_fees', 'utilities', 'real_estate_taxes',
      'insurance', 'financial_expense', 'replacement_expense', 'total_non_operating',
      'net_income', 'cash_flow',
    ];

    for (const key of ALL_KEYS) {
      const rowNum = rowMap[key];
      if (typeof rowNum === 'number' && rowNum >= 1 && rowNum <= allRows.length) {
        const row = allRows[rowNum - 1];
        keyFigures[key] = row;
        parserReport.push({ key, label: row.label, rowNumber: rowNum, annualTotal: row.annualTotal });
        console.log(`[ai-extractor] ${key} → row ${rowNum}: "${row.label}" (total: ${row.annualTotal})`);
      } else {
        parserReport.push({ key, label: null, rowNumber: null, annualTotal: null });
        console.log(`[ai-extractor] ${key} → not found`);
      }
    }

    return {
      keyFigures,
      parserReport,
      propertyName: parsed.propertyName || 'Unknown Property',
      period: parsed.period || 'Unknown Period',
      bookType: parsed.bookType || 'Accrual',
    };
  } catch (err) {
    console.error('[ai-extractor] Extraction failed:', err);
    throw err; // Let the caller (route.ts) handle this. Do NOT cache a failed result
  }
}
