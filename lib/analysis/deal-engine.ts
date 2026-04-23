import type { DealInputs, DealMetrics, ProFormaYear, SensitivityCell, InvestorProfile, MonteCarloResult } from '../models/deal';

// ── Mortgage Math ────────────────────────────────────────────────────────────

function monthlyPayment(principal: number, annualRate: number, amortYears: number): number {
  if (annualRate === 0) return principal / (amortYears * 12);
  const r = annualRate / 12;
  const n = amortYears * 12;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

function remainingBalance(
  principal: number,
  annualRate: number,
  amortYears: number,
  yearsPaid: number,
): number {
  if (annualRate === 0) return principal - (principal / (amortYears * 12)) * yearsPaid * 12;
  const r = annualRate / 12;
  const n = amortYears * 12;
  const p = yearsPaid * 12;
  return principal * (Math.pow(1 + r, n) - Math.pow(1 + r, p)) / (Math.pow(1 + r, n) - 1);
}

// ── Time Value ───────────────────────────────────────────────────────────────

function npv(cashFlows: number[], discountRate: number): number {
  return cashFlows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + discountRate, i + 1), 0);
}

function irr(cashFlows: number[]): number {
  // Bisection method: find r where NPV = 0
  let lo = -0.9;
  let hi = 10.0;
  const maxIter = 200;

  const npvAt = (r: number) =>
    cashFlows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i + 1), 0);

  if (npvAt(lo) * npvAt(hi) > 0) return NaN; // no real IRR in [-90%, 1000%]

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-8) break;
  }
  return (lo + hi) / 2;
}

function mirr(cashFlows: number[], financeRate: number, reinvestRate: number): number {
  const n = cashFlows.length;
  const negPV = cashFlows
    .filter(cf => cf < 0)
    .reduce((acc, cf, i) => acc + cf / Math.pow(1 + financeRate, i), 0);
  const posFV = cashFlows
    .filter(cf => cf > 0)
    .reduce((acc, cf, i) => acc + cf * Math.pow(1 + reinvestRate, n - 1 - i), 0);
  if (negPV === 0) return 0;
  return Math.pow(posFV / Math.abs(negPV), 1 / (n - 1)) - 1;
}

// ── Pro Forma ────────────────────────────────────────────────────────────────

export function buildProForma(inputs: DealInputs): ProFormaYear[] {
  const {
    purchasePrice,
    downPayment,
    interestRate,
    amortizationYears,
    grossScheduledIncome,
    otherIncome,
    expenses,
    vacancyRate,
    rentGrowthRate,
    expenseGrowthRate,
    holdPeriod,
    taxBracket,
    landValueRate,
    depreciationYears,
  } = inputs;

  const loanAmount = purchasePrice - downPayment;
  const payment = monthlyPayment(loanAmount, interestRate, amortizationYears);
  const annualDebtService = payment * 12;
  const depreciableBase = purchasePrice * (1 - landValueRate);
  const annualDepreciation = depreciableBase / depreciationYears;
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);

  const rows: ProFormaYear[] = [];

  for (let yr = 1; yr <= holdPeriod; yr++) {
    const growthMultiplier = Math.pow(1 + rentGrowthRate, yr - 1);
    const expGrowth = Math.pow(1 + expenseGrowthRate, yr - 1);

    const gsi = grossScheduledIncome * growthMultiplier;
    const vacancyLoss = gsi * vacancyRate;
    const egi = gsi - vacancyLoss;
    const otherInc = otherIncome * growthMultiplier;
    const totalIncome = egi + otherInc;
    const opex = totalExpenses * expGrowth;
    const noi = totalIncome - opex;

    const startBalance = yr === 1 ? loanAmount : remainingBalance(loanAmount, interestRate, amortizationYears, yr - 1);
    const endBalance = remainingBalance(loanAmount, interestRate, amortizationYears, yr);
    const principalPaydown = startBalance - endBalance;
    const interestPayment = annualDebtService - principalPaydown;

    const cfbt = noi - annualDebtService;
    const taxableIncome = cfbt - annualDepreciation + principalPaydown;
    const taxLiability = taxableIncome * taxBracket;
    const afterTaxCF = cfbt - taxLiability;

    // Implied property value based on stabilized NOI / exit cap (approximation per year)
    const propertyValue = noi / inputs.exitCapRate;
    const closingCosts = purchasePrice * inputs.closingCostRate;
    const totalCashInvested = downPayment + closingCosts + inputs.capexBudget;
    const equity = propertyValue - endBalance;

    rows.push({
      year: yr,
      grossScheduledIncome: gsi,
      vacancyLoss,
      effectiveGrossIncome: egi,
      otherIncome: otherInc,
      totalIncome,
      operatingExpenses: opex,
      noi,
      debtService: annualDebtService,
      cashFlowBeforeTax: cfbt,
      principalPaydown,
      interestPayment,
      remainingLoanBalance: endBalance,
      depreciation: annualDepreciation,
      taxableIncome,
      taxLiability,
      afterTaxCashFlow: afterTaxCF,
      propertyValue,
      equity,
      cashOnCash: totalCashInvested > 0 ? cfbt / totalCashInvested : 0,
      returnOnEquity: equity > 0 ? cfbt / equity : 0,
    });
  }

  return rows;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export function calculateMetrics(
  inputs: DealInputs,
  proForma: ProFormaYear[],
  profile: InvestorProfile,
): DealMetrics {
  const {
    purchasePrice,
    downPayment,
    closingCostRate,
    capexBudget,
    interestRate,
    amortizationYears,
    loanTermYears,
    grossScheduledIncome,
    otherIncome,
    expenses,
    vacancyRate,
    exitCapRate,
    holdPeriod,
    sellingCostRate,
    taxBracket,
    landValueRate,
    depreciationYears,
  } = inputs;

  const closingCosts = purchasePrice * closingCostRate;
  const loanAmount = purchasePrice - downPayment;
  const totalCashInvested = downPayment + closingCosts + capexBudget;

  const payment = monthlyPayment(loanAmount, interestRate, amortizationYears);
  const annualDebtService = payment * 12;
  const mortgageConstant = loanAmount > 0 ? annualDebtService / loanAmount : 0;
  const ltv = purchasePrice > 0 ? loanAmount / purchasePrice : 0;

  // Year 1 income layer
  const yr1 = proForma[0];
  const vacancyLoss = yr1.vacancyLoss;
  const egi = yr1.effectiveGrossIncome;
  const totalOpex = yr1.operatingExpenses;
  const noi = yr1.noi;
  const oer = egi > 0 ? totalOpex / egi : 0;

  // Valuation
  const capRate = purchasePrice > 0 ? noi / purchasePrice : 0;
  const grm = grossScheduledIncome > 0 ? purchasePrice / grossScheduledIncome : 0;

  // Max loan at 1.25x DSCR
  const maxLoanAmount = mortgageConstant > 0 ? (noi / 1.25) / mortgageConstant : 0;

  // Cash flow
  const cfbt = yr1.cashFlowBeforeTax;
  const cashOnCash = totalCashInvested > 0 ? cfbt / totalCashInvested : 0;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;

  // Break-even occupancy: (debt service + opex) / potential gross revenue
  const potentialGross = grossScheduledIncome + otherIncome;
  const breakEvenOccupancy = potentialGross > 0 ? (annualDebtService + totalOpex) / potentialGross : 0;

  // Depreciation & tax (year 1)
  const depreciableBase = purchasePrice * (1 - landValueRate);
  const annualDepreciation = depreciableBase / depreciationYears;
  const taxableIncome = yr1.taxableIncome;
  const afterTaxCashFlow = yr1.afterTaxCashFlow;

  // Exit — at end of hold period
  const exitYear = proForma[holdPeriod - 1];
  const projectedSalePrice = exitYear.noi / exitCapRate;
  const sellingCosts = projectedSalePrice * sellingCostRate;
  const remainingLoanBalance = remainingBalance(loanAmount, interestRate, amortizationYears, Math.min(holdPeriod, loanTermYears));
  const reversion = projectedSalePrice - sellingCosts - remainingLoanBalance;
  const longTermCapitalGain = Math.max(0, projectedSalePrice - purchasePrice - sellingCosts);

  // DCF value: PV of NOI stream + terminal value
  const discountRate = profile.targetIRR;
  const noiStream = proForma.map(y => y.noi);
  const terminalValue = projectedSalePrice - sellingCosts;
  const dcfValue = npv(noiStream, discountRate) + terminalValue / Math.pow(1 + discountRate, holdPeriod);

  // NPV & IRR of equity cash flows
  const equityCashFlows = [
    -totalCashInvested,
    ...proForma.slice(0, holdPeriod - 1).map(y => y.afterTaxCashFlow),
    (proForma[holdPeriod - 1]?.afterTaxCashFlow ?? 0) + reversion,
  ];
  const dealNPV = npv(equityCashFlows.slice(1), discountRate) - totalCashInvested;
  const dealIRR = irr(equityCashFlows);
  const dealMIRR = mirr(equityCashFlows, interestRate, discountRate);
  const profitabilityIndex = totalCashInvested > 0 ? (dealNPV + totalCashInvested) / totalCashInvested : 0;

  // Payback period
  let paybackPeriod = holdPeriod;
  let cumCF = 0;
  for (let i = 0; i < proForma.length; i++) {
    cumCF += proForma[i].cashFlowBeforeTax;
    if (cumCF >= totalCashInvested) {
      paybackPeriod = i + 1;
      break;
    }
  }

  // Return on equity (year 1)
  const yr1Equity = exitYear.propertyValue - remainingBalance(loanAmount, interestRate, amortizationYears, 1);
  const returnOnEquity = yr1Equity > 0 ? cfbt / yr1Equity : 0;
  const equityDividendRate = cashOnCash; // alias

  // Totals over hold period
  const totalCashFlow = proForma.reduce((a, y) => a + y.cashFlowBeforeTax, 0);
  const totalAppreciation = projectedSalePrice - purchasePrice;
  const totalAmortization = loanAmount - remainingLoanBalance;
  const totalTaxBenefit = proForma.reduce((a, y) => a + Math.max(0, -y.taxableIncome) * taxBracket, 0);
  const overallReturn = totalCashInvested > 0
    ? (totalCashFlow + totalAppreciation + totalAmortization + totalTaxBenefit) / totalCashInvested
    : 0;

  return {
    grossScheduledIncome,
    vacancyLoss,
    effectiveGrossIncome: egi,
    totalOperatingExpenses: totalOpex,
    noi,
    operatingExpenseRatio: oer,
    capRate,
    grm,
    loanAmount,
    closingCosts,
    totalCashInvested,
    monthlyPayment: payment,
    annualDebtService,
    mortgageConstant,
    ltv,
    maxLoanAmount,
    cashFlowBeforeTax: cfbt,
    cashOnCash,
    dscr,
    breakEvenOccupancy,
    npv: dealNPV,
    irr: dealIRR,
    mirr: dealMIRR,
    profitabilityIndex,
    paybackPeriod,
    dcfValue,
    returnOnEquity,
    equityDividendRate,
    annualDepreciation,
    taxableIncome,
    afterTaxCashFlow,
    projectedSalePrice,
    sellingCosts,
    remainingLoanBalance,
    reversion,
    longTermCapitalGain,
    totalCashFlow,
    totalAppreciation,
    totalAmortization,
    totalTaxBenefit,
    overallReturn,
  };
}

// ── Monte Carlo ───────────────────────────────────────────────────────────────

// Box-Muller transform: produces a standard normal sample
function boxMuller(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function normal(mean: number, stdDev: number): number {
  return mean + stdDev * boxMuller();
}

function clampVal(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function runMonteCarlo(
  inputs: DealInputs,
  profile: InvestorProfile,
  iterations = 2000,
): MonteCarloResult {
  // Risk-adjusted std devs: properties with higher base vacancy have wider
  // uncertainty bands because the market signal is already weaker.
  const vStd  = Math.max(0.02, Math.min(0.10, 0.02 + inputs.vacancyRate * 0.30));
  const rgStd = Math.max(0.015, Math.min(0.05, 0.015 + inputs.vacancyRate * 0.12));
  const egStd = 0.012;
  const ecStd = Math.max(0.005, Math.min(0.015, 0.005 + inputs.vacancyRate * 0.025));

  // Vacancy and rent growth are negatively correlated: the same weak rental
  // market that pushes vacancy up also suppresses rent growth. ρ = -0.50.
  const rho = -0.50;
  const rhoComp = Math.sqrt(1 - rho * rho); // ≈ 0.866

  const irrArr: number[] = [];
  const cocArr: number[] = [];
  const dscrArr: number[] = [];
  const viableArr: boolean[] = [];

  for (let i = 0; i < iterations; i++) {
    const z1 = boxMuller(); // drives vacancy
    const z2 = boxMuller(); // independent component for rent growth

    const vacancyRate       = clampVal(inputs.vacancyRate       + vStd  * z1,                       0,     0.70);
    const rentGrowthRate    = clampVal(inputs.rentGrowthRate    + rgStd * (rho * z1 + rhoComp * z2), -0.10, 0.15);
    const expenseGrowthRate = clampVal(normal(inputs.expenseGrowthRate, egStd),                       0,     0.10);
    const exitCapRate       = clampVal(normal(inputs.exitCapRate, ecStd),                             0.03,  0.20);

    const modified: DealInputs = { ...inputs, vacancyRate, rentGrowthRate, expenseGrowthRate, exitCapRate };

    try {
      const pf = buildProForma(modified);
      const m = calculateMetrics(modified, pf, profile);
      irrArr.push(m.irr);
      cocArr.push(m.cashOnCash);
      dscrArr.push(m.dscr);
      viableArr.push(m.dscr >= 1.0 && m.cashFlowBeforeTax > 0);
    } catch {
      // skip invalid combinations
    }
  }

  const n = irrArr.length;
  const sortedIRR = [...irrArr].sort((a, b) => a - b);
  const sortedCoC = [...cocArr].sort((a, b) => a - b);

  const viableCount = viableArr.filter(Boolean).length;

  // Collect 200 evenly-spaced samples for plotting
  const step = Math.max(1, Math.floor(n / 200));
  const samples: Array<{ irr: number; coc: number; dscr: number }> = [];
  for (let i = 0; i < n && samples.length < 200; i += step) {
    samples.push({ irr: irrArr[i], coc: cocArr[i], dscr: dscrArr[i] });
  }

  return {
    iterations: n,
    irrPercentiles: {
      p10: percentile(sortedIRR, 10),
      p25: percentile(sortedIRR, 25),
      p50: percentile(sortedIRR, 50),
      p75: percentile(sortedIRR, 75),
      p90: percentile(sortedIRR, 90),
    },
    cocPercentiles: {
      p10: percentile(sortedCoC, 10),
      p25: percentile(sortedCoC, 25),
      p50: percentile(sortedCoC, 50),
      p75: percentile(sortedCoC, 75),
      p90: percentile(sortedCoC, 90),
    },
    viablePct: n > 0 ? viableCount / n : 0,
    samples,
  };
}

// ── Sensitivity Matrix ────────────────────────────────────────────────────────

const VACANCY_STEPS   = [0.00, 0.03, 0.05, 0.08, 0.10, 0.15];
const RENT_GROWTH_STEPS = [-0.02, 0.00, 0.02, 0.03, 0.05, 0.07];

export function buildSensitivityMatrix(
  inputs: DealInputs,
  profile: InvestorProfile,
): SensitivityCell[][] {
  return VACANCY_STEPS.map(vacancyRate => {
    return RENT_GROWTH_STEPS.map(rentGrowthRate => {
      try {
        const modified = { ...inputs, vacancyRate, rentGrowthRate };
        const pf = buildProForma(modified);
        const m = calculateMetrics(modified, pf, profile);
        return {
          vacancyRate,
          rentGrowthRate,
          cashOnCash: m.cashOnCash,
          irr: m.irr,
          dscr: m.dscr,
          isViable: m.dscr >= 1.0 && m.cashFlowBeforeTax > 0,
        };
      } catch {
        return { vacancyRate, rentGrowthRate, cashOnCash: 0, irr: 0, dscr: 0, isViable: false };
      }
    });
  });
}
