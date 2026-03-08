import type { FinancialStatement, RatioReport, RatioResult } from '../models/statement';

function getAnnual(statement: FinancialStatement, key: string): number | null {
  const item = statement.keyFigures[key];
  if (!item) return null;
  return item.annualTotal;
}

function getMonthly(statement: FinancialStatement, key: string): Record<string, number | null> {
  const item = statement.keyFigures[key];
  if (!item) return {};
  return item.montlyValues;
}

function safeDiv(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return num / den;
}

function monthlyRatio(
  statement: FinancialStatement,
  numKey: string,
  denKey: string,
  absNum = false,
  absDen = false,
  scale = 100,
): Record<string, number | null> {
  const numVals = getMonthly(statement, numKey);
  const denVals = getMonthly(statement, denKey);
  const result: Record<string, number | null> = {};
  for (const month of statement.months) {
    const n = absNum ? Math.abs(numVals[month] ?? 0) : (numVals[month] ?? null);
    const d = absDen ? Math.abs(denVals[month] ?? 0) : (denVals[month] ?? null);
    const num = numVals[month] !== undefined ? (absNum ? Math.abs(numVals[month] ?? 0) : numVals[month]) : null;
    const den = denVals[month] !== undefined ? (absDen ? Math.abs(denVals[month] ?? 0) : denVals[month]) : null;
    result[month] = safeDiv(num !== null && absNum ? Math.abs(num) : num, den !== null && absDen ? Math.abs(den!) : den) !== null
      ? (safeDiv(num !== null && absNum ? Math.abs(num!) : num, den !== null && absDen ? Math.abs(den!) : den)! * scale)
      : null;
  }
  return result;
}

function monthlyDivide(
  statement: FinancialStatement,
  numKey: string,
  denKey: string,
  absNum: boolean,
  absDen: boolean,
  scale: number,
): Record<string, number | null> {
  const numVals = getMonthly(statement, numKey);
  const denVals = getMonthly(statement, denKey);
  const result: Record<string, number | null> = {};
  for (const month of statement.months) {
    const nRaw = numVals[month];
    const dRaw = denVals[month];
    const n = nRaw === null || nRaw === undefined ? null : (absNum ? Math.abs(nRaw) : nRaw);
    const d = dRaw === null || dRaw === undefined ? null : (absDen ? Math.abs(dRaw) : dRaw);
    result[month] = safeDiv(n, d) !== null ? safeDiv(n, d)! * scale : null;
  }
  return result;
}

function statusForRange(value: number | null, lo: number, hi: number, unit: '%' | 'x' | '$', higherIsBetter = false): 'good' | 'warning' | 'bad' | 'unknown' {
  if (value === null) return 'unknown';
  if (higherIsBetter) {
    if (value >= hi) return 'good';
    const mid = (lo + hi) / 2;
    if (value >= mid) return 'warning';
    return 'bad';
  } else {
    if (value >= lo && value <= hi) return 'good';
    const range = hi - lo;
    const tolerance = range * 0.5;
    if (value >= lo - tolerance && value <= hi + tolerance) return 'warning';
    return 'bad';
  }
}

function statusForDscr(value: number | null): 'good' | 'warning' | 'bad' | 'unknown' {
  if (value === null) return 'unknown';
  if (value >= 1.25) return 'good';
  if (value >= 1.0) return 'warning';
  return 'bad';
}

export function calculateRatios(statement: FinancialStatement): RatioReport {
  const totalRev = getAnnual(statement, 'total_revenue');
  const totalOpEx = getAnnual(statement, 'total_operating_expenses');
  const noi = getAnnual(statement, 'noi');
  const gpr = getAnnual(statement, 'gross_potential_rent');
  const vacancy = getAnnual(statement, 'vacancy_loss');
  const concession = getAnnual(statement, 'concession_loss');
  const badDebt = getAnnual(statement, 'bad_debt');
  const payroll = getAnnual(statement, 'total_payroll');
  const mgmtFee = getAnnual(statement, 'management_fees');
  const controllable = getAnnual(statement, 'controllable_expenses');
  const cashFlow = getAnnual(statement, 'cash_flow');
  const financialExp = getAnnual(statement, 'financial_expense');

  // OER: totalOpEx / totalRev (%)
  const oerVal = safeDiv(totalOpEx !== null ? Math.abs(totalOpEx) : null, totalRev !== null ? Math.abs(totalRev) : null);
  const oerPct = oerVal !== null ? oerVal * 100 : null;
  const oer: RatioResult = {
    value: oerPct,
    monthly: monthlyDivide(statement, 'total_operating_expenses', 'total_revenue', true, true, 100),
    status: statusForRange(oerPct, 35, 55, '%'),
    benchmark: '35% – 55%',
    label: 'Operating Expense Ratio',
    unit: '%',
  };

  // NOI Margin: noi / totalRev (%)
  const noiMarginVal = safeDiv(noi, totalRev !== null ? Math.abs(totalRev) : null);
  const noiMarginPct = noiMarginVal !== null ? noiMarginVal * 100 : null;
  const noiMargin: RatioResult = {
    value: noiMarginPct,
    monthly: monthlyDivide(statement, 'noi', 'total_revenue', false, true, 100),
    status: statusForRange(noiMarginPct, 40, 65, '%', true),
    benchmark: '40% – 65%',
    label: 'NOI Margin',
    unit: '%',
  };

  // Vacancy Rate: |vacancy| / |gpr| (%)
  const vacancyVal = safeDiv(vacancy !== null ? Math.abs(vacancy) : null, gpr !== null ? Math.abs(gpr) : null);
  const vacancyPct = vacancyVal !== null ? vacancyVal * 100 : null;
  const vacancyRate: RatioResult = {
    value: vacancyPct,
    monthly: monthlyDivide(statement, 'vacancy_loss', 'gross_potential_rent', true, true, 100),
    status: statusForRange(vacancyPct, 0, 7, '%'),
    benchmark: '0% – 7%',
    label: 'Vacancy Rate',
    unit: '%',
  };

  // Concession Rate: |concession| / |gpr| (%)
  const concessionVal = safeDiv(concession !== null ? Math.abs(concession) : null, gpr !== null ? Math.abs(gpr) : null);
  const concessionPct = concessionVal !== null ? concessionVal * 100 : null;
  const concessionRate: RatioResult = {
    value: concessionPct,
    monthly: monthlyDivide(statement, 'concession_loss', 'gross_potential_rent', true, true, 100),
    status: statusForRange(concessionPct, 0, 2, '%'),
    benchmark: '0% – 2%',
    label: 'Concession Rate',
    unit: '%',
  };

  // Bad Debt Rate: |badDebt| / totalRev (%)
  const badDebtVal = safeDiv(badDebt !== null ? Math.abs(badDebt) : null, totalRev !== null ? Math.abs(totalRev) : null);
  const badDebtPct = badDebtVal !== null ? badDebtVal * 100 : null;
  const badDebtRate: RatioResult = {
    value: badDebtPct,
    monthly: monthlyDivide(statement, 'bad_debt', 'total_revenue', true, true, 100),
    status: statusForRange(badDebtPct, 0, 1, '%'),
    benchmark: '0% – 1%',
    label: 'Bad Debt Rate',
    unit: '%',
  };

  // Payroll %: |payroll| / totalRev (%)
  const payrollVal = safeDiv(payroll !== null ? Math.abs(payroll) : null, totalRev !== null ? Math.abs(totalRev) : null);
  const payrollPct2 = payrollVal !== null ? payrollVal * 100 : null;
  const payrollPct: RatioResult = {
    value: payrollPct2,
    monthly: monthlyDivide(statement, 'total_payroll', 'total_revenue', true, true, 100),
    status: statusForRange(payrollPct2, 10, 25, '%'),
    benchmark: '10% – 25%',
    label: 'Payroll %',
    unit: '%',
  };

  // Mgmt Fee %: |mgmtFee| / totalRev (%)
  const mgmtVal = safeDiv(mgmtFee !== null ? Math.abs(mgmtFee) : null, totalRev !== null ? Math.abs(totalRev) : null);
  const mgmtPct = mgmtVal !== null ? mgmtVal * 100 : null;
  const mgmtFeePct: RatioResult = {
    value: mgmtPct,
    monthly: monthlyDivide(statement, 'management_fees', 'total_revenue', true, true, 100),
    status: statusForRange(mgmtPct, 4, 8, '%'),
    benchmark: '4% – 8%',
    label: 'Management Fee %',
    unit: '%',
  };

  // Controllable %: |controllable| / |totalOpEx| (%)
  const controllableVal = safeDiv(
    controllable !== null ? Math.abs(controllable) : null,
    totalOpEx !== null ? Math.abs(totalOpEx) : null,
  );
  const controllablePctVal = controllableVal !== null ? controllableVal * 100 : null;
  const controllablePct: RatioResult = {
    value: controllablePctVal,
    monthly: monthlyDivide(statement, 'controllable_expenses', 'total_operating_expenses', true, true, 100),
    status: statusForRange(controllablePctVal, 25, 50, '%'),
    benchmark: '25% – 50%',
    label: 'Controllable Expense %',
    unit: '%',
  };

  // Break-Even Occupancy: |totalOpEx| / |gpr| (%)
  const beoVal = safeDiv(totalOpEx !== null ? Math.abs(totalOpEx) : null, gpr !== null ? Math.abs(gpr) : null);
  const beoPct = beoVal !== null ? beoVal * 100 : null;
  const breakEvenOccupancy: RatioResult = {
    value: beoPct,
    monthly: monthlyDivide(statement, 'total_operating_expenses', 'gross_potential_rent', true, true, 100),
    status: statusForRange(beoPct, 0, 85, '%'),
    benchmark: '0% – 85%',
    label: 'Break-Even Occupancy',
    unit: '%',
  };

  // Cash Flow Margin: cashFlow / totalRev (%)
  const cfVal = safeDiv(cashFlow, totalRev !== null ? Math.abs(totalRev) : null);
  const cfPct = cfVal !== null ? cfVal * 100 : null;
  const cashFlowMargin: RatioResult = {
    value: cfPct,
    monthly: monthlyDivide(statement, 'cash_flow', 'total_revenue', false, true, 100),
    status: statusForRange(cfPct, 5, 100, '%', true),
    benchmark: '5% – 100%',
    label: 'Cash Flow Margin',
    unit: '%',
  };

  // DSCR: noi / |financialExp| (x)
  const dscrVal = safeDiv(noi, financialExp !== null ? Math.abs(financialExp) : null);
  const dscr: RatioResult = {
    value: dscrVal,
    monthly: monthlyDivide(statement, 'noi', 'financial_expense', false, true, 1),
    status: statusForDscr(dscrVal),
    benchmark: '≥ 1.25x',
    label: 'DSCR',
    unit: 'x',
  };

  return {
    oer,
    noiMargin,
    vacancyRate,
    concessionRate,
    badDebtRate,
    payrollPct,
    mgmtFeePct,
    controllablePct,
    breakEvenOccupancy,
    cashFlowMargin,
    dscr,
  };
}
