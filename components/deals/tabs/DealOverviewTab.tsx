'use client';

import type { DealMetrics, ScoreBreakdown, DealInputs } from '@/lib/models/deal';

interface Props {
  metrics: DealMetrics;
  score: ScoreBreakdown;
  inputs: DealInputs;
}

function fmt(n: number, type: 'dollar' | 'pct' | 'x' | 'int'): string {
  if (!isFinite(n)) return '—';
  if (type === 'dollar') {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  if (type === 'pct') return `${(n * 100).toFixed(2)}%`;
  if (type === 'x') return `${n.toFixed(2)}x`;
  return n.toFixed(0);
}

const VERDICT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'strong-buy':  { label: 'Strong Buy',   color: '#15803d', bg: '#dcfce7' },
  'buy':         { label: 'Buy',          color: '#16a34a', bg: '#f0fdf4' },
  'conditional': { label: 'Conditional',  color: '#b45309', bg: '#fef3c7' },
  'avoid':       { label: 'Avoid',        color: '#dc2626', bg: '#fee2e2' },
  'strong-avoid':{ label: 'Strong Avoid', color: '#991b1b', bg: '#fecaca' },
  'pass':        { label: 'Avoid',        color: '#dc2626', bg: '#fee2e2' },
  'strong-pass': { label: 'Strong Avoid', color: '#991b1b', bg: '#fecaca' },
};

const FALLBACK_VERDICT = VERDICT_CONFIG['avoid'];

function MetricRow({ label, value, good }: { label: string; value: string; good?: boolean | null }) {
  return (
    <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className="text-sm font-medium"
        style={{ color: good === true ? 'var(--success)' : good === false ? 'var(--danger)' : 'var(--text)' }}
      >
        {value}
      </span>
    </div>
  );
}

function ScoreBar({ label, score, max = 25 }: { label: string; score: number; max?: number }) {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{score}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--border)' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function DealOverviewTab({ metrics: m, score, inputs }: Props) {
  const verdict = VERDICT_CONFIG[score.verdict] ?? FALLBACK_VERDICT;
  const totalInvested = m.totalCashInvested;

  return (
    <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>

      {/* Score Card */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Deal Score</h3>
            <div
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold"
              style={{ backgroundColor: verdict.bg, color: verdict.color }}
            >
              {verdict.label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>{score.total}</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>out of 100</div>
          </div>
        </div>
        <ScoreBar label="Cash Flow" score={score.cashFlowScore} />
        <ScoreBar label="Returns" score={score.returnScore} />
        <ScoreBar label="Safety" score={score.safetyScore} />
        <ScoreBar label="Growth" score={score.growthScore} />
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center">
          <div className="text-xl font-bold" style={{ color: 'var(--text)' }}>{fmt(m.capRate, 'pct')}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Cap Rate</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold" style={{ color: m.cashOnCash >= 0.07 ? 'var(--success)' : m.cashOnCash >= 0.04 ? 'var(--warning)' : 'var(--danger)' }}>
            {fmt(m.cashOnCash, 'pct')}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Cash-on-Cash</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold" style={{ color: m.irr >= 0.12 ? 'var(--success)' : m.irr >= 0.08 ? 'var(--warning)' : 'var(--danger)' }}>
            {fmt(m.irr, 'pct')}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>IRR</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold" style={{ color: m.dscr >= 1.25 ? 'var(--success)' : m.dscr >= 1.0 ? 'var(--warning)' : 'var(--danger)' }}>
            {fmt(m.dscr, 'x')}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>DSCR</div>
        </div>
      </div>

      {/* Income & Expenses */}
      <div className="card">
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Income & Expenses (Year 1)</h4>
        <MetricRow label="Gross Scheduled Income" value={fmt(m.grossScheduledIncome, 'dollar')} />
        <MetricRow label="Vacancy Loss" value={`-${fmt(m.vacancyLoss, 'dollar')}`} good={false} />
        <MetricRow label="Effective Gross Income" value={fmt(m.effectiveGrossIncome, 'dollar')} />
        <MetricRow label="Total Operating Expenses" value={`-${fmt(m.totalOperatingExpenses, 'dollar')}`} good={false} />
        <MetricRow label="Net Operating Income" value={fmt(m.noi, 'dollar')} good={m.noi > 0} />
        <MetricRow label="Operating Expense Ratio" value={fmt(m.operatingExpenseRatio, 'pct')} good={m.operatingExpenseRatio < 0.5} />
      </div>

      {/* Financing */}
      <div className="card">
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Financing</h4>
        <MetricRow label="Loan Amount" value={fmt(m.loanAmount, 'dollar')} />
        <MetricRow label="LTV" value={fmt(m.ltv, 'pct')} good={m.ltv <= 0.80} />
        <MetricRow label="Monthly Payment" value={fmt(m.monthlyPayment, 'dollar')} />
        <MetricRow label="Annual Debt Service" value={fmt(m.annualDebtService, 'dollar')} />
        <MetricRow label="Mortgage Constant" value={fmt(m.mortgageConstant, 'pct')} />
        <MetricRow label="Max Loan (1.25x DSCR)" value={fmt(m.maxLoanAmount, 'dollar')} />
        <MetricRow label="Closing Costs" value={fmt(m.closingCosts, 'dollar')} />
        <MetricRow label="Total Cash Invested" value={fmt(totalInvested, 'dollar')} />
      </div>

      {/* Cash Flow */}
      <div className="card">
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Cash Flow</h4>
        <MetricRow label="Cash Flow Before Tax" value={fmt(m.cashFlowBeforeTax, 'dollar')} good={m.cashFlowBeforeTax > 0} />
        <MetricRow label="After-Tax Cash Flow" value={fmt(m.afterTaxCashFlow, 'dollar')} good={m.afterTaxCashFlow > 0} />
        <MetricRow label="Break-Even Occupancy" value={fmt(m.breakEvenOccupancy, 'pct')} good={m.breakEvenOccupancy < 0.75} />
        <MetricRow label="Annual Depreciation" value={fmt(m.annualDepreciation, 'dollar')} />
        <MetricRow label="Taxable Income" value={fmt(m.taxableIncome, 'dollar')} />
      </div>

      {/* Time Value */}
      <div className="card">
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Time Value & Returns</h4>
        <MetricRow label="NPV" value={fmt(m.npv, 'dollar')} good={m.npv > 0} />
        <MetricRow label="IRR" value={fmt(m.irr, 'pct')} good={m.irr >= 0.12} />
        <MetricRow label="MIRR" value={fmt(m.mirr, 'pct')} good={m.mirr >= 0.10} />
        <MetricRow label="Profitability Index" value={fmt(m.profitabilityIndex, 'x')} good={m.profitabilityIndex > 1} />
        <MetricRow label="Payback Period" value={`${m.paybackPeriod} yr`} good={m.paybackPeriod <= inputs.holdPeriod} />
        <MetricRow label="DCF Value" value={fmt(m.dcfValue, 'dollar')} />
        <MetricRow label="Gross Rent Multiplier" value={fmt(m.grm, 'x')} />
      </div>

      {/* Exit */}
      <div className="card">
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Exit Analysis (Year {inputs.holdPeriod})</h4>
        <MetricRow label="Projected Sale Price" value={fmt(m.projectedSalePrice, 'dollar')} />
        <MetricRow label="Selling Costs" value={`-${fmt(m.sellingCosts, 'dollar')}`} good={false} />
        <MetricRow label="Remaining Loan Balance" value={`-${fmt(m.remainingLoanBalance, 'dollar')}`} good={false} />
        <MetricRow label="Net Reversion (Equity)" value={fmt(m.reversion, 'dollar')} good={m.reversion > 0} />
        <MetricRow label="Long-Term Capital Gain" value={fmt(m.longTermCapitalGain, 'dollar')} />
      </div>

      {/* Four Returns */}
      <div className="card">
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Four Returns (Total over {inputs.holdPeriod} Years)</h4>
        <MetricRow label="1. Cash Flow" value={fmt(m.totalCashFlow, 'dollar')} good={m.totalCashFlow > 0} />
        <MetricRow label="2. Appreciation" value={fmt(m.totalAppreciation, 'dollar')} good={m.totalAppreciation > 0} />
        <MetricRow label="3. Loan Amortization" value={fmt(m.totalAmortization, 'dollar')} good={m.totalAmortization > 0} />
        <MetricRow label="4. Tax Benefit" value={fmt(m.totalTaxBenefit, 'dollar')} good={m.totalTaxBenefit > 0} />
        <MetricRow label="Overall Return on Investment" value={fmt(m.overallReturn, 'pct')} good={m.overallReturn > 1.0} />
      </div>
    </div>
  );
}
