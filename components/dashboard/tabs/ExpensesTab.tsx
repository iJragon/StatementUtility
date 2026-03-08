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

export default function ExpensesTab({ analysis }: ExpensesTabProps) {
  const { statement } = analysis;

  const chart1 = expenseBreakdownDonut(statement);
  const chart2 = controllableVsNoncontrollable(statement);
  const chart3 = expenseHeatmap(statement);
  const chart4 = cashflowVsNetIncome(statement);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <PlotlyChart data={chart1.data} layout={chart1.layout} style={{ height: 300 }} />
        </div>
        <div className="card">
          <PlotlyChart data={chart2.data} layout={chart2.layout} style={{ height: 300 }} />
        </div>
      </div>
      <div className="card">
        <PlotlyChart data={chart3.data} layout={chart3.layout} style={{ height: 360 }} />
      </div>
      <div className="card">
        <PlotlyChart data={chart4.data} layout={chart4.layout} style={{ height: 280 }} />
      </div>
    </div>
  );
}
