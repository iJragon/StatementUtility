import * as XLSX from 'xlsx';
import type { Deal, DealMetrics, ProFormaYear } from '../models/deal';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return isFinite(n) ? `${(n * 100).toFixed(2)}%` : '—';
}

function dollar(n: number): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(3)}M`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function times(n: number): string {
  return isFinite(n) ? `${n.toFixed(2)}x` : '—';
}

// ── Excel Export ─────────────────────────────────────────────────────────────

function buildSummarySheet(m: DealMetrics): (string | number)[][] {
  return [
    ['Metric', 'Value'],
    ['--- Income ---', ''],
    ['Gross Scheduled Income', m.grossScheduledIncome],
    ['Vacancy Loss', m.vacancyLoss],
    ['Effective Gross Income', m.effectiveGrossIncome],
    ['Total Operating Expenses', m.totalOperatingExpenses],
    ['NOI', m.noi],
    ['Operating Expense Ratio', pct(m.operatingExpenseRatio)],
    ['--- Valuation ---', ''],
    ['Cap Rate', pct(m.capRate)],
    ['GRM', times(m.grm)],
    ['DCF Value', m.dcfValue],
    ['--- Financing ---', ''],
    ['Loan Amount', m.loanAmount],
    ['Closing Costs', m.closingCosts],
    ['Total Cash Invested', m.totalCashInvested],
    ['Monthly Payment', m.monthlyPayment],
    ['Annual Debt Service', m.annualDebtService],
    ['Mortgage Constant', pct(m.mortgageConstant)],
    ['LTV', pct(m.ltv)],
    ['Max Loan Amount (1.25x DSCR)', m.maxLoanAmount],
    ['--- Cash Flow ---', ''],
    ['Cash Flow Before Tax', m.cashFlowBeforeTax],
    ['Cash-on-Cash Return', pct(m.cashOnCash)],
    ['DSCR', times(m.dscr)],
    ['Break-Even Occupancy', pct(m.breakEvenOccupancy)],
    ['--- Returns ---', ''],
    ['NPV', m.npv],
    ['IRR', pct(m.irr)],
    ['MIRR', pct(m.mirr)],
    ['Profitability Index', times(m.profitabilityIndex)],
    ['Payback Period (yrs)', m.paybackPeriod],
    ['Return on Equity', pct(m.returnOnEquity)],
    ['Equity Dividend Rate', pct(m.equityDividendRate)],
    ['--- Tax ---', ''],
    ['Annual Depreciation', m.annualDepreciation],
    ['Taxable Income (Yr 1)', m.taxableIncome],
    ['After-Tax Cash Flow (Yr 1)', m.afterTaxCashFlow],
    ['--- Exit ---', ''],
    ['Projected Sale Price', m.projectedSalePrice],
    ['Selling Costs', m.sellingCosts],
    ['Remaining Loan Balance', m.remainingLoanBalance],
    ['Net Reversion', m.reversion],
    ['Long-Term Capital Gain', m.longTermCapitalGain],
    ['--- Four Returns ---', ''],
    ['Total Cash Flow', m.totalCashFlow],
    ['Total Appreciation', m.totalAppreciation],
    ['Total Amortization', m.totalAmortization],
    ['Total Tax Benefit', m.totalTaxBenefit],
    ['Overall Return', pct(m.overallReturn)],
  ];
}

function buildProFormaSheet(proForma: ProFormaYear[]): (string | number)[][] {
  const headers = [
    'Metric',
    ...proForma.map(y => `Year ${y.year}`),
  ];

  const rowDefs: Array<{ label: string; key: keyof ProFormaYear; isDollar?: boolean }> = [
    { label: 'Gross Scheduled Income', key: 'grossScheduledIncome', isDollar: true },
    { label: 'Vacancy Loss',           key: 'vacancyLoss',          isDollar: true },
    { label: 'Effective Gross Income', key: 'effectiveGrossIncome', isDollar: true },
    { label: 'Other Income',           key: 'otherIncome',          isDollar: true },
    { label: 'Total Income',           key: 'totalIncome',          isDollar: true },
    { label: 'Operating Expenses',     key: 'operatingExpenses',    isDollar: true },
    { label: 'NOI',                    key: 'noi',                  isDollar: true },
    { label: 'Debt Service',           key: 'debtService',          isDollar: true },
    { label: 'Cash Flow Before Tax',   key: 'cashFlowBeforeTax',    isDollar: true },
    { label: 'Principal Paydown',      key: 'principalPaydown',     isDollar: true },
    { label: 'Interest Payment',       key: 'interestPayment',      isDollar: true },
    { label: 'Remaining Loan Balance', key: 'remainingLoanBalance', isDollar: true },
    { label: 'Depreciation',          key: 'depreciation',         isDollar: true },
    { label: 'Taxable Income',         key: 'taxableIncome',        isDollar: true },
    { label: 'Tax Liability',          key: 'taxLiability',         isDollar: true },
    { label: 'After-Tax Cash Flow',    key: 'afterTaxCashFlow',     isDollar: true },
    { label: 'Property Value',         key: 'propertyValue',        isDollar: true },
    { label: 'Equity',                 key: 'equity',               isDollar: true },
    { label: 'Cash-on-Cash',          key: 'cashOnCash' },
    { label: 'Return on Equity',       key: 'returnOnEquity' },
  ];

  const rows = rowDefs.map(r => [
    r.label,
    ...proForma.map(y => {
      const v = y[r.key] as number;
      return r.isDollar ? v : pct(v);
    }),
  ]);

  return [headers, ...rows];
}

function buildAPODSheet(deal: Deal): (string | number | null)[][] {
  if (!deal.analysis) return [['No analysis data']];
  const m = deal.analysis.metrics;
  const inputs = deal.inputs;
  const yr1 = deal.analysis.proForma[0];
  const totalEGI = m.effectiveGrossIncome + yr1.otherIncome;

  const rows: (string | number | null)[][] = [
    ['ANNUAL PROPERTY OPERATING DATA', null, null, null],
    ['', null, null, null],
    ['INCOME', null, null, null],
    ['Gross Scheduled Income (GSI)', null, null, m.grossScheduledIncome],
    ['Less: Vacancy Loss', null, null, -m.vacancyLoss],
    ['Effective Gross Income (EGI)', null, null, m.effectiveGrossIncome],
    ['Other Income', null, null, yr1.otherIncome],
    ['Total EGI', null, null, totalEGI],
    ['', null, null, null],
    ['OPERATING EXPENSES', null, '% of EGI', 'Annual Amount'],
  ];

  const expenseLabels: Record<string, string> = {
    propertyTaxes:  'Property Taxes',
    insurance:      'Insurance',
    utilities:      'Utilities',
    maintenance:    'Maintenance & Repairs',
    managementFee:  'Management Fee',
    landscaping:    'Landscaping',
    janitorial:     'Janitorial',
    marketing:      'Marketing',
    administrative: 'Administrative',
    payroll:        'Payroll',
    reserves:       'Reserves',
    miscellaneous:  'Miscellaneous',
  };

  for (const [key, label] of Object.entries(expenseLabels)) {
    const amount = inputs.expenses[key as keyof typeof inputs.expenses] ?? 0;
    if (amount > 0) {
      rows.push([label, null, totalEGI > 0 ? pct(amount / totalEGI) : '—', amount]);
    }
  }

  rows.push(
    ['Total Operating Expenses', null, totalEGI > 0 ? pct(m.totalOperatingExpenses / totalEGI) : '—', m.totalOperatingExpenses],
    ['', null, null, null],
    ['NET OPERATING INCOME', null, null, null],
    ['NOI', null, totalEGI > 0 ? pct(m.noi / totalEGI) : '—', m.noi],
    ['', null, null, null],
    ['DEBT SERVICE & CASH FLOW', null, null, null],
    ['Annual Debt Service', null, null, m.annualDebtService],
    ['Cash Flow Before Tax (CFBT)', null, null, m.cashFlowBeforeTax],
    ['', null, null, null],
    ['KEY METRICS', null, null, null],
    ['Cap Rate', null, null, pct(m.capRate)],
    ['OER', null, null, pct(m.operatingExpenseRatio)],
    ['Cash-on-Cash', null, null, pct(m.cashOnCash)],
    ['IRR', null, null, pct(m.irr)],
    ['DSCR', null, null, times(m.dscr)],
    ['GRM', null, null, times(m.grm)],
  );

  return rows;
}

function buildSensitivitySheet(deal: Deal): (string | number)[][] {
  if (!deal.analysis) return [['No analysis data']];
  const sensitivity = deal.analysis.sensitivity;
  const rentLabels = ['-2%', '0%', '+2%', '+3%', '+5%', '+7%'];
  const vacancyLabels = ['0%', '3%', '5%', '8%', '10%', '15%'];

  const header = ['Vacancy / Rent Growth', ...rentLabels];
  const rows = sensitivity.map((row, vi) => [
    vacancyLabels[vi],
    ...row.map(cell => pct(cell.cashOnCash)),
  ]);

  return [
    ['SENSITIVITY MATRIX — Cash-on-Cash Return'],
    [''],
    header,
    ...rows,
    [''],
    ['IRR SENSITIVITY'],
    [''],
    header,
    ...sensitivity.map((row, vi) => [
      vacancyLabels[vi],
      ...row.map(cell => pct(cell.irr)),
    ]),
    [''],
    ['DSCR SENSITIVITY'],
    [''],
    header,
    ...sensitivity.map((row, vi) => [
      vacancyLabels[vi],
      ...row.map(cell => times(cell.dscr)),
    ]),
  ];
}

export function exportDealToExcel(deal: Deal): Buffer {
  if (!deal.analysis) throw new Error('Deal has no analysis to export');

  const wb = XLSX.utils.book_new();

  const summaryWs = XLSX.utils.aoa_to_sheet(buildSummarySheet(deal.analysis.metrics));
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  const proFormaWs = XLSX.utils.aoa_to_sheet(buildProFormaSheet(deal.analysis.proForma));
  XLSX.utils.book_append_sheet(wb, proFormaWs, 'Pro Forma');

  const apodWs = XLSX.utils.aoa_to_sheet(buildAPODSheet(deal));
  XLSX.utils.book_append_sheet(wb, apodWs, 'APOD');

  const sensitivityWs = XLSX.utils.aoa_to_sheet(buildSensitivitySheet(deal));
  XLSX.utils.book_append_sheet(wb, sensitivityWs, 'Sensitivity');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf as Buffer;
}

// ── PDF Export ────────────────────────────────────────────────────────────────

// pdfmake 0.3.x server-side API: singleton + addFonts + createPdf().getBuffer()
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakeInstance = require('pdfmake');
// Register standard PDF core fonts — no binary files needed
pdfmakeInstance.addFonts({
  Helvetica: {
    normal:      'Helvetica',
    bold:        'Helvetica-Bold',
    italics:     'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
});

const BRAND = '#2563eb';
const MUTED  = '#64748b';
const LINE   = '#e2e8f0';

function kpiTable(m: DealMetrics): object {
  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [[
        {
          text: [{ text: pct(m.capRate) + '\n', bold: true, fontSize: 18, color: BRAND },
                 { text: 'Cap Rate', fontSize: 9, color: MUTED }],
          alignment: 'center', border: [true, true, true, true], borderColor: [LINE, LINE, LINE, LINE], fillColor: '#f8fafc', margin: [4, 8, 4, 8],
        },
        {
          text: [{ text: pct(m.cashOnCash) + '\n', bold: true, fontSize: 18, color: m.cashOnCash >= 0.07 ? '#15803d' : m.cashOnCash >= 0.04 ? '#b45309' : '#dc2626' },
                 { text: 'Cash-on-Cash', fontSize: 9, color: MUTED }],
          alignment: 'center', border: [true, true, true, true], borderColor: [LINE, LINE, LINE, LINE], fillColor: '#f8fafc', margin: [4, 8, 4, 8],
        },
        {
          text: [{ text: pct(m.irr) + '\n', bold: true, fontSize: 18, color: m.irr >= 0.12 ? '#15803d' : m.irr >= 0.08 ? '#b45309' : '#dc2626' },
                 { text: 'IRR', fontSize: 9, color: MUTED }],
          alignment: 'center', border: [true, true, true, true], borderColor: [LINE, LINE, LINE, LINE], fillColor: '#f8fafc', margin: [4, 8, 4, 8],
        },
        {
          text: [{ text: times(m.dscr) + '\n', bold: true, fontSize: 18, color: m.dscr >= 1.25 ? '#15803d' : m.dscr >= 1.0 ? '#b45309' : '#dc2626' },
                 { text: 'DSCR', fontSize: 9, color: MUTED }],
          alignment: 'center', border: [true, true, true, true], borderColor: [LINE, LINE, LINE, LINE], fillColor: '#f8fafc', margin: [4, 8, 4, 8],
        },
      ]],
    },
    layout: 'noBorders',
  };
}

function twoColMetrics(m: DealMetrics): object {
  const pairs: Array<[string, string]> = [
    ['NOI',                  dollar(m.noi)],
    ['Cap Rate',             pct(m.capRate)],
    ['Cash-on-Cash',         pct(m.cashOnCash)],
    ['IRR',                  pct(m.irr)],
    ['MIRR',                 pct(m.mirr)],
    ['DSCR',                 times(m.dscr)],
    ['NPV',                  dollar(m.npv)],
    ['GRM',                  times(m.grm)],
    ['Loan Amount',          dollar(m.loanAmount)],
    ['Total Cash Invested',  dollar(m.totalCashInvested)],
    ['Annual Debt Service',  dollar(m.annualDebtService)],
    ['Break-Even Occ.',      pct(m.breakEvenOccupancy)],
    ['LTV',                  pct(m.ltv)],
    ['Payback Period',       `${m.paybackPeriod} yr`],
    ['Projected Sale Price', dollar(m.projectedSalePrice)],
    ['Net Reversion',        dollar(m.reversion)],
  ];

  // Build rows of 2 pairs each
  const bodyRows: object[][] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const left  = pairs[i];
    const right = pairs[i + 1];
    const row: object[] = [
      { text: left[0],  fontSize: 8, color: MUTED,   margin: [2, 3, 2, 3] },
      { text: left[1],  fontSize: 8, bold: true, alignment: 'right', margin: [2, 3, 2, 3] },
      right
        ? { text: right[0], fontSize: 8, color: MUTED,   margin: [2, 3, 2, 3] }
        : { text: '', margin: [2, 3, 2, 3] },
      right
        ? { text: right[1], fontSize: 8, bold: true, alignment: 'right', margin: [2, 3, 2, 3] }
        : { text: '', margin: [2, 3, 2, 3] },
    ];
    bodyRows.push(row);
  }

  return {
    table: {
      widths: ['*', 70, '*', 70],
      body: bodyRows,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      paddingLeft: () => 2,
      paddingRight: () => 2,
    },
  };
}

function incomeExpenseTable(m: DealMetrics, inputs: Deal['inputs']): object {
  const body: object[][] = [
    [
      { text: 'Item', fontSize: 8, bold: true, fillColor: '#f1f5f9', margin: [4, 3, 4, 3] },
      { text: 'Annual', fontSize: 8, bold: true, alignment: 'right', fillColor: '#f1f5f9', margin: [4, 3, 4, 3] },
    ],
    [
      { text: 'Gross Scheduled Income', fontSize: 8, margin: [4, 2, 4, 2] },
      { text: dollar(m.grossScheduledIncome), fontSize: 8, alignment: 'right', margin: [4, 2, 4, 2] },
    ],
    [
      { text: 'Less: Vacancy Loss', fontSize: 8, color: MUTED, margin: [12, 2, 4, 2] },
      { text: `(${dollar(m.vacancyLoss)})`, fontSize: 8, alignment: 'right', color: '#dc2626', margin: [4, 2, 4, 2] },
    ],
    [
      { text: 'Effective Gross Income', fontSize: 8, bold: true, margin: [4, 2, 4, 2] },
      { text: dollar(m.effectiveGrossIncome), fontSize: 8, bold: true, alignment: 'right', margin: [4, 2, 4, 2] },
    ],
    [
      { text: 'Operating Expenses', fontSize: 8, color: MUTED, margin: [12, 2, 4, 2] },
      { text: `(${dollar(m.totalOperatingExpenses)})`, fontSize: 8, alignment: 'right', color: '#dc2626', margin: [4, 2, 4, 2] },
    ],
    [
      { text: 'Net Operating Income (NOI)', fontSize: 8, bold: true, fillColor: '#f0fdf4', margin: [4, 3, 4, 3] },
      { text: dollar(m.noi), fontSize: 8, bold: true, alignment: 'right', fillColor: '#f0fdf4', color: '#15803d', margin: [4, 3, 4, 3] },
    ],
    [
      { text: 'Annual Debt Service', fontSize: 8, color: MUTED, margin: [12, 2, 4, 2] },
      { text: `(${dollar(m.annualDebtService)})`, fontSize: 8, alignment: 'right', color: '#dc2626', margin: [4, 2, 4, 2] },
    ],
    [
      { text: 'Cash Flow Before Tax', fontSize: 8, bold: true, fillColor: m.cashFlowBeforeTax >= 0 ? '#f0fdf4' : '#fef2f2', margin: [4, 3, 4, 3] },
      { text: dollar(m.cashFlowBeforeTax), fontSize: 8, bold: true, alignment: 'right', fillColor: m.cashFlowBeforeTax >= 0 ? '#f0fdf4' : '#fef2f2', color: m.cashFlowBeforeTax >= 0 ? '#15803d' : '#dc2626', margin: [4, 3, 4, 3] },
    ],
  ];

  void inputs; // inputs available for future expansion

  return {
    table: { widths: ['*', 80], body },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => LINE,
    },
  };
}

export async function exportDealToPDF(deal: Deal): Promise<Buffer> {
  if (!deal.analysis) throw new Error('Deal has no analysis to export');

  const m = deal.analysis.metrics;
  const score = deal.analysis.score;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const VERDICT_LABELS: Record<string, string> = {
    'strong-buy':  'Strong Buy',
    'buy':         'Buy',
    'conditional': 'Conditional',
    'avoid':       'Avoid',
    'strong-avoid':'Strong Avoid',
  };
  const VERDICT_COLORS: Record<string, string> = {
    'strong-buy':  '#15803d',
    'buy':         '#16a34a',
    'conditional': '#b45309',
    'avoid':       '#dc2626',
    'strong-avoid':'#991b1b',
  };

  const verdictLabel = VERDICT_LABELS[score.verdict] ?? score.verdict;
  const verdictColor = VERDICT_COLORS[score.verdict] ?? '#64748b';

  const docDef = {
    defaultStyle: { font: 'Helvetica', fontSize: 9, color: '#1e293b' },
    pageSize: 'LETTER',
    pageMargins: [40, 50, 40, 50],
    content: [
      // Header
      {
        columns: [
          {
            stack: [
              { text: deal.name, fontSize: 16, bold: true, color: BRAND },
              deal.address ? { text: deal.address, fontSize: 9, color: MUTED, margin: [0, 2, 0, 0] } : {},
              { text: `Analyzed ${today}`, fontSize: 8, color: MUTED, margin: [0, 1, 0, 0] },
            ],
          },
          {
            stack: [
              { text: verdictLabel, fontSize: 13, bold: true, color: verdictColor, alignment: 'right' },
              { text: `Score: ${score.total}/100`, fontSize: 9, color: MUTED, alignment: 'right' },
            ],
          },
        ],
        margin: [0, 0, 0, 16],
      },

      // Divider
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: BRAND }], margin: [0, 0, 0, 14] },

      // KPI boxes
      { text: 'Key Performance Indicators', fontSize: 10, bold: true, margin: [0, 0, 0, 8] },
      kpiTable(m),
      { text: '', margin: [0, 0, 0, 16] },

      // Two-column layout: income table + key metrics
      {
        columns: [
          {
            width: '48%',
            stack: [
              { text: 'Income & Expense Summary', fontSize: 10, bold: true, margin: [0, 0, 0, 6] },
              incomeExpenseTable(m, deal.inputs),
            ],
          },
          { width: '4%', text: '' },
          {
            width: '48%',
            stack: [
              { text: 'Key Metrics', fontSize: 10, bold: true, margin: [0, 0, 0, 6] },
              twoColMetrics(m),
            ],
          },
        ],
        margin: [0, 0, 0, 16],
      },

      // Four Returns
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: LINE }], margin: [0, 0, 0, 10] },
      {
        text: `Four Returns — ${deal.inputs.holdPeriod}-Year Total`,
        fontSize: 10, bold: true, margin: [0, 0, 0, 8],
      },
      {
        table: {
          widths: ['*', '*', '*', '*'],
          body: [[
            { stack: [{ text: dollar(m.totalCashFlow), bold: true, fontSize: 12, color: m.totalCashFlow >= 0 ? '#15803d' : '#dc2626' }, { text: '1. Cash Flow', fontSize: 8, color: MUTED }], alignment: 'center', margin: [4, 6, 4, 6] },
            { stack: [{ text: dollar(m.totalAppreciation), bold: true, fontSize: 12, color: '#2563eb' }, { text: '2. Appreciation', fontSize: 8, color: MUTED }], alignment: 'center', margin: [4, 6, 4, 6] },
            { stack: [{ text: dollar(m.totalAmortization), bold: true, fontSize: 12, color: '#7c3aed' }, { text: '3. Amortization', fontSize: 8, color: MUTED }], alignment: 'center', margin: [4, 6, 4, 6] },
            { stack: [{ text: dollar(m.totalTaxBenefit), bold: true, fontSize: 12, color: '#b45309' }, { text: '4. Tax Benefit', fontSize: 8, color: MUTED }], alignment: 'center', margin: [4, 6, 4, 6] },
          ]],
        },
        layout: 'noBorders',
      },
      { text: `Overall Return: ${pct(m.overallReturn)}`, fontSize: 9, color: MUTED, margin: [0, 8, 0, 0] },

      // Footer
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: LINE }], margin: [0, 16, 0, 8] },
      { text: 'Generated by Estatelytics · For informational purposes only. Not investment advice.', fontSize: 7, color: MUTED, alignment: 'center' },
    ],
  };

  return pdfmakeInstance.createPdf(docDef).getBuffer() as Promise<Buffer>;
}
