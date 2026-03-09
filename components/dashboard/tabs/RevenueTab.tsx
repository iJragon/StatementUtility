'use client';

import type { AnalysisResult } from '@/lib/models/statement';
import PlotlyChart from '@/components/charts/PlotlyChart';
import { revenueVsOpex, vacancyRateBar, noiMarginTrend, revenueWaterfall } from '@/components/charts/chart-builders';

interface RevenueTabProps {
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

export default function RevenueTab({ analysis }: RevenueTabProps) {
  const { statement, ratios } = analysis;

  const chart1 = revenueVsOpex(statement, ratios);
  const chart2 = vacancyRateBar(statement, ratios);
  const chart3 = noiMarginTrend(statement, ratios);
  const chart4 = revenueWaterfall(statement);

  return (
    <div className="space-y-5">
      <ChartCard title="Revenue vs Operating Expenses vs NOI" subtitle="Monthly comparison of top-line income and operating costs">
        <PlotlyChart data={chart1.data} layout={{ ...chart1.layout, title: undefined }} style={{ height: 340 }} />
      </ChartCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Monthly Vacancy Rate" subtitle="Bars above 7% threshold indicate elevated vacancy">
          <PlotlyChart data={chart2.data} layout={{ ...chart2.layout, title: undefined }} style={{ height: 280 }} />
        </ChartCard>
        <ChartCard title="NOI Margin Trend" subtitle="Net Operating Income as % of revenue, vs 40% target">
          <PlotlyChart data={chart3.data} layout={{ ...chart3.layout, title: undefined }} style={{ height: 280 }} />
        </ChartCard>
      </div>

      <ChartCard title="Annual Revenue Waterfall" subtitle="How gross potential rent flows down to effective gross revenue">
        <PlotlyChart data={chart4.data} layout={{ ...chart4.layout, title: undefined }} style={{ height: 320 }} />
      </ChartCard>
    </div>
  );
}
