/**
 * Industry benchmarks for multifamily residential properties.
 *
 * Ranges are sourced from widely-cited consensus figures across IREM
 * Income/Expense Analysis reports, NMHC Research, and ULI Emerging
 * Trends publications. These represent "healthy" operating ranges
 * for each property class — not absolutes.
 *
 * TO UPDATE: Edit the BENCHMARKS array below and bump BENCHMARK_META.lastUpdated.
 * Review annually — IREM typically publishes new data each January.
 */

export const BENCHMARK_META = {
  lastUpdated: 'January 2025',
  sources: [
    { name: 'IREM Income/Expense Analysis', url: 'https://www.irem.org/resources/by-type/research' },
    { name: 'NMHC Research & Insight', url: 'https://www.nmhc.org/research-insight/' },
    { name: 'ULI Emerging Trends in Real Estate 2024', url: 'https://knowledge.uli.org' },
  ],
  note: 'Ranges reflect national medians for stabilized properties. Local markets, property age, unit mix, and capital structure may shift thresholds materially.',
};

export type PropertyClass = 'A' | 'B' | 'C';

export interface ClassBenchmark {
  lo: number; // low end of typical healthy range
  hi: number; // high end of typical healthy range
}

export interface BenchmarkDef {
  key: string; // matches key in RatioReport
  label: string;
  unit: '%' | 'x';
  description: string;
  lowerIsBetter: boolean;
  A: ClassBenchmark;
  B: ClassBenchmark;
  C: ClassBenchmark;
  barMin: number; // left edge of the visual scale
  barMax: number; // right edge of the visual scale
}

export const PROPERTY_CLASSES: Record<PropertyClass, { label: string; description: string }> = {
  A: {
    label: 'Class A',
    description: 'Luxury / Institutional — built 1990s+, premium finishes, high-demand markets',
  },
  B: {
    label: 'Class B',
    description: 'Workforce / Mid-market — built 1970s–1990s, moderate amenities, stable renter base',
  },
  C: {
    label: 'Class C',
    description: 'Affordable / Value-add — built pre-1970s, basic amenities, higher operational intensity',
  },
};

export const BENCHMARKS: BenchmarkDef[] = [
  {
    key: 'oer',
    label: 'Operating Expense Ratio',
    unit: '%',
    description: 'Total operating expenses as a % of gross revenue. Lower indicates more efficient operations.',
    lowerIsBetter: true,
    A: { lo: 35, hi: 42 },
    B: { lo: 42, hi: 50 },
    C: { lo: 50, hi: 60 },
    barMin: 20,
    barMax: 85,
  },
  {
    key: 'noiMargin',
    label: 'NOI Margin',
    unit: '%',
    description: 'Net operating income as a % of gross revenue. Higher means more income after operations.',
    lowerIsBetter: false,
    A: { lo: 58, hi: 65 },
    B: { lo: 48, hi: 58 },
    C: { lo: 38, hi: 48 },
    barMin: 15,
    barMax: 80,
  },
  {
    key: 'vacancyRate',
    label: 'Vacancy Rate',
    unit: '%',
    description: 'Potential rent lost to vacant units as a % of gross potential rent.',
    lowerIsBetter: true,
    A: { lo: 3, hi: 6 },
    B: { lo: 5, hi: 9 },
    C: { lo: 8, hi: 14 },
    barMin: 0,
    barMax: 25,
  },
  {
    key: 'concessionRate',
    label: 'Concession Rate',
    unit: '%',
    description: 'Rent concessions and free-rent offers as a % of gross potential rent.',
    lowerIsBetter: true,
    A: { lo: 0.5, hi: 3 },
    B: { lo: 1, hi: 5 },
    C: { lo: 2, hi: 7 },
    barMin: 0,
    barMax: 15,
  },
  {
    key: 'badDebtRate',
    label: 'Bad Debt Rate',
    unit: '%',
    description: 'Uncollected rent written off as a % of gross potential rent.',
    lowerIsBetter: true,
    A: { lo: 0.2, hi: 1.5 },
    B: { lo: 0.5, hi: 2.5 },
    C: { lo: 1, hi: 4 },
    barMin: 0,
    barMax: 10,
  },
  {
    key: 'payrollPct',
    label: 'Payroll & Benefits',
    unit: '%',
    description: 'Total staff payroll and benefits as a % of gross revenue.',
    lowerIsBetter: true,
    A: { lo: 10, hi: 14 },
    B: { lo: 12, hi: 18 },
    C: { lo: 15, hi: 22 },
    barMin: 0,
    barMax: 40,
  },
  {
    key: 'mgmtFeePct',
    label: 'Management Fee',
    unit: '%',
    description: 'Property management fees as a % of gross revenue.',
    lowerIsBetter: true,
    A: { lo: 3, hi: 5 },
    B: { lo: 5, hi: 7 },
    C: { lo: 7, hi: 10 },
    barMin: 0,
    barMax: 20,
  },
  {
    key: 'dscr',
    label: 'Debt Service Coverage',
    unit: 'x',
    description: 'NOI divided by annual debt service. Lenders typically require ≥1.25x.',
    lowerIsBetter: false,
    A: { lo: 1.35, hi: 2.5 },
    B: { lo: 1.25, hi: 2.0 },
    C: { lo: 1.10, hi: 1.75 },
    barMin: 0.5,
    barMax: 4.0,
  },
];

/** Evaluate how a property's metric compares to the benchmark range. */
export function evaluateBenchmark(
  value: number,
  bm: ClassBenchmark,
  lowerIsBetter: boolean,
): 'good' | 'warning' | 'bad' {
  const buffer = (bm.hi - bm.lo) * 0.6;
  if (lowerIsBetter) {
    if (value <= bm.hi) return 'good';
    if (value <= bm.hi + buffer) return 'warning';
    return 'bad';
  } else {
    if (value >= bm.lo) return 'good';
    if (value >= bm.lo - buffer) return 'warning';
    return 'bad';
  }
}

/** Clamp and map a value onto a [0, 100] percentage for the visual bar. */
export function barPosition(value: number, barMin: number, barMax: number): number {
  return Math.min(100, Math.max(0, ((value - barMin) / (barMax - barMin)) * 100));
}
