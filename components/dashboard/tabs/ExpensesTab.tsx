'use client';

import type { AnalysisResult } from '@/lib/models/statement';
import PlotlyChart from '@/components/charts/PlotlyChart';
import {
  expenseBreakdownDonut,
  controllableVsNoncontrollable,
  expenseHeatmap,
  cashflowVsNetIncome,
} from '@/components/charts/chart-builders';

interface ExpensesTabProps {
  analysis: AnalysisResult;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function ExpensesTab({ analysis }: ExpensesTabProps) {
  const { statement } = analysis;

  const chart1 = expenseBreakdownDonut(statement);
  const chart2 = controllableVsNoncontrollable(statement);
  const chart3 = expenseHeatmap(statement);
  const chart4 = cashflowVsNetIncome(statement);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Annual Expense Breakdown" subtitle="Distribution of operating costs by category">
          <PlotlyChart data={chart1.data} layout={{ ...chart1.layout, title: undefined }} style={{ height: 310 }} />
        </ChartCard>
        <ChartCard title="Controllable vs Non-Controllable" subtitle="Monthly split between manageable and fixed costs">
          <PlotlyChart data={chart2.data} layout={{ ...chart2.layout, title: undefined }} style={{ height: 310 }} />
        </ChartCard>
      </div>

      {chart3.data.length > 0 && (
        <ChartCard title="Expense Heatmap" subtitle="Color shows deviation from each category's own monthly average — green is below average, red is above average">
          <PlotlyChart
            data={chart3.data}
            layout={{ ...chart3.layout, title: undefined }}
            style={{ height: (chart3.layout as { height?: number }).height ?? 340 }}
          />
        </ChartCard>
      )}

      <ChartCard title="Monthly Net Income vs Cash Flow" subtitle="Monthly comparison — divergence indicates non-cash accounting items or balance sheet movements">
        <PlotlyChart data={chart4.data} layout={{ ...chart4.layout, title: undefined }} style={{ height: 300 }} />
      </ChartCard>
    </div>
  );
}
