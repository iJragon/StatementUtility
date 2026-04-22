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

const VERDICT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'strong-buy':  { label: 'Strong Buy',   color: 'var(--success)', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)'  },
  'buy':         { label: 'Buy',          color: 'var(--success)', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)'  },
  'conditional': { label: 'Conditional',  color: 'var(--warning)', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.35)'  },
  'avoid':       { label: 'Avoid',        color: 'var(--danger)',  bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)'  },
  'strong-avoid':{ label: 'Strong Avoid', color: 'var(--danger)',  bg: 'rgba(239,68,68,0.16)',  border: 'rgba(239,68,68,0.4)'   },
  'pass':        { label: 'Avoid',        color: 'var(--danger)',  bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)'  },
  'strong-pass': { label: 'Strong Avoid', color: 'var(--danger)',  bg: 'rgba(239,68,68,0.16)',  border: 'rgba(239,68,68,0.4)'   },
};

const FALLBACK_VERDICT = VERDICT_CONFIG['avoid'];

function MetricRow({ label, value, good, indent }: { label: string; value: string; good?: boolean | null; indent?: boolean }) {
  return (
    <div
      className="flex justify-between items-center py-2"
      style={{ borderBottom: '1px solid var(--border)', paddingLeft: indent ? '0.75rem' : undefined }}
    >
      <span className="text-sm" style={{ color: indent ? 'var(--muted)' : 'var(--text)', opacity: indent ? 0.8 : 1 }}>{label}</span>
      <span
        className="text-sm font-medium tabular-nums"
        style={{ color: good === true ? 'var(--success)' : good === false ? 'var(--danger)' : 'var(--text)' }}
      >
        {value}
      </span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{title}</h4>
      </div>
      <div className="px-4 pb-1">{children}</div>
    </div>
  );
}

function ScoreBar({ label, score, max = 25 }: { label: string; score: number; max?: number }) {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1.5">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>{score}<span style={{ color: 'var(--muted)', fontWeight: 400 }}>/25</span></span>
      </div>
      <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--border)' }}>
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function KpiCard({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center py-4 text-center">
      <div className="text-2xl font-bold tabular-nums" style={{ color: color ?? 'var(--text)' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}

export default function DealOverviewTab({ metrics: m, score, inputs }: Props) {
  const verdict = VERDICT_CONFIG[score.verdict] ?? FALLBACK_VERDICT;

  return (
    <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>

      {/* Score Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Verdict banner */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: verdict.bg, borderBottom: `1px solid ${verdict.border}` }}
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: verdict.color, opacity: 0.7 }}>Verdict</p>
            <p className="text-lg font-bold" style={{ color: verdict.color }}>{verdict.label}</p>
          </div>
          <div className="text-right">
            <span className="text-4xl font-bold tabular-nums" style={{ color: verdict.color }}>{score.total}</span>
            <span className="text-sm ml-1" style={{ color: verdict.color, opacity: 0.6 }}>/100</span>
          </div>
        </div>

        {/* Score bars */}
        <div className="px-4 pt-3 pb-1">
          <ScoreBar label="Cash Flow" score={score.cashFlowScore} />
          <ScoreBar label="Returns"   score={score.returnScore} />
          <ScoreBar label="Safety"    score={score.safetyScore} />
          <ScoreBar label="Growth"    score={score.growthScore} />
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard value={fmt(m.capRate, 'pct')} label="Cap Rate" />
        <KpiCard
          value={fmt(m.cashOnCash, 'pct')}
          label="Cash-on-Cash"
          color={m.cashOnCash >= 0.07 ? 'var(--success)' : m.cashOnCash >= 0.04 ? 'var(--warning)' : 'var(--danger)'}
        />
        <KpiCard
          value={fmt(m.irr, 'pct')}
          label="IRR"
          color={m.irr >= 0.12 ? 'var(--success)' : m.irr >= 0.08 ? 'var(--warning)' : 'var(--danger)'}
        />
        <KpiCard
          value={fmt(m.dscr, 'x')}
          label="DSCR"
          color={m.dscr >= 1.25 ? 'var(--success)' : m.dscr >= 1.0 ? 'var(--warning)' : 'var(--danger)'}
        />
      </div>

      {/* Income & Expenses */}
      <SectionCard title="Income & Expenses — Year 1">
        <MetricRow label="Gross Scheduled Income"  value={fmt(m.grossScheduledIncome, 'dollar')} />
        <MetricRow label="Vacancy Loss"            value={`-${fmt(m.vacancyLoss, 'dollar')}`} good={false} indent />
        <MetricRow label="Effective Gross Income"  value={fmt(m.effectiveGrossIncome, 'dollar')} />
        <MetricRow label="Operating Expenses"      value={`-${fmt(m.totalOperatingExpenses, 'dollar')}`} good={false} indent />
        <MetricRow label="Net Operating Income"    value={fmt(m.noi, 'dollar')} good={m.noi > 0} />
        <MetricRow label="Expense Ratio"           value={fmt(m.operatingExpenseRatio, 'pct')} good={m.operatingExpenseRatio < 0.5} indent />
      </SectionCard>

      {/* Financing */}
      <SectionCard title="Financing">
        <MetricRow label="Loan Amount"          value={fmt(m.loanAmount, 'dollar')} />
        <MetricRow label="LTV"                  value={fmt(m.ltv, 'pct')} good={m.ltv <= 0.80} indent />
        <MetricRow label="Monthly Payment"      value={fmt(m.monthlyPayment, 'dollar')} />
        <MetricRow label="Annual Debt Service"  value={fmt(m.annualDebtService, 'dollar')} indent />
        <MetricRow label="Mortgage Constant"    value={fmt(m.mortgageConstant, 'pct')} indent />
        <MetricRow label="Max Loan (1.25x DSCR)" value={fmt(m.maxLoanAmount, 'dollar')} />
        <MetricRow label="Closing Costs"        value={fmt(m.closingCosts, 'dollar')} indent />
        <MetricRow label="Total Cash Invested"  value={fmt(m.totalCashInvested, 'dollar')} />
      </SectionCard>

      {/* Cash Flow */}
      <SectionCard title="Cash Flow">
        <MetricRow label="Cash Flow Before Tax"  value={fmt(m.cashFlowBeforeTax, 'dollar')} good={m.cashFlowBeforeTax > 0} />
        <MetricRow label="After-Tax Cash Flow"   value={fmt(m.afterTaxCashFlow, 'dollar')}  good={m.afterTaxCashFlow > 0} indent />
        <MetricRow label="Break-Even Occupancy"  value={fmt(m.breakEvenOccupancy, 'pct')}   good={m.breakEvenOccupancy < 0.75} />
        <MetricRow label="Annual Depreciation"   value={fmt(m.annualDepreciation, 'dollar')} indent />
        <MetricRow label="Taxable Income"        value={fmt(m.taxableIncome, 'dollar')} />
      </SectionCard>

      {/* Time Value */}
      <SectionCard title="Time Value & Returns">
        <MetricRow label="NPV"                value={fmt(m.npv, 'dollar')} good={m.npv > 0} />
        <MetricRow label="IRR"                value={fmt(m.irr, 'pct')}   good={m.irr >= 0.12} />
        <MetricRow label="MIRR"               value={fmt(m.mirr, 'pct')}  good={m.mirr >= 0.10} indent />
        <MetricRow label="Profitability Index" value={fmt(m.profitabilityIndex, 'x')} good={m.profitabilityIndex > 1} />
        <MetricRow label="Payback Period"     value={`${m.paybackPeriod} yr`} good={m.paybackPeriod <= inputs.holdPeriod} indent />
        <MetricRow label="DCF Value"          value={fmt(m.dcfValue, 'dollar')} />
        <MetricRow label="Gross Rent Multiplier" value={fmt(m.grm, 'x')} indent />
      </SectionCard>

      {/* Exit */}
      <SectionCard title={`Exit Analysis — Year ${inputs.holdPeriod}`}>
        <MetricRow label="Projected Sale Price"    value={fmt(m.projectedSalePrice, 'dollar')} />
        <MetricRow label="Selling Costs"           value={`-${fmt(m.sellingCosts, 'dollar')}`} good={false} indent />
        <MetricRow label="Remaining Loan Balance"  value={`-${fmt(m.remainingLoanBalance, 'dollar')}`} good={false} indent />
        <MetricRow label="Net Reversion"           value={fmt(m.reversion, 'dollar')} good={m.reversion > 0} />
        <MetricRow label="Long-Term Capital Gain"  value={fmt(m.longTermCapitalGain, 'dollar')} indent />
      </SectionCard>

      {/* Four Returns */}
      <SectionCard title={`Four Returns — ${inputs.holdPeriod}-Year Total`}>
        <MetricRow label="1. Cash Flow"       value={fmt(m.totalCashFlow, 'dollar')}    good={m.totalCashFlow > 0} />
        <MetricRow label="2. Appreciation"    value={fmt(m.totalAppreciation, 'dollar')} good={m.totalAppreciation > 0} />
        <MetricRow label="3. Amortization"    value={fmt(m.totalAmortization, 'dollar')} good={m.totalAmortization > 0} />
        <MetricRow label="4. Tax Benefit"     value={fmt(m.totalTaxBenefit, 'dollar')}  good={m.totalTaxBenefit > 0} />
        <MetricRow label="Overall Return"     value={fmt(m.overallReturn, 'pct')} good={m.overallReturn > 1.0} />
      </SectionCard>

    </div>
  );
}
