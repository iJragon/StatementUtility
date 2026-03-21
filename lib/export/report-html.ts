import type { AnalysisResult } from '@/lib/models/statement';
import type { PropertyDetail } from '@/lib/models/portfolio';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtFull(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const sign = val < 0 ? '-' : '';
  return `${sign}$${Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmt$(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return `${val.toFixed(1)}%`;
}

function pctOf(val: number | null, rev: number | null): string {
  if (val === null || rev === null || rev === 0) return '';
  return `${((val / Math.abs(rev)) * 100).toFixed(1)}%`;
}

function pctChange(prev: number | null, curr: number | null): string {
  if (prev === null || curr === null || prev === 0) return '';
  const chg = ((curr - prev) / Math.abs(prev)) * 100;
  return `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`;
}

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  black:   '#1a1a1a',
  muted:   '#6b7280',
  light:   '#9ca3af',
  border:  '#e5e7eb',
  good:    '#16a34a',
  warn:    '#d97706',
  bad:     '#dc2626',
  accent:  '#2563eb',
};

// ── Markdown narrative parser → pdfmake content ───────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mdToPdfContent(text: string): any[] {
  if (!text) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ') || line.startsWith('# ')) {
      out.push({
        text: line.replace(/^#+\s*/, '').toUpperCase(),
        fontSize: 8,
        bold: true,
        color: C.muted,
        characterSpacing: 0.8,
        margin: [0, 14, 0, 3],
      });
    } else {
      // Split **bold** spans
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map(part =>
        part.startsWith('**') && part.endsWith('**')
          ? { text: part.slice(2, -2), bold: true, color: C.black }
          : { text: part, color: C.black }
      );
      out.push({ text: parts, fontSize: 10, lineHeight: 1.6, margin: [0, 0, 0, 4] });
    }
  }
  return out;
}

// ── KPI tile (pdfmake stack) ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kpiTile(label: string, value: string, sub: string, valueColor = C.black): any {
  return {
    stack: [
      { text: label.toUpperCase(), fontSize: 7, color: C.light, characterSpacing: 0.5, margin: [0, 0, 0, 4] },
      { text: value, fontSize: 14, bold: true, color: valueColor },
      { text: sub, fontSize: 7, color: C.light, margin: [0, 3, 0, 0] },
    ],
    margin: [0, 0, 0, 0],
  };
}

function kpiColor(metric: string, val: number | null): string {
  if (val === null) return C.black;
  if (metric === 'oer')     return val < 65 ? C.good : val < 75 ? C.warn : C.bad;
  if (metric === 'vacancy') return val < 7  ? C.good : val < 12 ? C.warn : C.bad;
  if (metric === 'noi')     return val > 45 ? C.good : val > 30 ? C.warn : C.bad;
  if (metric === 'dscr')    return val >= 1.25 ? C.good : val >= 1.0 ? C.warn : C.bad;
  return C.black;
}

// ── Single-analysis PDF ───────────────────────────────────────────────────────

export async function downloadSummaryPDF(analysis: AnalysisResult, summaryText: string): Promise<void> {
  const { statement, ratios } = analysis;
  const kf = statement.keyFigures;

  const gpr        = kf['gross_potential_rent']?.annualTotal ?? null;
  const vacLoss    = kf['vacancy_loss']?.annualTotal ?? null;
  const concLoss   = kf['concession_loss']?.annualTotal ?? null;
  const badDebt    = kf['bad_debt']?.annualTotal ?? null;
  const netRental  = kf['net_rental_revenue']?.annualTotal ?? null;
  const otherChg   = kf['other_tenant_charges']?.annualTotal ?? null;
  const totalRev   = kf['total_revenue']?.annualTotal ?? null;
  const ctrlExp    = kf['controllable_expenses']?.annualTotal ?? null;
  const nonCtrlExp = kf['non_controllable_expenses']?.annualTotal ?? null;
  const totalOpEx  = kf['total_operating_expenses']?.annualTotal ?? null;
  const noi        = kf['noi']?.annualTotal ?? null;
  const finExp     = kf['financial_expense']?.annualTotal ?? null;
  const netIncome  = kf['net_income']?.annualTotal ?? null;
  const cashFlow   = kf['cash_flow']?.annualTotal ?? null;

  const oer       = ratios.oer?.value ?? null;
  const dscr      = ratios.dscr?.value ?? null;
  const vacancy   = ratios.vacancyRate?.value ?? null;
  const noiMargin = ratios.noiMargin?.value ?? null;

  const reportDate = new Date(analysis.analyzedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Income statement rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function incomeRow(label: string, val: number | null, indent: boolean, isDeduction: boolean, bold: boolean): any[] {
    const display = isDeduction && val !== null && val > 0 ? -val : val;
    const pct = pctOf(val, totalRev);
    const isNeg = display !== null && display < 0;
    const textColor = bold ? (isNeg ? C.bad : C.black) : (isNeg ? '#ef4444' : C.muted);
    return [
      { text: label, bold, color: bold ? C.black : C.muted, margin: [indent ? 12 : 0, 0, 0, 0] },
      { text: display !== null ? fmtFull(display) : 'N/A', bold, color: textColor, alignment: 'right' },
      { text: pct, color: C.light, alignment: 'right' },
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[][] = [
    // Header
    [
      { text: 'Line Item', bold: true, fontSize: 8, color: C.muted, characterSpacing: 0.5 },
      { text: 'Amount', bold: true, fontSize: 8, color: C.muted, characterSpacing: 0.5, alignment: 'right' },
      { text: '% Rev', bold: true, fontSize: 8, color: C.muted, characterSpacing: 0.5, alignment: 'right' },
    ],
  ];

  const addRow = (label: string, val: number | null, indent = false, isDeduction = false, bold = false) => {
    if (val === null && !bold) return;
    tableBody.push(incomeRow(label, val, indent, isDeduction, bold));
  };

  addRow('Gross Potential Rent', gpr, false, false, true);
  if (vacLoss  !== null) addRow('Less: Vacancy Loss',    vacLoss,  true, true);
  if (concLoss !== null) addRow('Less: Concession Loss', concLoss, true, true);
  if (badDebt  !== null) addRow('Less: Bad Debt',        badDebt,  true, true);
  addRow('Net Rental Revenue', netRental, false, false, true);
  if (otherChg !== null) addRow('Other Tenant Charges', otherChg, true);
  addRow('Total Revenue', totalRev, false, false, true);
  if (ctrlExp    !== null) addRow('Controllable Expenses',     ctrlExp,    true, true);
  if (nonCtrlExp !== null) addRow('Non-Controllable Expenses', nonCtrlExp, true, true);
  addRow('Total Operating Expenses', totalOpEx, false, true, true);
  addRow('Net Operating Income', noi, false, false, true);
  if (finExp    !== null) addRow('Financial Expense / Debt Service', finExp, true, true);
  if (netIncome !== null) addRow('Net Income', netIncome, false, false, true);
  if (cashFlow  !== null) addRow('Cash Flow',  cashFlow);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docDef: any = {
    pageSize: 'A4',
    pageMargins: [56, 48, 56, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: C.black },

    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'Estatelytics — Confidential', fontSize: 7, color: C.light, margin: [56, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: C.light, alignment: 'right', margin: [0, 0, 56, 0] },
      ],
      margin: [0, 8, 0, 0],
    }),

    content: [
      // ── Report header ──
      { text: 'EXECUTIVE SUMMARY', fontSize: 8, bold: true, color: C.muted, characterSpacing: 1, margin: [0, 0, 0, 6] },
      { text: statement.propertyName || 'Property Analysis', fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
      {
        columns: [
          { text: [{ text: 'Reporting Period: ', bold: true }, statement.period], fontSize: 8.5, color: C.muted },
          { text: [{ text: 'Book Type: ', bold: true }, statement.bookType || 'Accrual'], fontSize: 8.5, color: C.muted },
          { text: [{ text: 'Date Prepared: ', bold: true }, reportDate], fontSize: 8.5, color: C.muted },
        ],
        margin: [0, 0, 0, 12],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 1.5, lineColor: C.black }], margin: [0, 0, 0, 20] },

      // ── KPI tiles ──
      { text: 'KEY PERFORMANCE INDICATORS', fontSize: 8, bold: true, color: C.muted, characterSpacing: 0.8, margin: [0, 0, 0, 10] },
      {
        columns: [
          kpiTile('NOI Margin',         fmtPct(noiMargin), 'Target: 45%+',     kpiColor('noi', noiMargin)),
          kpiTile('Op. Expense Ratio',  fmtPct(oer),       'Target: below 55%', kpiColor('oer', oer)),
          kpiTile('Vacancy Rate',       fmtPct(vacancy),   'Target: below 7%',  kpiColor('vacancy', vacancy)),
          kpiTile('Debt Svc Coverage',  dscr !== null ? `${dscr.toFixed(2)}x` : 'N/A', 'Lender min: 1.25x', kpiColor('dscr', dscr)),
        ],
        columnGap: 16,
        margin: [0, 0, 0, 24],
      },

      // ── Income statement ──
      { text: 'STATEMENT OF OPERATIONS — ANNUAL', fontSize: 8, bold: true, color: C.muted, characterSpacing: 0.8, margin: [0, 0, 0, 10] },
      {
        table: {
          widths: ['*', 'auto', 56],
          body: tableBody,
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
          hLineColor: (i: number, node: { table: { body: unknown[] } }) =>
            i === 1 || i === node.table.body.length ? C.black : C.border,
          vLineWidth: () => 0,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        margin: [0, 0, 0, 24],
      },

      // ── AI narrative ──
      ...(summaryText ? [
        { text: 'AI NARRATIVE', fontSize: 8, bold: true, color: C.muted, characterSpacing: 0.8, margin: [0, 0, 0, 8] },
        {
          stack: mdToPdfContent(summaryText),
          margin: [12, 0, 0, 0],
          // Left border via background column trick
        },
      ] : []),
    ],
  };

  const filename = `${statement.propertyName} - ${statement.period}.pdf`.replace(/[/\\?%*:|"<>]/g, '-');
  await renderAndDownload(docDef, filename);
}

// ── Multi-period portfolio PDF ────────────────────────────────────────────────

export async function downloadPortfolioPDF(
  property: PropertyDetail,
  analyses: AnalysisResult[],
  periods: string[],
  summaryText: string,
): Promise<void> {
  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const periodRange = periods.length >= 2 ? `${periods[0]} to ${periods[periods.length - 1]}` : periods[0] || '';

  const latest = analyses[analyses.length - 1];
  const latestKf = latest.statement.keyFigures;
  const latestRatios = latest.ratios;

  const oerVal = latestRatios.oer?.value ?? null;
  const vacVal = latestRatios.vacancyRate?.value ?? null;

  // Multi-period table
  const colWidths = ['*', ...periods.map(() => 'auto'), ...(analyses.length >= 2 ? ['auto'] : [])];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerRow: any[] = [
    { text: 'Line Item', bold: true, fontSize: 8, color: C.muted },
    ...periods.map(p => ({ text: p, bold: true, fontSize: 8, color: C.muted, alignment: 'right' })),
    ...(analyses.length >= 2 ? [{ text: 'Chg', bold: true, fontSize: 8, color: C.muted, alignment: 'right' }] : []),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[][] = [headerRow];

  const dataRows = [
    { label: 'Total Revenue',            key: 'total_revenue',           bold: true,  isDeduction: false },
    { label: 'Total Operating Expenses', key: 'total_operating_expenses', bold: false, isDeduction: true },
    { label: 'Net Operating Income',     key: 'noi',                      bold: true,  isDeduction: false },
    { label: 'Net Income',               key: 'net_income',               bold: false, isDeduction: false },
    { label: 'Cash Flow',                key: 'cash_flow',                bold: false, isDeduction: false },
  ];

  for (const row of dataRows) {
    const values = analyses.map(a => a.statement.keyFigures[row.key]?.annualTotal ?? null);
    if (values.every(v => v === null)) continue;
    const lastVal = values[values.length - 1];
    const prevVal = values.length >= 2 ? values[values.length - 2] : null;
    const chg = pctChange(prevVal, lastVal);
    const chgNum = prevVal !== null && lastVal !== null && prevVal !== 0 ? ((lastVal - prevVal) / Math.abs(prevVal)) * 100 : null;
    const chgColor = chgNum === null ? C.muted : chgNum >= 0 ? C.good : C.bad;

    tableBody.push([
      { text: row.label, bold: row.bold, color: row.bold ? C.black : C.muted },
      ...values.map(v => {
        const d = row.isDeduction && v !== null && v > 0 ? -v : v;
        const isNeg = d !== null && d < 0;
        return { text: d !== null ? fmt$(d) : 'N/A', bold: row.bold, color: isNeg ? C.bad : row.bold ? C.black : C.muted, alignment: 'right' };
      }),
      ...(analyses.length >= 2 ? [{ text: chg || 'N/A', color: chgColor, alignment: 'right' }] : []),
    ]);
  }

  // Ratio rows
  const ratioRows = [
    { label: 'NOI Margin',   values: analyses.map(a => a.ratios.noiMargin?.value ?? null),   lowerIsBetter: false },
    { label: 'OER',          values: analyses.map(a => a.ratios.oer?.value ?? null),          lowerIsBetter: true },
    { label: 'Vacancy Rate', values: analyses.map(a => a.ratios.vacancyRate?.value ?? null),  lowerIsBetter: true },
  ];
  for (const row of ratioRows) {
    const lastVal = row.values[row.values.length - 1];
    const prevVal = row.values.length >= 2 ? row.values[row.values.length - 2] : null;
    const chg = pctChange(prevVal, lastVal);
    const chgNum = prevVal !== null && lastVal !== null && prevVal !== 0 ? ((lastVal - prevVal) / Math.abs(prevVal)) * 100 : null;
    const chgColor = chgNum === null ? C.muted : (row.lowerIsBetter ? chgNum < 0 : chgNum > 0) ? C.good : C.bad;
    tableBody.push([
      { text: row.label, color: C.muted },
      ...row.values.map(v => ({ text: v !== null ? `${v.toFixed(1)}%` : 'N/A', color: C.muted, alignment: 'right' })),
      ...(analyses.length >= 2 ? [{ text: chg || 'N/A', color: chgColor, alignment: 'right' }] : []),
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docDef: any = {
    pageSize: 'A4',
    pageMargins: [56, 48, 56, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: C.black },

    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'Estatelytics — Confidential', fontSize: 7, color: C.light, margin: [56, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: C.light, alignment: 'right', margin: [0, 0, 56, 0] },
      ],
      margin: [0, 8, 0, 0],
    }),

    content: [
      // ── Header ──
      { text: 'PROPERTY OVERVIEW', fontSize: 8, bold: true, color: C.muted, characterSpacing: 1, margin: [0, 0, 0, 6] },
      { text: property.name, fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
      {
        columns: [
          { text: [{ text: 'Reporting Period: ', bold: true }, periodRange], fontSize: 8.5, color: C.muted },
          { text: [{ text: 'Statements: ', bold: true }, `${analyses.length} period${analyses.length !== 1 ? 's' : ''}`], fontSize: 8.5, color: C.muted },
          { text: [{ text: 'Date Prepared: ', bold: true }, reportDate], fontSize: 8.5, color: C.muted },
        ],
        margin: [0, 0, 0, 12],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 1.5, lineColor: C.black }], margin: [0, 0, 0, 20] },

      // ── KPI tiles (latest period) ──
      { text: `MOST RECENT PERIOD — ${periods[periods.length - 1]}`.toUpperCase(), fontSize: 8, bold: true, color: C.muted, characterSpacing: 0.8, margin: [0, 0, 0, 10] },
      {
        columns: [
          kpiTile('Net Operating Income', fmt$(latestKf['noi']?.annualTotal ?? null),        'Annual NOI'),
          kpiTile('Total Revenue',        fmt$(latestKf['total_revenue']?.annualTotal ?? null), 'Annual revenue'),
          kpiTile('Op. Expense Ratio',    fmtPct(oerVal), 'Target: below 55%', kpiColor('oer', oerVal)),
          kpiTile('Vacancy Rate',         fmtPct(vacVal), 'Target: below 7%',  kpiColor('vacancy', vacVal)),
        ],
        columnGap: 16,
        margin: [0, 0, 0, 24],
      },

      // ── Multi-period table ──
      { text: 'MULTI-PERIOD FINANCIAL SUMMARY', fontSize: 8, bold: true, color: C.muted, characterSpacing: 0.8, margin: [0, 0, 0, 10] },
      {
        table: { widths: colWidths, body: tableBody },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
          hLineColor: (i: number, node: { table: { body: unknown[] } }) =>
            i === 1 || i === node.table.body.length ? C.black : C.border,
          vLineWidth: () => 0,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        margin: [0, 0, 0, 24],
      },

      // ── Management commentary ──
      ...(summaryText ? [
        { text: 'MANAGEMENT COMMENTARY', fontSize: 8, bold: true, color: C.muted, characterSpacing: 0.8, margin: [0, 0, 0, 8] },
        { stack: mdToPdfContent(summaryText), margin: [12, 0, 0, 0] },
      ] : []),
    ],
  };

  const filename = `${property.name} - ${periodRange}.pdf`.replace(/[/\\?%*:|"<>]/g, '-');
  await renderAndDownload(docDef, filename);
}

// ── pdfmake renderer ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderAndDownload(docDef: any, filename: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfMake = (await import('pdfmake/build/pdfmake')) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfFonts = (await import('pdfmake/build/vfs_fonts' as any)) as any;
  const instance = pdfMake.default ?? pdfMake;
  instance.vfs = (pdfFonts.default ?? pdfFonts)?.pdfMake?.vfs ?? pdfFonts;
  instance.createPdf(docDef).download(filename);
}
