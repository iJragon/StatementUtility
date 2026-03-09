import type { FinancialStatement, RatioReport, TrendReport } from '@/lib/models/statement';

export const COLORS = {
  revenue:    '#10b981', // emerald
  expense:    '#f43f5e', // rose
  noi:        '#3b82f6', // blue
  payroll:    '#8b5cf6', // violet
  utilities:  '#06b6d4', // cyan
  taxes:      '#f97316', // orange
  good:       '#22c55e',
  bad:        '#ef4444',
  warning:    '#f59e0b',
  neutral:    '#6b7280',
  cashflow:   '#eab308',
  netincome:  '#a855f7',
  concession: '#fb923c',
  mgmt:       '#14b8a6',
  insurance:  '#60a5fa',
  other:      '#94a3b8',
};

const LINE_WIDTH = 2.5;
const MARKER_SIZE = 6;

function fmt(val: number | null | undefined): string {
  if (val === null || val === undefined) return '$0';
  return `$${Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function getMonthlyValues(statement: FinancialStatement, key: string): Array<number | null> {
  const row = statement.keyFigures[key];
  if (!row) return statement.months.map(() => null);
  return statement.months.map(m => row.montlyValues[m] ?? null);
}

// 1. Revenue vs OpEx vs NOI line chart
export function revenueVsOpex(statement: FinancialStatement, _ratios: RatioReport) {
  const months = statement.months;
  const revenue = getMonthlyValues(statement, 'total_revenue');
  const opex = getMonthlyValues(statement, 'total_operating_expenses');
  const noi = getMonthlyValues(statement, 'noi');

  const data: Plotly.Data[] = [
    {
      x: months,
      y: revenue,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Total Revenue',
      line: { color: COLORS.revenue, width: LINE_WIDTH, shape: 'spline', smoothing: 0.4 },
      marker: { size: MARKER_SIZE, color: COLORS.revenue },
      hovertemplate: '<b>Revenue</b>: %{y:$,.0f}<extra></extra>',
    },
    {
      x: months,
      y: opex.map(v => (v !== null ? Math.abs(v) : null)),
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Total OpEx',
      line: { color: COLORS.expense, width: LINE_WIDTH, shape: 'spline', smoothing: 0.4 },
      marker: { size: MARKER_SIZE, color: COLORS.expense },
      hovertemplate: '<b>OpEx</b>: %{y:$,.0f}<extra></extra>',
    },
    {
      x: months,
      y: noi,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'NOI',
      line: { color: COLORS.noi, width: LINE_WIDTH, shape: 'spline', smoothing: 0.4 },
      marker: { size: MARKER_SIZE, color: COLORS.noi },
      hovertemplate: '<b>NOI</b>: %{y:$,.0f}<extra></extra>',
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Revenue vs Operating Expenses vs NOI' },
    yaxis: { tickformat: '$,.0f' },
    hovermode: 'x unified',
  };

  return { data, layout };
}

// 2. Expense breakdown donut
export function expenseBreakdownDonut(statement: FinancialStatement) {
  const expenseKeys = [
    { key: 'total_payroll',       label: 'Payroll',      color: COLORS.payroll },
    { key: 'utilities',           label: 'Utilities',    color: COLORS.utilities },
    { key: 'real_estate_taxes',   label: 'RE Taxes',     color: COLORS.taxes },
    { key: 'insurance',           label: 'Insurance',    color: COLORS.insurance },
    { key: 'management_fees',     label: 'Mgmt Fees',    color: COLORS.mgmt },
    { key: 'replacement_expense', label: 'Replacement',  color: COLORS.other },
  ];

  const labels: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];

  for (const { key, label, color } of expenseKeys) {
    const row = statement.keyFigures[key];
    if (row && row.annualTotal !== null && Math.abs(row.annualTotal) > 0) {
      labels.push(label);
      values.push(Math.abs(row.annualTotal));
      colors.push(color);
    }
  }

  const data: Plotly.Data[] = [
    {
      type: 'pie',
      labels,
      values,
      hole: 0.45,
      marker: { colors, line: { color: 'transparent', width: 1 } },
      textinfo: 'label+percent',
      textfont: { size: 11 },
      hovertemplate: '<b>%{label}</b><br>%{value:$,.0f} (%{percent})<extra></extra>',
      pull: labels.map(() => 0.02),
    } as Plotly.Data,
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Annual Expense Breakdown' },
    showlegend: false,
    margin: { t: 48, b: 16, l: 16, r: 16 },
  };

  return { data, layout };
}

// 3. Controllable vs Non-Controllable stacked bar
export function controllableVsNoncontrollable(statement: FinancialStatement) {
  const months = statement.months;
  const controllable = getMonthlyValues(statement, 'controllable_expenses');
  const nonControllable = getMonthlyValues(statement, 'non_controllable_expenses');

  const data: Plotly.Data[] = [
    {
      x: months,
      y: controllable.map(v => (v !== null ? Math.abs(v) : null)),
      type: 'bar',
      name: 'Controllable',
      marker: { color: COLORS.expense, opacity: 0.85 },
      hovertemplate: '<b>Controllable</b>: %{y:$,.0f}<extra></extra>',
    },
    {
      x: months,
      y: nonControllable.map(v => (v !== null ? Math.abs(v) : null)),
      type: 'bar',
      name: 'Non-Controllable',
      marker: { color: COLORS.warning, opacity: 0.85 },
      hovertemplate: '<b>Non-Controllable</b>: %{y:$,.0f}<extra></extra>',
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Controllable vs Non-Controllable Expenses' },
    barmode: 'stack',
    yaxis: { tickformat: '$,.0f' },
    hovermode: 'x unified',
  };

  return { data, layout };
}

// 4. Vacancy rate bar with 7% benchmark
export function vacancyRateBar(statement: FinancialStatement, ratios: RatioReport) {
  const months = statement.months;
  const vacancyPcts = months.map(m => ratios.vacancyRate.monthly[m] ?? null);

  const data: Plotly.Data[] = [
    {
      x: months,
      y: vacancyPcts,
      type: 'bar',
      name: 'Vacancy Rate',
      marker: {
        color: vacancyPcts.map(v => {
          if (v === null) return COLORS.neutral;
          return v <= 7 ? `${COLORS.good}cc` : `${COLORS.bad}cc`;
        }),
        line: {
          color: vacancyPcts.map(v => {
            if (v === null) return COLORS.neutral;
            return v <= 7 ? COLORS.good : COLORS.bad;
          }),
          width: 1,
        },
      },
      hovertemplate: '<b>Vacancy</b>: %{y:.1f}%<extra></extra>',
    },
    {
      x: months,
      y: months.map(() => 7),
      type: 'scatter',
      mode: 'lines',
      name: '7% Benchmark',
      line: { color: COLORS.bad, width: 1.5, dash: 'dash' },
      hoverinfo: 'skip',
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Monthly Vacancy Rate' },
    yaxis: { tickformat: '.1f', ticksuffix: '%' },
  };

  return { data, layout };
}

// 5. NOI Margin trend area chart with 40% target
export function noiMarginTrend(statement: FinancialStatement, ratios: RatioReport) {
  const months = statement.months;
  const noiMargins = months.map(m => ratios.noiMargin.monthly[m] ?? null);

  const data: Plotly.Data[] = [
    {
      x: months,
      y: noiMargins,
      type: 'scatter',
      mode: 'lines',
      fill: 'tozeroy',
      name: 'NOI Margin',
      line: { color: COLORS.noi, width: LINE_WIDTH, shape: 'spline', smoothing: 0.4 },
      fillcolor: `${COLORS.noi}26`,
      hovertemplate: '<b>NOI Margin</b>: %{y:.1f}%<extra></extra>',
    },
    {
      x: months,
      y: months.map(() => 40),
      type: 'scatter',
      mode: 'lines',
      name: '40% Target',
      line: { color: COLORS.good, width: 1.5, dash: 'dot' },
      hoverinfo: 'skip',
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'NOI Margin Trend' },
    yaxis: { tickformat: '.1f', ticksuffix: '%' },
  };

  return { data, layout };
}

// 6. Cash flow vs net income grouped bar
export function cashflowVsNetIncome(statement: FinancialStatement) {
  const months = statement.months;
  const cashflow = getMonthlyValues(statement, 'cash_flow');
  const netIncome = getMonthlyValues(statement, 'net_income');

  const data: Plotly.Data[] = [
    {
      x: months,
      y: cashflow,
      type: 'bar',
      name: 'Cash Flow',
      marker: { color: COLORS.cashflow, opacity: 0.85 },
      hovertemplate: '<b>Cash Flow</b>: %{y:$,.0f}<extra></extra>',
    },
    {
      x: months,
      y: netIncome,
      type: 'bar',
      name: 'Net Income',
      marker: { color: COLORS.netincome, opacity: 0.85 },
      hovertemplate: '<b>Net Income</b>: %{y:$,.0f}<extra></extra>',
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Cash Flow vs Net Income' },
    barmode: 'group',
    yaxis: { tickformat: '$,.0f' },
    hovermode: 'x unified',
  };

  return { data, layout };
}

// 7. KPI gauge
export function kpiGauge(label: string, value: number | null, lo: number, hi: number, unit: string) {
  const displayVal = value !== null ? value : 0;
  const suffix = unit === '%' ? '%' : unit === 'x' ? 'x' : '';
  const maxVal = unit === 'x' ? Math.max(hi * 1.5, (value ?? 0) * 1.3, 3) : 100;

  // Determine health color
  let barColor = '#6b7280';
  if (value !== null) {
    const inRange = value >= lo && value <= hi;
    const slightlyOut = unit === 'x'
      ? value >= lo * 0.8
      : Math.abs(value - (lo + hi) / 2) < (hi - lo) * 0.75;
    barColor = inRange ? COLORS.good : slightlyOut ? COLORS.warning : COLORS.bad;
  }

  const data: Plotly.Data[] = [
    {
      type: 'indicator',
      mode: 'gauge+number',
      value: displayVal,
      number: {
        suffix,
        valueformat: unit === 'x' ? '.2f' : '.1f',
        font: { size: 22 },
      },
      title: { text: label, font: { size: 12 } },
      gauge: {
        axis: {
          range: [0, maxVal],
          tickformat: unit === 'x' ? '.1f' : '.0f',
          ticksuffix: suffix,
          tickfont: { size: 10 },
          nticks: 5,
        },
        bar: { color: barColor, thickness: 0.6 },
        bgcolor: 'transparent',
        borderwidth: 0,
        steps: [
          { range: [0, lo],     color: 'rgba(100,116,139,0.08)' },
          { range: [lo, hi],    color: 'rgba(34,197,94,0.12)' },
          { range: [hi, maxVal], color: 'rgba(100,116,139,0.08)' },
        ],
        threshold: {
          line: { color: COLORS.bad, width: 2 },
          thickness: 0.8,
          value: hi,
        },
      },
    } as Plotly.Data,
  ];

  const layout: Partial<Plotly.Layout> = {
    margin: { t: 40, b: 16, l: 24, r: 24 },
    height: 200,
  };

  return { data, layout };
}

// 8. Expense heatmap
export function expenseHeatmap(statement: FinancialStatement) {
  const months = statement.months;
  const expenseRows = statement.allRows.filter(row => {
    if (row.isHeader) return false;
    const vals = months.map(m => row.montlyValues[m]).filter(v => v !== null && v !== undefined);
    if (vals.length === 0) return false;
    const avg = vals.reduce((a, b) => a + (b ?? 0), 0) / vals.length;
    return avg < 0 || row.label.toLowerCase().includes('expense') || row.label.toLowerCase().includes('cost');
  }).slice(0, 14);

  if (expenseRows.length === 0) return { data: [], layout: {} };

  const z = expenseRows.map(row =>
    months.map(m => {
      const v = row.montlyValues[m];
      return v !== null && v !== undefined ? Math.abs(v) : 0;
    })
  );

  const data: Plotly.Data[] = [
    {
      type: 'heatmap',
      x: months,
      y: expenseRows.map(r => r.label.length > 28 ? r.label.substring(0, 28) + '…' : r.label),
      z,
      colorscale: [
        [0,   'rgba(59,130,246,0.05)'],
        [0.3, 'rgba(245,158,11,0.4)'],
        [0.7, 'rgba(249,115,22,0.7)'],
        [1,   'rgba(239,68,68,0.9)'],
      ],
      showscale: true,
      hovertemplate: '<b>%{y}</b><br>%{x}: $%{z:,.0f}<extra></extra>',
      colorbar: {
        tickformat: '$,.0f',
        thickness: 12,
        len: 0.8,
        tickfont: { size: 10 },
      },
    } as Plotly.Data,
  ];

  const rowHeight = Math.max(200, expenseRows.length * 26 + 80);
  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Expense Heatmap by Month' },
    margin: { l: 180, r: 80, t: 48, b: 56 },
    height: rowHeight,
  };

  return { data, layout };
}

// 9. Revenue waterfall
export function revenueWaterfall(statement: FinancialStatement) {
  const gpr       = statement.keyFigures['gross_potential_rent']?.annualTotal ?? 0;
  const vacancy   = statement.keyFigures['vacancy_loss']?.annualTotal ?? 0;
  const concession = statement.keyFigures['concession_loss']?.annualTotal ?? 0;
  const badDebt   = statement.keyFigures['bad_debt']?.annualTotal ?? 0;
  const other     = statement.keyFigures['other_tenant_charges']?.annualTotal ?? 0;
  const totalRev  = statement.keyFigures['total_revenue']?.annualTotal ?? 0;

  const items = [
    { label: 'Gross Potential Rent', value: Math.abs(gpr),       measure: 'absolute' },
    { label: 'Vacancy Loss',         value: -Math.abs(vacancy),  measure: 'relative' },
    { label: 'Concession Loss',      value: -Math.abs(concession), measure: 'relative' },
    { label: 'Bad Debt',             value: -Math.abs(badDebt),  measure: 'relative' },
    { label: 'Other Revenue',        value: Math.abs(other),     measure: 'relative' },
    { label: 'Total Revenue',        value: Math.abs(totalRev),  measure: 'total' },
  ].filter((_, i) => i === 0 || i === 5 || Math.abs([gpr,vacancy,concession,badDebt,other,totalRev][i]) > 0);

  const data: Plotly.Data[] = [
    {
      type: 'waterfall',
      x: items.map(i => i.label),
      y: items.map(i => i.value),
      measure: items.map(i => i.measure) as string[],
      connector: { line: { color: 'rgba(100,116,139,0.3)', width: 1 } },
      increasing:  { marker: { color: `${COLORS.good}cc` } },
      decreasing:  { marker: { color: `${COLORS.bad}cc` } },
      totals:      { marker: { color: `${COLORS.noi}cc` } },
      hovertemplate: '<b>%{x}</b>: %{y:$,.0f}<extra></extra>',
      texttemplate: '%{y:$,.0f}',
      textposition: 'inside',
      insidetextanchor: 'middle',
    } as Plotly.Data,
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Annual Revenue Waterfall' },
    yaxis: { tickformat: '$,.0f' },
    margin: { l: 64, r: 24, t: 48, b: 80 },
  };

  return { data, layout };
}

// 10. Trend comparison multi-line
export function trendComparison(trends: TrendReport, selectedMetrics: string[]) {
  const selected = trends.series.filter(s => selectedMetrics.includes(s.metric));
  const allMonths = selected.length > 0 ? Object.keys(selected[0].values) : [];

  const palette = [
    COLORS.revenue, COLORS.expense, COLORS.noi, COLORS.cashflow,
    COLORS.payroll, COLORS.utilities, COLORS.taxes, COLORS.mgmt,
    COLORS.netincome, COLORS.neutral,
  ];

  const data: Plotly.Data[] = selected.map((series, i) => ({
    x: allMonths,
    y: allMonths.map(m => series.values[m] ?? null),
    type: 'scatter',
    mode: 'lines+markers',
    name: series.label,
    line: { color: palette[i % palette.length], width: LINE_WIDTH, shape: 'spline', smoothing: 0.4 },
    marker: { size: MARKER_SIZE, color: palette[i % palette.length] },
    hovertemplate: `<b>${series.label}</b>: %{y:$,.0f}<extra></extra>`,
  }));

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Trend Comparison' },
    yaxis: { tickformat: '$,.0f' },
    hovermode: 'x unified',
  };

  return { data, layout };
}

// Build Plotly figure from VizAgent ChartSpec
export function buildFromSpec(
  spec: { chartType: string; traces: Array<{ dataRef: string; label: string; chartType?: string }>; yaxisFormat: string },
  statement: FinancialStatement,
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const months = statement.months;
  const palette = [
    COLORS.noi, COLORS.revenue, COLORS.expense, COLORS.cashflow,
    COLORS.payroll, COLORS.utilities, COLORS.taxes, COLORS.mgmt,
    COLORS.netincome, COLORS.neutral,
  ];

  if (spec.chartType === 'pie') {
    const labels: string[] = [];
    const values: number[] = [];
    const colors: string[] = [];

    spec.traces.forEach((trace, i) => {
      const row = statement.keyFigures[trace.dataRef]
        ?? statement.allRows.find(r => r.label === trace.dataRef);
      if (row && row.annualTotal !== null) {
        labels.push(trace.label);
        values.push(Math.abs(row.annualTotal));
        colors.push(palette[i % palette.length]);
      }
    });

    const data: Plotly.Data[] = [{ type: 'pie', labels, values, hole: 0.4, marker: { colors } } as Plotly.Data];
    return { data, layout: { showlegend: true } };
  }

  const data: Plotly.Data[] = spec.traces.map((trace, i) => {
    const row = statement.keyFigures[trace.dataRef]
      ?? statement.allRows.find(r => r.label === trace.dataRef);
    const y = row ? months.map(m => row.montlyValues[m] ?? null) : months.map(() => null);
    const traceType = (trace.chartType || spec.chartType) as string;
    const c = palette[i % palette.length];

    if (traceType === 'bar') {
      return { x: months, y, type: 'bar', name: trace.label, marker: { color: c, opacity: 0.85 } } as Plotly.Data;
    }
    return {
      x: months, y, type: 'scatter',
      mode: 'lines+markers',
      fill: traceType === 'area' ? 'tozeroy' : 'none',
      name: trace.label,
      line: { color: c, width: LINE_WIDTH, shape: 'spline', smoothing: 0.4 },
      fillcolor: traceType === 'area' ? `${c}26` : undefined,
      marker: { size: MARKER_SIZE, color: c },
    } as Plotly.Data;
  });

  const yFormat = spec.yaxisFormat === '$' ? '$,.0f' : spec.yaxisFormat === '%' ? '.1f' : '';
  const ySuffix = spec.yaxisFormat === '%' ? '%' : spec.yaxisFormat === 'x' ? 'x' : '';

  return {
    data,
    layout: {
      yaxis: { tickformat: yFormat, ticksuffix: ySuffix },
      hovermode: 'x unified',
      barmode: 'group',
    },
  };
}
