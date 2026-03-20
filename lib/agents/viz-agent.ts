import { getGroqClient, DEFAULT_MODEL } from './base';
import type { FinancialStatement } from '../models/statement';
import type { KeyFigureName } from '../models/statement';

export interface ChartTrace {
  dataRef: string; // KEY_FIGURE_NAME or row label
  label: string;
  chartType?: 'line' | 'bar' | 'area' | 'scatter';
}

export interface ChartSpec {
  title: string;
  chartType: 'line' | 'bar' | 'area' | 'scatter' | 'pie';
  traces: ChartTrace[];
  yaxisFormat: '$' | '%' | 'x' | '';
}

const KEY_FIGURE_LIST: KeyFigureName[] = [
  'gross_potential_rent', 'vacancy_loss', 'concession_loss', 'bad_debt',
  'net_rental_revenue', 'other_tenant_charges', 'total_revenue',
  'controllable_expenses', 'non_controllable_expenses', 'total_operating_expenses',
  'noi', 'total_payroll', 'management_fees', 'utilities',
  'real_estate_taxes', 'insurance', 'financial_expense',
  'replacement_expense', 'total_non_operating', 'net_income', 'cash_flow',
];

export class VizAgent {
  async generate(
    request: string,
    statement: FinancialStatement,
  ): Promise<{ spec: ChartSpec; explanation: string } | { error: string }> {
    const groq = getGroqClient();

    // Build available data refs
    const availableKeys = KEY_FIGURE_LIST.filter(k => statement.keyFigures[k]);
    const availableRows = statement.allRows
      .filter(r => !r.isHeader && Object.values(r.monthlyValues).some(v => v !== null))
      .map(r => r.label)
      .slice(0, 50);

    const systemPrompt = `You are a data visualization expert for financial P&L analysis.
Return ONLY valid JSON (no markdown, no explanation outside JSON).

If the request is nonsensical, unrelated to financial analysis, or cannot be fulfilled with the available data, return:
{ "error": "Brief honest explanation of why the chart cannot be created" }

Otherwise return this schema:
{
  "spec": {
    "title": "Chart title",
    "chartType": "line" | "bar" | "area" | "scatter" | "pie",
    "traces": [
      { "dataRef": "key_figure_name_or_row_label", "label": "Display Label", "chartType": "line" }
    ],
    "yaxisFormat": "$" | "%" | "x" | ""
  },
  "explanation": "1-2 sentences explaining what this chart shows and what to look for"
}

Available key figure dataRefs: ${availableKeys.join(', ')}
Available row labels (sample): ${availableRows.slice(0, 20).join(', ')}
Months available: ${statement.months.join(', ')}

Rules:
- dataRef must exactly match one of the available key figures or row labels
- For pie charts, traces represent slices; dataRef should be annual totals
- For line/bar/area, each trace is a series plotted over months
- yaxisFormat: "$" for dollar amounts, "%" for percentages, "x" for ratios, "" for counts
- Decline clearly if the request has no meaningful interpretation as a financial chart`;

    const userMessage = `Create a chart for this request: "${request}"
Property: ${statement.propertyName}, Period: ${statement.period}`;

    try {
      const response = await groq.chat.completions.create({
        model: DEFAULT_MODEL,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 512,
        temperature: 0.1,
      });

      const rawContent = response.choices[0]?.message?.content || '';

      // Extract JSON from response
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { error: 'Could not parse chart specification from AI response' };
      }

      const parsed = JSON.parse(jsonMatch[0]) as { spec: ChartSpec; explanation: string };

      if (!parsed.spec || !parsed.spec.title || !parsed.spec.traces) {
        return { error: 'Invalid chart specification returned' };
      }

      // Validate that dataRefs exist
      const validTraces = parsed.spec.traces.filter(trace => {
        const isKeyFigure = availableKeys.includes(trace.dataRef as KeyFigureName);
        const isRowLabel = statement.allRows.some(r => r.label === trace.dataRef);
        return isKeyFigure || isRowLabel;
      });

      if (validTraces.length === 0) {
        return { error: 'No valid data references found in the chart specification' };
      }

      parsed.spec.traces = validTraces;

      return {
        spec: parsed.spec,
        explanation: parsed.explanation || 'Chart generated from financial data',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { error: `Failed to generate chart: ${message}` };
    }
  }
}
