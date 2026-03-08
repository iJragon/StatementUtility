'use client';

import type { AnalysisResult } from '@/lib/models/statement';
import PlotlyChart from '@/components/charts/PlotlyChart';
import { revenueVsOpex, vacancyRateBar, noiMarginTrend } from '@/components/charts/chart-builders';

interface RevenueTabProps {
  analysis: AnalysisResult;
}

export default function RevenueTab({ analysis }: RevenueTabProps) {
  const { statement, ratios } = analysis;

  const chart1 = revenueVsOpex(statement, ratios);
  const chart2 = vacancyRateBar(statement, ratios);
  const chart3 = noiMarginTrend(statement, ratios);

  return (
    <div className="space-y-6">
      <div className="card">
        <PlotlyChart data={chart1.data} layout={chart1.layout} style={{ height: 320 }} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <PlotlyChart data={chart2.data} layout={chart2.layout} style={{ height: 280 }} />
        </div>
        <div className="card">
          <PlotlyChart data={chart3.data} layout={chart3.layout} style={{ height: 280 }} />
        </div>
      </div>
    </div>
  );
}
