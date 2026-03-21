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

function fmtPct(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined) return 'N/A';
  return `${val.toFixed(decimals)}%`;
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

// ── Markdown to HTML (light parser for AI narrative) ─────────────────────────

function markdownToHtml(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const parts: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { parts.push('<br>'); continue; }

    if (line.startsWith('## ') || line.startsWith('# ')) {
      const heading = line.replace(/^#+\s*/, '');
      parts.push(`<h4 style="margin:1.2em 0 0.3em;font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">${heading}</h4>`);
    } else {
      const html = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      parts.push(`<p style="margin:0 0 0.6em;line-height:1.7;">${html}</p>`);
    }
  }
  return parts.join('\n');
}

// ── Shared CSS ────────────────────────────────────────────────────────────────

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 10pt;
    color: #1a1a1a;
    background: #fff;
    padding: 48px 56px;
    max-width: 900px;
    margin: 0 auto;
  }
  .report-header { border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .report-header .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; font-family: Arial, sans-serif; margin-bottom: 6px; }
  .report-header h1 { font-size: 20pt; font-weight: 700; margin-bottom: 10px; line-height: 1.2; }
  .report-header .meta { display: flex; gap: 24px; flex-wrap: wrap; font-family: Arial, sans-serif; font-size: 8.5pt; color: #6b7280; }
  .report-header .meta span strong { color: #374151; }
  .section-label { font-family: Arial, sans-serif; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin: 28px 0 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  .kpi-tile { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; text-align: center; }
  .kpi-tile .kpi-label { font-family: Arial, sans-serif; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 6px; }
  .kpi-tile .kpi-value { font-size: 15pt; font-weight: 700; }
  .kpi-tile .kpi-sub { font-family: Arial, sans-serif; font-size: 7pt; color: #9ca3af; margin-top: 3px; }
  .color-good { color: #16a34a; }
  .color-warn { color: #d97706; }
  .color-bad  { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9pt; }
  table thead th { font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; padding-bottom: 8px; border-bottom: 2px solid #1a1a1a; }
  table thead th:not(:first-child) { text-align: right; }
  table tbody td { padding: 6px 0; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
  table tbody td:not(:first-child) { text-align: right; font-family: 'Courier New', monospace; font-size: 9pt; }
  .row-bold td { font-weight: 700; color: #1a1a1a; }
  .row-sub td:first-child { padding-left: 18px; color: #6b7280; }
  .row-neg td:not(:first-child) { color: #dc2626; }
  .row-pos td:not(:first-child) { color: #16a34a; }
  .narrative { border-left: 3px solid #e5e7eb; padding-left: 18px; font-size: 10pt; line-height: 1.7; margin-top: 4px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-family: Arial, sans-serif; font-size: 7.5pt; color: #9ca3af; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 0; }
    @page { margin: 1.5cm 2cm; size: A4; }
  }
`;

// ── Single-Analysis Report ────────────────────────────────────────────────────

export function generateSummaryHTML(analysis: AnalysisResult, summaryText: string): string {
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

  function incomeRow(label: string, val: number | null, indent: boolean, isDeduction: boolean, bold: boolean): string {
    const display = isDeduction && val !== null && val > 0 ? -val : val;
    const pct = pctOf(val, totalRev);
    const isNeg = display !== null && display < 0;
    const cls = [bold ? 'row-bold' : '', indent ? 'row-sub' : ''].filter(Boolean).join(' ');
    return `
      <tr class="${cls}">
        <td>${label}</td>
        <td>${display !== null ? fmtFull(display) : 'N/A'}</td>
        <td style="color:#9ca3af;">${pct}</td>
      </tr>`;
  }

  function kpiStatus(metric: string, val: number | null): string {
    if (val === null) return '';
    if (metric === 'oer') return val < 65 ? 'color-good' : val < 75 ? 'color-warn' : 'color-bad';
    if (metric === 'vacancy') return val < 7 ? 'color-good' : val < 12 ? 'color-warn' : 'color-bad';
    if (metric === 'noi') return val > 45 ? 'color-good' : val > 30 ? 'color-warn' : 'color-bad';
    if (metric === 'dscr') return val >= 1.25 ? 'color-good' : val >= 1.0 ? 'color-warn' : 'color-bad';
    return '';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Executive Summary — ${statement.propertyName}</title>
  <style>${CSS}</style>
</head>
<body>

  <div class="report-header">
    <div class="label">Executive Summary</div>
    <h1>${statement.propertyName || 'Property P&amp;L Analysis'}</h1>
    <div class="meta">
      <span><strong>Reporting Period:</strong> ${statement.period}</span>
      <span><strong>Book Type:</strong> ${statement.bookType || 'Accrual'}</span>
      <span><strong>Date Prepared:</strong> ${reportDate}</span>
      <span><strong>Source:</strong> ${analysis.fileName}</span>
    </div>
  </div>

  <div class="section-label">Key Performance Indicators</div>
  <div class="kpi-grid">
    <div class="kpi-tile">
      <div class="kpi-label">NOI Margin</div>
      <div class="kpi-value ${kpiStatus('noi', noiMargin)}">${fmtPct(noiMargin)}</div>
      <div class="kpi-sub">Target: 45%+</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Op. Expense Ratio</div>
      <div class="kpi-value ${kpiStatus('oer', oer)}">${fmtPct(oer)}</div>
      <div class="kpi-sub">Target: below 55%</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Vacancy Rate</div>
      <div class="kpi-value ${kpiStatus('vacancy', vacancy)}">${fmtPct(vacancy)}</div>
      <div class="kpi-sub">Target: below 7%</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Debt Svc Coverage</div>
      <div class="kpi-value ${kpiStatus('dscr', dscr)}">${dscr !== null ? `${dscr.toFixed(2)}x` : 'N/A'}</div>
      <div class="kpi-sub">Lender min: 1.25x</div>
    </div>
  </div>

  <div class="section-label">Statement of Operations — Annual</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Line Item</th>
        <th>Amount</th>
        <th style="min-width:60px;">% Rev</th>
      </tr>
    </thead>
    <tbody>
      ${incomeRow('Gross Potential Rent', gpr, false, false, true)}
      ${vacLoss  !== null ? incomeRow('Less: Vacancy Loss',    vacLoss,  true, true, false) : ''}
      ${concLoss !== null ? incomeRow('Less: Concession Loss', concLoss, true, true, false) : ''}
      ${badDebt  !== null ? incomeRow('Less: Bad Debt',        badDebt,  true, true, false) : ''}
      <tr style="border-top:1px solid #9ca3af;"><td colspan="3" style="padding:0;height:1px;"></td></tr>
      ${incomeRow('Net Rental Revenue', netRental, false, false, true)}
      ${otherChg !== null ? incomeRow('Other Tenant Charges', otherChg, true, false, false) : ''}
      <tr style="border-top:1px solid #9ca3af;"><td colspan="3" style="padding:0;height:1px;"></td></tr>
      ${incomeRow('Total Revenue', totalRev, false, false, true)}
      <tr style="border-top:1px solid #9ca3af;"><td colspan="3" style="padding:0;height:1px;"></td></tr>
      ${ctrlExp    !== null ? incomeRow('Controllable Expenses',     ctrlExp,    true, true, false) : ''}
      ${nonCtrlExp !== null ? incomeRow('Non-Controllable Expenses', nonCtrlExp, true, true, false) : ''}
      ${incomeRow('Total Operating Expenses', totalOpEx, false, true, true)}
      <tr style="border-top:1px solid #9ca3af;"><td colspan="3" style="padding:0;height:1px;"></td></tr>
      ${incomeRow('Net Operating Income', noi, false, false, true)}
      ${finExp    !== null ? incomeRow('Financial Expense / Debt Service', finExp, true, true, false) : ''}
      ${netIncome !== null ? `<tr style="border-top:1px solid #9ca3af;"><td colspan="3" style="padding:0;height:1px;"></td></tr>${incomeRow('Net Income', netIncome, false, false, true)}` : ''}
      ${cashFlow  !== null ? incomeRow('Cash Flow', cashFlow, false, false, false) : ''}
    </tbody>
  </table>

  ${summaryText ? `
  <div class="section-label" style="margin-top:32px;">AI Narrative</div>
  <div class="narrative">${markdownToHtml(summaryText)}</div>
  ` : ''}

  <div class="footer">
    <span>Estatelytics &mdash; Confidential</span>
    <span>Generated ${reportDate}</span>
  </div>

</body>
</html>`;
}

// ── Multi-Period Portfolio Report ─────────────────────────────────────────────

export function generatePortfolioHTML(
  property: PropertyDetail,
  analyses: AnalysisResult[],
  periods: string[],
  summaryText: string,
): string {
  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const periodRange = periods.length >= 2 ? `${periods[0]} to ${periods[periods.length - 1]}` : periods[0] || '';

  const latest = analyses[analyses.length - 1];
  const latestKf = latest.statement.keyFigures;
  const latestRatios = latest.ratios;

  const rows: Array<{ label: string; key: string; isDeduction?: boolean; bold?: boolean }> = [
    { label: 'Total Revenue',            key: 'total_revenue',            bold: true },
    { label: 'Total Operating Expenses', key: 'total_operating_expenses',  isDeduction: true },
    { label: 'Net Operating Income',     key: 'noi',                       bold: true },
    { label: 'Net Income',               key: 'net_income' },
    { label: 'Cash Flow',                key: 'cash_flow' },
  ];

  const tableRows = rows.map(row => {
    const values = analyses.map(a => a.statement.keyFigures[row.key]?.annualTotal ?? null);
    if (values.every(v => v === null)) return '';

    const lastVal = values[values.length - 1];
    const prevVal = values.length >= 2 ? values[values.length - 2] : null;
    const chg = pctChange(prevVal, lastVal);
    const chgNum = prevVal !== null && lastVal !== null && prevVal !== 0
      ? ((lastVal - prevVal) / Math.abs(prevVal)) * 100 : null;

    const cells = values.map(val => {
      const display = row.isDeduction && val !== null && val > 0 ? -val : val;
      return `<td>${display !== null ? fmt$(display) : 'N/A'}</td>`;
    }).join('');

    const chgColor = chgNum === null ? '#9ca3af' : chgNum >= 0 ? '#16a34a' : '#dc2626';
    const chgCell = analyses.length >= 2
      ? `<td style="color:${chgColor};">${chg || 'N/A'}</td>`
      : '';

    return `<tr class="${row.bold ? 'row-bold' : ''}">
      <td>${row.label}</td>
      ${cells}
      ${chgCell}
    </tr>`;
  }).join('');

  const ratioRows = [
    { label: 'NOI Margin',              values: analyses.map(a => a.ratios.noiMargin?.value ?? null), lowerIsBetter: false },
    { label: 'Op. Expense Ratio (OER)', values: analyses.map(a => a.ratios.oer?.value ?? null),       lowerIsBetter: true },
    { label: 'Vacancy Rate',            values: analyses.map(a => a.ratios.vacancyRate?.value ?? null), lowerIsBetter: true },
  ].map(row => {
    const lastVal = row.values[row.values.length - 1];
    const prevVal = row.values.length >= 2 ? row.values[row.values.length - 2] : null;
    const chg = pctChange(prevVal, lastVal);
    const chgNum = prevVal !== null && lastVal !== null && prevVal !== 0
      ? ((lastVal - prevVal) / Math.abs(prevVal)) * 100 : null;
    const chgColor = chgNum === null ? '#9ca3af'
      : (row.lowerIsBetter ? chgNum < 0 : chgNum > 0) ? '#16a34a' : '#dc2626';

    const cells = row.values.map(v =>
      `<td style="color:#6b7280;">${v !== null ? `${v.toFixed(1)}%` : 'N/A'}</td>`
    ).join('');
    const chgCell = analyses.length >= 2
      ? `<td style="color:${chgColor};">${chg || 'N/A'}</td>` : '';

    return `<tr><td style="color:#6b7280;">${row.label}</td>${cells}${chgCell}</tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Property Overview — ${property.name}</title>
  <style>${CSS}</style>
</head>
<body>

  <div class="report-header">
    <div class="label">Property Overview</div>
    <h1>${property.name}</h1>
    <div class="meta">
      <span><strong>Reporting Period:</strong> ${periodRange}</span>
      <span><strong>Statements:</strong> ${analyses.length} period${analyses.length !== 1 ? 's' : ''}</span>
      <span><strong>Date Prepared:</strong> ${reportDate}</span>
    </div>
  </div>

  <div class="section-label">Most Recent Period — ${periods[periods.length - 1]}</div>
  <div class="kpi-grid">
    <div class="kpi-tile">
      <div class="kpi-label">Net Operating Income</div>
      <div class="kpi-value">${fmt$(latestKf['noi']?.annualTotal ?? null)}</div>
      <div class="kpi-sub">Annual NOI</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Total Revenue</div>
      <div class="kpi-value">${fmt$(latestKf['total_revenue']?.annualTotal ?? null)}</div>
      <div class="kpi-sub">Annual revenue</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Op. Expense Ratio</div>
      <div class="kpi-value ${latestRatios.oer?.value !== null && latestRatios.oer?.value < 65 ? 'color-good' : 'color-warn'}">${fmtPct(latestRatios.oer?.value)}</div>
      <div class="kpi-sub">Target: below 55%</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Vacancy Rate</div>
      <div class="kpi-value ${latestRatios.vacancyRate?.value !== null && latestRatios.vacancyRate?.value < 7 ? 'color-good' : 'color-warn'}">${fmtPct(latestRatios.vacancyRate?.value)}</div>
      <div class="kpi-sub">Target: below 7%</div>
    </div>
  </div>

  <div class="section-label">Multi-Period Financial Summary</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Line Item</th>
        ${periods.map(p => `<th>${p}</th>`).join('')}
        ${analyses.length >= 2 ? '<th>Chg</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      ${ratioRows}
    </tbody>
  </table>

  ${summaryText ? `
  <div class="section-label" style="margin-top:32px;">Management Commentary</div>
  <div class="narrative">${markdownToHtml(summaryText)}</div>
  ` : ''}

  <div class="footer">
    <span>Estatelytics &mdash; Confidential</span>
    <span>Generated ${reportDate}</span>
  </div>

</body>
</html>`;
}

// ── Print helper ──────────────────────────────────────────────────────────────

export function printHTML(html: string, title: string): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.document.title = title;
  // Small delay to let fonts/styles load before triggering print
  setTimeout(() => { win.focus(); win.print(); }, 400);
}
