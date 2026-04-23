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

// Cash Flow Score (0-25): CoC + DSCR
// Thresholds calibrated for current rate environment (7%+ mortgages).
// Hitting your profile's CoC target earns full marks; 0% earns 0.
// DSCR: lender floor is 1.0, good is 1.35+.
function cashFlowScore(m: DealMetrics, profile: InvestorProfile): number {
  const cocScore = scoreLinear(m.cashOnCash, 0, profile.targetCashOnCash);
  const dscrScore = scoreLinear(m.dscr, 1.0, 1.35);
  return (cocScore * 0.6 + dscrScore * 0.4);
}

// Return Score (0-25): IRR + NPV ratio
// IRR starts scoring at 5% (risk-free floor), full score at profile target.
// NPV ratio: positive NPV relative to cash invested.
function returnScore(m: DealMetrics, profile: InvestorProfile): number {
  // Guard NaN: irr() returns NaN when no real root exists (degenerate cash flows).
  const irrScore = isFinite(m.irr) ? scoreLinear(m.irr, 0.05, profile.targetIRR) : 0;
  const npvScore = m.npv > 0 ? scoreLinear(m.npv / Math.max(m.totalCashInvested, 1), 0, 0.4) : 0;
  return (irrScore * 0.6 + npvScore * 0.4);
}

// Safety Score (0-25): DSCR + break-even occupancy + LTV
// BEO: a BEO of 65% = full cushion (35% vacancy buffer); 100% BEO = 0.
// LTV: 65% LTV = full score; 100% LTV = 0.
function safetyScore(m: DealMetrics): number {
  const dscrScore = scoreLinear(m.dscr, 1.0, 1.35);
  const beoScore = scoreLinear(1 - m.breakEvenOccupancy, 0, 0.35);
  const ltvScore = scoreLinear(1 - m.ltv, 0, 0.35);
  return (dscrScore * 0.5 + beoScore * 0.3 + ltvScore * 0.2);
}

// Growth Score (0-25): appreciation ratio + overall return + profitability index
// Overall return: 2x cash-on-cash over hold period = full score.
// Appreciation ratio: 1.5x your cash invested in price gain = full score.
function growthScore(m: DealMetrics): number {
  const appreciationScore = scoreLinear(
    m.totalAppreciation / Math.max(m.totalCashInvested, 1),
    0, 1.5,
  );
  const overallScore = scoreLinear(m.overallReturn, 0, 2.0);
  const piScore = scoreLinear(m.profitabilityIndex, 1.0, 1.8);
  return (appreciationScore * 0.4 + overallScore * 0.4 + piScore * 0.2);
}

function verdict(total: number): ScoreBreakdown['verdict'] {
  if (total >= 80) return 'strong-buy';
  if (total >= 65) return 'buy';
  if (total >= 50) return 'conditional';
  if (total >= 35) return 'avoid';
  return 'strong-avoid';
}

export function scoreDeal(m: DealMetrics, profile: InvestorProfile): ScoreBreakdown {
  // Guard: no meaningful deal data entered yet
  if (m.totalCashInvested === 0 || m.grossScheduledIncome === 0) {
    return { cashFlowScore: 0, returnScore: 0, safetyScore: 0, growthScore: 0, total: 0, verdict: 'strong-avoid' };
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
