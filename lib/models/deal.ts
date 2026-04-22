// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationWarning {
  field: string;          // Which DealInputs key(s) this applies to
  level: 'error' | 'warn';
  message: string;
  step: 'property' | 'financing' | 'income' | 'expenses' | 'assumptions';
}

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface OperatingExpenseBreakdown {
  propertyTaxes: number;
  insurance: number;
  utilities: number;
  maintenance: number;
  managementFee: number;
  landscaping: number;
  janitorial: number;
  marketing: number;
  administrative: number;
  payroll: number;
  reserves: number;
  miscellaneous: number;
}

export interface DealInputs {
  // Property
  propertyType: 'residential' | 'commercial' | 'mixed';

  // Purchase
  purchasePrice: number;
  closingCostRate: number;       // decimal, e.g. 0.03
  capexBudget: number;

  // Financing
  downPayment: number;           // dollar amount
  interestRate: number;          // annual decimal
  amortizationYears: number;
  loanTermYears: number;         // balloon term (≤ amortizationYears)

  // Income (annual)
  grossScheduledIncome: number;
  otherIncome: number;

  // Expenses (annual amounts)
  expenses: OperatingExpenseBreakdown;

  // Market assumptions
  vacancyRate: number;           // decimal
  rentGrowthRate: number;        // annual decimal
  expenseGrowthRate: number;     // annual decimal
  exitCapRate: number;           // decimal
  holdPeriod: number;            // years
  sellingCostRate: number;       // decimal, e.g. 0.06

  // Tax
  taxBracket: number;            // decimal
  landValueRate: number;         // land as % of purchase price (non-depreciable)
  depreciationYears: number;     // 27.5 residential / 39 commercial
}

// ── Investor Profile ────────────────────────────────────────────────────────

export interface InvestorProfile {
  taxBracket: number;            // decimal
  targetCashOnCash: number;      // decimal
  targetIRR: number;             // decimal
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  holdPeriod: number;            // preferred years
}

// ── Computed Outputs ────────────────────────────────────────────────────────

export interface DealMetrics {
  // Income layer
  grossScheduledIncome: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
  totalOperatingExpenses: number;
  noi: number;
  operatingExpenseRatio: number;

  // Valuation
  capRate: number;
  grm: number;                   // Gross Rent Multiplier

  // Financing
  loanAmount: number;
  closingCosts: number;
  totalCashInvested: number;
  monthlyPayment: number;
  annualDebtService: number;
  mortgageConstant: number;
  ltv: number;
  maxLoanAmount: number;         // at 1.25x DSCR

  // Cash flow
  cashFlowBeforeTax: number;
  cashOnCash: number;
  dscr: number;
  breakEvenOccupancy: number;

  // Time value
  npv: number;
  irr: number;
  mirr: number;
  profitabilityIndex: number;
  paybackPeriod: number;         // years
  dcfValue: number;

  // Returns
  returnOnEquity: number;
  equityDividendRate: number;

  // Tax
  annualDepreciation: number;
  taxableIncome: number;         // year 1
  afterTaxCashFlow: number;      // year 1

  // Exit
  projectedSalePrice: number;
  sellingCosts: number;
  remainingLoanBalance: number;
  reversion: number;             // net equity from sale
  longTermCapitalGain: number;

  // Totals over hold period (four returns)
  totalCashFlow: number;
  totalAppreciation: number;
  totalAmortization: number;
  totalTaxBenefit: number;
  overallReturn: number;         // combined ROI on cash invested
}

export interface ProFormaYear {
  year: number;
  grossScheduledIncome: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
  otherIncome: number;
  totalIncome: number;
  operatingExpenses: number;
  noi: number;
  debtService: number;
  cashFlowBeforeTax: number;
  principalPaydown: number;
  interestPayment: number;
  remainingLoanBalance: number;
  depreciation: number;
  taxableIncome: number;
  taxLiability: number;
  afterTaxCashFlow: number;
  propertyValue: number;         // implied via exit cap rate
  equity: number;
  cashOnCash: number;
  returnOnEquity: number;
}

export interface SensitivityCell {
  vacancyRate: number;
  rentGrowthRate: number;
  cashOnCash: number;
  irr: number;
  dscr: number;
  isViable: boolean;             // dscr >= 1.0 and cfbt > 0
}

export interface ScoreBreakdown {
  cashFlowScore: number;         // 0–25
  returnScore: number;           // 0–25
  safetyScore: number;           // 0–25
  growthScore: number;           // 0–25
  total: number;                 // 0–100
  verdict: 'strong-buy' | 'buy' | 'conditional' | 'avoid' | 'strong-avoid';
}

export interface MonteCarloResult {
  iterations: number;
  irrPercentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  cocPercentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  viablePct: number;
  samples: Array<{ irr: number; coc: number; dscr: number }>;  // 200 samples for plotting
}

export interface DealAnalysis {
  metrics: DealMetrics;
  proForma: ProFormaYear[];
  sensitivity: SensitivityCell[][];  // [vacancy index][rentGrowth index]
  score: ScoreBreakdown;
  monteCarlo?: MonteCarloResult;
}

// ── Deal Record ─────────────────────────────────────────────────────────────

export interface DealEntry {
  id: string;
  name: string;
  address?: string;
  status: 'draft' | 'analyzed' | 'passed' | 'converted';
  dealScore?: number;
  createdAt: string;
}

export interface Deal extends DealEntry {
  inputs: DealInputs;
  analysis?: DealAnalysis;
  aiNarrative?: string;
  aiAnalyzedAt?: string;
  propertyId?: string;
  notes?: string;
}

// ── Default Values ──────────────────────────────────────────────────────────

export const DEFAULT_DEAL_INPUTS: DealInputs = {
  propertyType: 'residential',
  purchasePrice: 0,
  closingCostRate: 0.03,
  capexBudget: 0,
  downPayment: 0,
  interestRate: 0.07,
  amortizationYears: 30,
  loanTermYears: 10,
  grossScheduledIncome: 0,
  otherIncome: 0,
  expenses: {
    propertyTaxes: 0,
    insurance: 0,
    utilities: 0,
    maintenance: 0,
    managementFee: 0,
    landscaping: 0,
    janitorial: 0,
    marketing: 0,
    administrative: 0,
    payroll: 0,
    reserves: 0,
    miscellaneous: 0,
  },
  vacancyRate: 0.05,
  rentGrowthRate: 0.03,
  expenseGrowthRate: 0.02,
  exitCapRate: 0.065,
  holdPeriod: 10,
  sellingCostRate: 0.06,
  taxBracket: 0.24,
  landValueRate: 0.20,
  depreciationYears: 27.5,
};

export const DEFAULT_INVESTOR_PROFILE: InvestorProfile = {
  taxBracket: 0.24,
  targetCashOnCash: 0.08,
  targetIRR: 0.12,
  riskTolerance: 'moderate',
  holdPeriod: 10,
};
