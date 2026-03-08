import type { FinancialStatement, RatioReport, TrendReport } from '@/lib/models/statement';

export const COLORS = {
  revenue: '#2ECC71',
  expense: '#E74C3C',
  noi: '#3498DB',
  payroll: '#9B59B6',
  utilities: '#1ABC9C',
  taxes: '#E67E22',
  good: '#27AE60',
  bad: '#C0392B',
  warning: '#F39C12',
  neutral: '#95A5A6',
  cashflow: '#F39C12',
  netincome: '#8E44AD',
  concession: '#D35400',
  mgmt: '#16A085',
  insurance: '#2980B9',
  other: '#7F8C8D',
};

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
      line: { color: COLORS.revenue, width: 2 },
      marker: { size: 4 },
    },
    {
      x: months,
      y: opex.map(v => (v !== null ? Math.abs(v) : null)),
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Total OpEx',
      line: { color: COLORS.expense, width: 2 },
      marker: { size: 4 },
    },
    {
      x: months,
      y: noi,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'NOI',
      line: { color: COLORS.noi, width: 2 },
      marker: { size: 4 },
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
    { key: 'total_payroll', label: 'Payroll', color: COLORS.payroll },
    { key: 'utilities', label: 'Utilities', color: COLORS.utilities },
    { key: 'real_estate_taxes', label: 'RE Taxes', color: COLORS.taxes },
    { key: 'insurance', label: 'Insurance', color: COLORS.insurance },
    { key: 'management_fees', label: 'Mgmt Fees', color: COLORS.mgmt },
    { key: 'replacement_expense', label: 'Replacement', color: COLORS.other },
  ];

  const labels: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];

  for (const { key, label, color } of expenseKeys) {
    const row = statement.keyFigures[key];
    if (row && row.annualTotal !== null) {
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
      hole: 0.4,
      marker: { colors },
      textinfo: 'label+percent',
      hovertemplate: '%{label}: $%{value:,.0f} (%{percent})<extra></extra>',
    } as Plotly.Data,
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Annual Expense Breakdown' },
    showlegend: true,
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
      marker: { color: COLORS.expense },
    },
    {
      x: months,
      y: nonControllable.map(v => (v !== null ? Math.abs(v) : null)),
      type: 'bar',
      name: 'Non-Controllable',
      marker: { color: COLORS.warning },
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Controllable vs Non-Controllable Expenses' },
    barmode: 'stack',
    yaxis: { tickformat: '$,.0f' },
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
          return v <= 7 ? COLORS.good : COLORS.bad;
        }),
      },
    },
    {
      x: months,
      y: months.map(() => 7),
      type: 'scatter',
      mode: 'lines',
      name: '7% Benchmark',
      line: { color: COLORS.bad, width: 2, dash: 'dash' },
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Monthly Vacancy Rate' },
    yaxis: { tickformat: '.1f', ticksuffix: '%', title: { text: 'Vacancy Rate' } },
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
      line: { color: COLORS.noi, width: 2 },
      fillcolor: `${COLORS.noi}33`,
    },
    {
      x: months,
      y: months.map(() => 40),
      type: 'scatter',
      mode: 'lines',
      name: '40% Target',
      line: { color: COLORS.good, width: 2, dash: 'dot' },
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'NOI Margin Trend' },
    yaxis: { tickformat: '.1f', ticksuffix: '%', title: { text: 'NOI Margin %' } },
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
      marker: { color: COLORS.cashflow },
    },
    {
      x: months,
      y: netIncome,
      type: 'bar',
      name: 'Net Income',
      marker: { color: COLORS.netincome },
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Cash Flow vs Net Income' },
    barmode: 'group',
    yaxis: { tickformat: '$,.0f' },
  };

  return { data, layout };
}

// 7. KPI gauge
export function kpiGauge(label: string, value: number | null, lo: number, hi: number, unit: string) {
  const displayVal = value !== null ? value : 0;
  const suffix = unit === '%' ? '%' : unit === 'x' ? 'x' : '';
  const maxVal = unit === 'x' ? Math.max(hi * 1.5, (value ?? 0) * 1.2) : 100;

  const data: Plotly.Data[] = [
    {
      type: 'indicator',
      mode: 'gauge+number',
      value: displayVal,
      number: { suffix, valueformat: unit === 'x' ? '.2f' : '.1f' },
      title: { text: label, font: { size: 14 } },
      gauge: {
        axis: {
          range: [0, maxVal],
          tickformat: unit === 'x' ? '.1f' : '.0f',
          ticksuffix: suffix,
        },
        bar: { color: COLORS.noi },
        steps: [
          { range: [0, lo], color: unit === 'x' ? '#fee2e2' : '#dcfce7' },
          { range: [lo, hi], color: unit === 'x' ? '#dcfce7' : '#fef3c7' },
          { range: [hi, maxVal], color: unit === 'x' ? '#dcfce7' : '#fee2e2' },
        ],
        threshold: {
          line: { color: COLORS.bad, width: 3 },
          thickness: 0.75,
          value: hi,
        },
      },
    } as Plotly.Data,
  ];

  const layout: Partial<Plotly.Layout> = {
    margin: { t: 60, b: 20, l: 20, r: 20 },
    height: 200,
  };

  return { data, layout };
}

// 8. Expense heatmap
export function expenseHeatmap(statement: FinancialStatement) {
  const months = statement.months;
  const expenseRows = statement.allRows.filter(row => {
    if (row.isHeader) return false;
    const vals = months.map(m => row.montlyValues[m]).filter(v => v !== null);
    if (vals.length === 0) return false;
    // Only include expense-like rows (mostly negative or labeled as expense)
    const avg = vals.reduce((a, b) => a + (b ?? 0), 0) / vals.length;
    return avg < 0 || row.label.toLowerCase().includes('expense') || row.label.toLowerCase().includes('cost');
  }).slice(0, 15);

  const z = expenseRows.map(row => months.map(m => {
    const v = row.montlyValues[m];
    return v !== null ? Math.abs(v) : 0;
  }));

  const data: Plotly.Data[] = [
    {
      type: 'heatmap',
      x: months,
      y: expenseRows.map(r => r.label.substring(0, 30)),
      z,
      colorscale: 'Reds',
      hovertemplate: '%{y}<br>%{x}: $%{z:,.0f}<extra></extra>',
    } as Plotly.Data,
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Expense Heatmap by Month' },
    margin: { l: 160, r: 20, t: 40, b: 60 },
  };

  return { data, layout };
}

// 9. Revenue waterfall
export function revenueWaterfall(statement: FinancialStatement) {
  const gpr = statement.keyFigures['gross_potential_rent']?.annualTotal ?? 0;
  const vacancy = statement.keyFigures['vacancy_loss']?.annualTotal ?? 0;
  const concession = statement.keyFigures['concession_loss']?.annualTotal ?? 0;
  const badDebt = statement.keyFigures['bad_debt']?.annualTotal ?? 0;
  const other = statement.keyFigures['other_tenant_charges']?.annualTotal ?? 0;
  const totalRev = statement.keyFigures['total_revenue']?.annualTotal ?? 0;

  const data: Plotly.Data[] = [
    {
      type: 'waterfall',
      x: ['Gross Potential Rent', 'Vacancy Loss', 'Concession Loss', 'Bad Debt', 'Other Revenue', 'Total Revenue'],
      y: [
        Math.abs(gpr),
        -Math.abs(vacancy),
        -Math.abs(concession),
        -Math.abs(badDebt),
        Math.abs(other),
        Math.abs(totalRev),
      ],
      measure: ['absolute', 'relative', 'relative', 'relative', 'relative', 'total'],
      connector: { line: { color: COLORS.neutral } },
      increasing: { marker: { color: COLORS.good } },
      decreasing: { marker: { color: COLORS.bad } },
      totals: { marker: { color: COLORS.noi } },
      texttemplate: '%{y:$,.0f}',
      textposition: 'outside',
    } as Plotly.Data,
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Annual Revenue Waterfall' },
    yaxis: { tickformat: '$,.0f' },
  };

  return { data, layout };
}

// 10. Trend comparison multi-line
export function trendComparison(trends: TrendReport, selectedMetrics: string[]) {
  const selected = trends.series.filter(s => selectedMetrics.includes(s.metric));
  const allMonths = selected.length > 0 ? Object.keys(selected[0].values) : [];

  const palette = [COLORS.revenue, COLORS.expense, COLORS.noi, COLORS.cashflow,
    COLORS.payroll, COLORS.utilities, COLORS.taxes, COLORS.mgmt, COLORS.netincome, COLORS.neutral];

  const data: Plotly.Data[] = selected.map((series, i) => ({
    x: allMonths,
    y: allMonths.map(m => series.values[m] ?? null),
    type: 'scatter',
    mode: 'lines+markers',
    name: series.label,
    line: { color: palette[i % palette.length], width: 2 },
    marker: { size: 4 },
  }));

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Trend Comparison' },
    yaxis: { tickformat: '$,.0f' },
    hovermode: 'x unified',
  };

  return { data, layout };
}

// Build Plotly figure from ChartSpec
export function buildFromSpec(
  spec: { chartType: string; traces: Array<{ dataRef: string; label: string; chartType?: string }>; yaxisFormat: string },
  statement: FinancialStatement,
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const months = statement.months;
  const palette = [COLORS.noi, COLORS.revenue, COLORS.expense, COLORS.cashflow,
    COLORS.payroll, COLORS.utilities, COLORS.taxes, COLORS.mgmt, COLORS.netincome, COLORS.neutral];

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

    const data: Plotly.Data[] = [{
      type: 'pie',
      labels,
      values,
      hole: 0.4,
      marker: { colors },
    } as Plotly.Data];

    return { data, layout: { showlegend: true } };
  }

  const data: Plotly.Data[] = spec.traces.map((trace, i) => {
    const row = statement.keyFigures[trace.dataRef]
      ?? statement.allRows.find(r => r.label === trace.dataRef);

    const y = row ? months.map(m => row.montlyValues[m] ?? null) : months.map(() => null);
    const traceType = (trace.chartType || spec.chartType) as string;

    if (traceType === 'bar') {
      return {
        x: months, y, type: 'bar', name: trace.label,
        marker: { color: palette[i % palette.length] },
      } as Plotly.Data;
    }

    return {
      x: months, y, type: 'scatter',
      mode: 'lines+markers',
      fill: traceType === 'area' ? 'tozeroy' : 'none',
      name: trace.label,
      line: { color: palette[i % palette.length], width: 2 },
      fillcolor: traceType === 'area' ? `${palette[i % palette.length]}33` : undefined,
    } as Plotly.Data;
  });

  const yFormat = spec.yaxisFormat === '$' ? '$,.0f'
    : spec.yaxisFormat === '%' ? '.1f' : '';
  const ySuffix = spec.yaxisFormat === '%' ? '%' : spec.yaxisFormat === 'x' ? 'x' : '';

  const layout: Partial<Plotly.Layout> = {
    yaxis: {
      tickformat: yFormat,
      ticksuffix: ySuffix,
    },
    hovermode: 'x unified',
    barmode: 'group',
  };

  return { data, layout };
}
