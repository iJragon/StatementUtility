'use client';

import type { ProFormaYear, DealInputs } from '@/lib/models/deal';
import PlotlyChart from '@/components/charts/PlotlyChart';

interface Props {
  proForma: ProFormaYear[];
  inputs: DealInputs;
}

function fmt(n: number, type: 'dollar' | 'pct'): string {
  if (!isFinite(n)) return 'N/A';
  if (type === 'dollar') {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  return `${(n * 100).toFixed(1)}%`;
}

const ROWS: Array<{ label: string; key: keyof ProFormaYear; type: 'dollar' | 'pct'; indent?: boolean; divider?: boolean }> = [
  { label: 'Gross Scheduled Income', key: 'grossScheduledIncome', type: 'dollar' },
  { label: 'Vacancy Loss',           key: 'vacancyLoss',          type: 'dollar', indent: true },
  { label: 'Effective Gross Income', key: 'effectiveGrossIncome', type: 'dollar' },
  { label: 'Other Income',           key: 'otherIncome',          type: 'dollar', indent: true },
  { label: 'Total Income',           key: 'totalIncome',          type: 'dollar', divider: true },
  { label: 'Operating Expenses',     key: 'operatingExpenses',    type: 'dollar', indent: true },
  { label: 'NOI',                    key: 'noi',                  type: 'dollar', divider: true },
  { label: 'Debt Service',           key: 'debtService',          type: 'dollar', indent: true },
  { label: 'Cash Flow Before Tax',   key: 'cashFlowBeforeTax',    type: 'dollar', divider: true },
  { label: 'Principal Paydown',      key: 'principalPaydown',     type: 'dollar', indent: true },
  { label: 'Interest Payment',       key: 'interestPayment',      type: 'dollar', indent: true },
  { label: 'Remaining Loan Bal.',    key: 'remainingLoanBalance', type: 'dollar' },
  { label: 'Depreciation',          key: 'depreciation',         type: 'dollar', indent: true },
  { label: 'Taxable Income',         key: 'taxableIncome',        type: 'dollar' },
  { label: 'Tax Liability',          key: 'taxLiability',         type: 'dollar', indent: true },
  { label: 'After-Tax Cash Flow',    key: 'afterTaxCashFlow',     type: 'dollar', divider: true },
  { label: 'Property Value',         key: 'propertyValue',        type: 'dollar' },
  { label: 'Equity',                 key: 'equity',               type: 'dollar' },
  { label: 'Cash-on-Cash',          key: 'cashOnCash',           type: 'pct' },
  { label: 'Return on Equity',       key: 'returnOnEquity',       type: 'pct' },
];

export default function ProFormaTab({ proForma, inputs }: Props) {
  const years = proForma.map(y => `Yr ${y.year}`);

  // Chart 1: NOI & Cash Flow
  const noiData = proForma.map(y => y.noi);
  const cfbtData = proForma.map(y => y.cashFlowBeforeTax);

  const chart1Data: Plotly.Data[] = [
    {
      type: 'bar',
      name: 'NOI',
      x: years,
      y: noiData,
      marker: { color: 'rgba(37,99,235,0.75)' },
    },
    {
      type: 'bar',
      name: 'Cash Flow Before Tax',
      x: years,
      y: cfbtData,
      marker: {
        color: cfbtData.map(v => v >= 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)'),
      },
    },
  ];

  // Chart 2: Equity Buildup
  const loanBalances = proForma.map(y => y.remainingLoanBalance);
  const equities     = proForma.map(y => y.equity);
  const propValues   = proForma.map(y => y.propertyValue);

  const chart2Data: Plotly.Data[] = [
    {
      type: 'scatter',
      fill: 'tozeroy',
      name: 'Loan Balance',
      x: years,
      y: loanBalances,
      fillcolor: 'rgba(239,68,68,0.2)',
      line: { color: 'rgba(239,68,68,0.6)', width: 1 },
      stackgroup: 'equity',
    },
    {
      type: 'scatter',
      fill: 'tonexty',
      name: 'Equity',
      x: years,
      y: equities,
      fillcolor: 'rgba(34,197,94,0.2)',
      line: { color: 'rgba(34,197,94,0.6)', width: 1 },
      stackgroup: 'equity',
    },
    {
      type: 'scatter',
      name: 'Property Value',
      x: years,
      y: propValues,
      line: { color: 'rgba(37,99,235,0.9)', width: 2, dash: 'dot' },
      mode: 'lines',
    },
  ];

  // Chart 3: Cumulative Four Returns
  let cumCF = 0, cumAmort = 0, cumTaxBenefit = 0;
  const cumCFArr: number[] = [];
  const cumAppArr: number[] = [];
  const cumAmortArr: number[] = [];
  const cumTaxArr: number[] = [];
  const purchasePrice = inputs.purchasePrice;

  proForma.forEach(y => {
    cumCF += y.cashFlowBeforeTax;
    const cumAppreciation = y.propertyValue - purchasePrice;
    cumAmort += y.principalPaydown;
    cumTaxBenefit += Math.max(0, -y.taxableIncome) * (inputs.taxBracket ?? 0.24);

    cumCFArr.push(cumCF);
    cumAppArr.push(Math.max(0, cumAppreciation));
    cumAmortArr.push(cumAmort);
    cumTaxArr.push(cumTaxBenefit);
  });

  const chart3Data: Plotly.Data[] = [
    {
      type: 'bar',
      name: 'Cumulative Cash Flow',
      x: years,
      y: cumCFArr,
      marker: { color: 'rgba(34,197,94,0.75)' },
    },
    {
      type: 'bar',
      name: 'Appreciation',
      x: years,
      y: cumAppArr,
      marker: { color: 'rgba(37,99,235,0.75)' },
    },
    {
      type: 'bar',
      name: 'Amortization',
      x: years,
      y: cumAmortArr,
      marker: { color: 'rgba(168,85,247,0.75)' },
    },
    {
      type: 'bar',
      name: 'Tax Benefit',
      x: years,
      y: cumTaxArr,
      marker: { color: 'rgba(234,179,8,0.75)' },
    },
  ];

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      {/* Charts section */}
      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
            NOI &amp; Cash Flow
          </p>
          <PlotlyChart
            data={chart1Data}
            layout={{
              barmode: 'group',
              title: undefined,
              yaxis: { tickprefix: '$', tickformat: ',.0f' } as Partial<Plotly.LayoutAxis>,
            }}
            style={{ height: 280 }}
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
            Equity Buildup
          </p>
          <PlotlyChart
            data={chart2Data}
            layout={{
              title: undefined,
              yaxis: { tickprefix: '$', tickformat: ',.0f' } as Partial<Plotly.LayoutAxis>,
            }}
            style={{ height: 280 }}
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
            Four Returns (Cumulative)
          </p>
          <PlotlyChart
            data={chart3Data}
            layout={{
              barmode: 'stack',
              title: undefined,
              yaxis: { tickprefix: '$', tickformat: ',.0f' } as Partial<Plotly.LayoutAxis>,
            }}
            style={{ height: 280 }}
          />
        </div>
      </div>

      {/* Pro Forma Table */}
      <div className="p-4 pt-0 overflow-auto">
        <div style={{ minWidth: 900 }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--surface)' }}>
                <th
                  className="text-left py-2 px-3 font-medium sticky left-0"
                  style={{ color: 'var(--muted)', backgroundColor: 'var(--surface)', width: 200, borderBottom: '2px solid var(--border)' }}
                >
                  Metric
                </th>
                {proForma.map(y => (
                  <th
                    key={y.year}
                    className="text-right py-2 px-3 font-medium"
                    style={{ color: 'var(--muted)', borderBottom: '2px solid var(--border)', minWidth: 90 }}
                  >
                    Yr {y.year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr
                  key={row.key}
                  style={{
                    borderTop: row.divider ? '2px solid var(--border)' : '1px solid var(--border)',
                    backgroundColor: row.divider ? 'var(--surface)' : undefined,
                  }}
                >
                  <td
                    className="py-2 px-3 sticky left-0"
                    style={{
                      color: row.indent ? 'var(--muted)' : 'var(--text)',
                      fontWeight: row.divider ? 600 : 400,
                      paddingLeft: row.indent ? '1.5rem' : undefined,
                      backgroundColor: row.divider ? 'var(--surface)' : 'var(--bg)',
                    }}
                  >
                    {row.label}
                  </td>
                  {proForma.map(y => {
                    const val = y[row.key] as number;
                    const isNeg = val < 0;
                    return (
                      <td
                        key={y.year}
                        className="text-right py-2 px-3 font-mono"
                        style={{
                          color: isNeg ? 'var(--danger)' : row.divider ? 'var(--text)' : 'var(--muted)',
                          fontWeight: row.divider ? 600 : 400,
                        }}
                      >
                        {fmt(val, row.type)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
