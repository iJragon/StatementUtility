import type { DealMetrics, InvestorProfile, ScoreBreakdown } from '../models/deal';

// Each component is scored 0–25; total 0–100.
// Thresholds calibrated to Gallinelli-era benchmarks.

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

function scoreLinear(value: number, bad: number, good: number): number {
  if (bad === good) return value >= good ? 25 : 0;
  return clamp(((value - bad) / (good - bad)) * 25, 0, 25);
}

// Cash Flow Score (0–25): CoC + CFBT positivity
function cashFlowScore(m: DealMetrics, profile: InvestorProfile): number {
  const cocTarget = profile.targetCashOnCash;
  const cocScore = scoreLinear(m.cashOnCash, 0, cocTarget * 1.5);
  const dscrScore = scoreLinear(m.dscr, 1.0, 1.5);
  return (cocScore * 0.6 + dscrScore * 0.4);
}

// Return Score (0–25): IRR + NPV positivity
function returnScore(m: DealMetrics, profile: InvestorProfile): number {
  const irrTarget = profile.targetIRR;
  const irrScore = scoreLinear(m.irr, 0, irrTarget * 1.5);
  const npvScore = m.npv > 0 ? scoreLinear(m.npv / Math.max(m.totalCashInvested, 1), 0, 0.5) : 0;
  return (irrScore * 0.6 + npvScore * 0.4);
}

// Safety Score (0–25): DSCR + break-even occupancy + LTV
function safetyScore(m: DealMetrics): number {
  const dscrScore = scoreLinear(m.dscr, 1.0, 1.5);
  // Lower break-even occupancy is better (more cushion)
  const beoScore = scoreLinear(1 - m.breakEvenOccupancy, 0.1, 0.5);
  const ltvScore = scoreLinear(1 - m.ltv, 0.1, 0.4); // lower LTV = higher score
  return (dscrScore * 0.5 + beoScore * 0.3 + ltvScore * 0.2);
}

// Growth Score (0–25): appreciation + overall return + profitability index
function growthScore(m: DealMetrics): number {
  const appreciationScore = scoreLinear(
    m.totalAppreciation / Math.max(m.totalCashInvested, 1),
    0, 2.0,
  );
  const overallScore = scoreLinear(m.overallReturn, 0, 3.0);
  const piScore = scoreLinear(m.profitabilityIndex, 1.0, 2.0);
  return (appreciationScore * 0.4 + overallScore * 0.4 + piScore * 0.2);
}

function verdict(total: number): ScoreBreakdown['verdict'] {
  if (total >= 80) return 'strong-buy';
  if (total >= 65) return 'buy';
  if (total >= 50) return 'conditional';
  if (total >= 35) return 'pass';
  return 'strong-pass';
}

export function scoreDeal(m: DealMetrics, profile: InvestorProfile): ScoreBreakdown {
  // Guard: no meaningful deal data entered yet
  if (m.totalCashInvested === 0 || m.grossScheduledIncome === 0) {
    return { cashFlowScore: 0, returnScore: 0, safetyScore: 0, growthScore: 0, total: 0, verdict: 'strong-pass' };
  }
  const cf = clamp(cashFlowScore(m, profile), 0, 25);
  const ret = clamp(returnScore(m, profile), 0, 25);
  const safety = clamp(safetyScore(m), 0, 25);
  const growth = clamp(growthScore(m), 0, 25);
  const total = Math.round(cf + ret + safety + growth);

  return {
    cashFlowScore: Math.round(cf),
    returnScore: Math.round(ret),
    safetyScore: Math.round(safety),
    growthScore: Math.round(growth),
    total,
    verdict: verdict(total),
  };
}
