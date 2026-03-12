/**
 * Generates realistic test P&L statements for 2021-2024.
 *
 * Strategy:
 *   1. Scale only account-code rows (detail rows) per year config
 *   2. Recalculate ALL subtotal rows from the scaled detail values
 *   3. This ensures NOI, Revenue, OER, etc. are all consistent and distinct
 *
 * Stories:
 *   2021 — COVID recovery: vacancy 13%, rents soft, payroll lean. NOI ~$960K
 *   2022 — Strong rebound: vacancy 4.5%, April has massive utility billing anomaly (4x spike). NOI ~$1.5M
 *   2023 — Slippage: vacancy 15%, concessions triple, payroll +10%, OER 68%. NOI ~$790K
 *   2024 — Rough year: vacancy 22%, bad debt surges, payroll +20%, OER 82%. NOI ~$270K
 */

const XLSX = require('xlsx');
const path = require('path');

const TEMPLATE = path.join('data', '12_Month_Statement_secesml_accrual-2 2025.xlsx');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_COLS = [2,3,4,5,6,7,8,9,10,11,12,13]; // col indices in the row array
const TOTAL_COL = 14;

// ─── Year configs: scale factors per account code ────────────────────────────
const YEAR_CONFIGS = {
  2021: {
    '5120-0000': 0.87,   // GPR — lower market rents post-COVID
    '5120-5000': 0.82,   // Gain/Loss to Lease
    '5220-0000': 1.90,   // Vacancy — 13% vs 2025's ~8%
    '5250-0000': 3.00,   // Concessions — heavy concessions to fill units
    '6312-0000': 1.00, '6512-1000': 1.00,  // Office/model units
    '6360-1000': 1.80,   // Bad Debts
    '6360-3000': 1.40,   // Bad Debt Recovery
    '6360-2000': 1.60,   // Bad Debts Other
    '5190-0000': 0.80,   // Misc Rent Revenue
    '5920-0100': 0.75, '5920-0400': 0.80, '5920-0500': 0.70,
    '5920-0700': 0.80, '5920-0900': 1.10, '5920-1000': 0.80,
    '5920-1100': 1.20, '5920-1500': 0.90, '5920-8000': 0.90,
    '5910-0000': 0.80,   // Laundry/vending
    '5660-0000': 0.20,   // Interest Revenue — near zero in 2021
    // Controllable expenses
    '6210-1000': 1.20, '6210-9000': 1.20,  // Advertising — higher to fill units
    '6311-1000': 1.00, '6311-3000': 0.90, '6252-0000': 1.10,
    '6311-5000': 0.95, '6311-5200': 1.00, '6311-6000': 1.00,
    '6311-7000': 0.90,
    '6340-0000': 0.80, '6342-0000': 1.40,  // More evictions in 2021
    '6350-0000': 0.90,
    '6310-6000': 0.88, '6310-6001': 0.85, '6250-0000': 0.75,
    '6390-0100': 0.88, '6310-9800': 0.88,
    '6510-1000': 0.85, '6510-1100': 0.82,
    '6510-3000': 0.87, '6510-3100': 0.85,
    '6711-0000': 0.87,
    '6723-1000': 0.88, '6723-2000': 0.85, '6723-3000': 0.85,
    '6723-4000': 0.85, '6723-5000': 0.85, '6723-6000': 0.85,
    '6725-0000': 0.90, '6750-0000': 0.88, '6760-0000': 0.88,
    '6390-0300': 0.90, '6391-0500': 0.80, '6392-0000': 0.90,
    '6397-2000': 0.80, '6399-0000': 0.88,
    // Operating & maintenance
    '6515-1000': 0.90, '6515-1600': 0.90, '6515-1800': 0.90,
    '6515-2100': 0.90, '6515-2230': 0.90, '6515-3000': 0.90,
    '6515-3500': 0.90, '6515-3700': 0.90, '6515-4000': 0.90,
    '6515-4100': 0.90, '6515-4200': 0.90, '6515-5200': 0.90,
    '6515-7000': 0.90, '6519-0000': 0.90,
    '6520-5200': 0.80, '6520-7000': 0.88, '6525-0000': 0.92,
    '6525-2000': 0.85, '6525-3000': 0.90,
    '6520-1000': 1.30, '6520-1810': 1.50, '6520-1910': 1.20,
    '6520-1600': 0.85, '6520-1920': 0.85, '6520-3700': 0.85,
    '6526-0000': 0.85, '6548-0000': 1.00, '6570-0000': 0.85,
    '6790-0000': 0.90,
    // Non-controllable
    '6320-0000': 0.87,   // Mgmt fees ~ tied to revenue
    '6450-2000': 0.91, '6451-2000': 0.95, '6452-0000': 0.90, '6453-0000': 0.90,
    '6710-0000': 0.89,
    '6720-1000': 0.90, '6254-0000': 0.50,
    // Non-operating
    '6820-1000': 1.00,   // Mortgage stays constant
    '6920-0000': 0.80,
    '7140-0000': 1.00, '7210-0000': 0.90,
    // Replacement
    default_repl: 0.85,
    // Balance sheet — keep as-is
    default_bs: 1.00,
    monthMultipliers: {},
  },

  2022: {
    '5120-0000': 0.97,
    '5120-5000': 0.88,
    '5220-0000': 0.60,   // ~4.5% vacancy — great occupancy
    '5250-0000': 0.30,   // Very few concessions
    '6312-0000': 1.00, '6512-1000': 1.00,
    '6360-1000': 0.55,
    '6360-3000': 0.80,
    '6360-2000': 0.60,
    '5190-0000': 0.90,
    '5920-0100': 1.05, '5920-0400': 0.95, '5920-0500': 0.80,
    '5920-0700': 0.90, '5920-0900': 0.95, '5920-1000': 0.90,
    '5920-1100': 0.70, '5920-1500': 0.95, '5920-8000': 0.90,
    '5910-0000': 0.90,
    '5660-0000': 0.30,
    '6210-1000': 0.85, '6210-9000': 0.90,
    '6311-1000': 0.98, '6311-3000': 0.95, '6252-0000': 0.90,
    '6311-5000': 0.95, '6311-5200': 1.00, '6311-6000': 0.98,
    '6311-7000': 0.92,
    '6340-0000': 0.60, '6342-0000': 0.65,
    '6350-0000': 0.90,
    '6310-6000': 0.94, '6310-6001': 0.90, '6250-0000': 0.90,
    '6390-0100': 0.93, '6310-9800': 0.92,
    '6510-1000': 0.92, '6510-1100': 0.90,
    '6510-3000': 0.92, '6510-3100': 0.88,
    '6711-0000': 0.92,
    '6723-1000': 0.93, '6723-2000': 0.92, '6723-3000': 0.92,
    '6723-4000': 0.92, '6723-5000': 0.92, '6723-6000': 0.92,
    '6725-0000': 0.92, '6750-0000': 0.92, '6760-0000': 0.92,
    '6390-0300': 0.92, '6391-0500': 0.85, '6392-0000': 0.92,
    '6397-2000': 0.90, '6399-0000': 0.90,
    '6515-1000': 0.92, '6515-1600': 0.90, '6515-1800': 0.88,
    '6515-2100': 0.90, '6515-2230': 0.88, '6515-3000': 0.90,
    '6515-3500': 0.90, '6515-3700': 0.90, '6515-4000': 0.90,
    '6515-4100': 0.90, '6515-4200': 0.90, '6515-5200': 0.90,
    '6515-7000': 0.90, '6519-0000': 0.90,
    '6520-5200': 0.90, '6520-7000': 0.92, '6525-0000': 0.95,
    '6525-2000': 0.90, '6525-3000': 0.90,
    '6520-1000': 0.95, '6520-1810': 0.90, '6520-1910': 0.88,
    '6520-1600': 0.90, '6520-1920': 0.90, '6520-3700': 0.90,
    '6526-0000': 0.90, '6548-0000': 1.00, '6570-0000': 0.90,
    '6790-0000': 0.95,
    '6320-0000': 0.96,
    '6450-2000': 1.08, '6451-2000': 1.05, '6452-0000': 1.02, '6453-0000': 1.02,
    '6710-0000': 0.95,
    '6720-1000': 0.95, '6254-0000': 0.70,
    '6820-1000': 1.00,
    '6920-0000': 0.90,
    '7140-0000': 1.00, '7210-0000': 0.92,
    default_repl: 0.92,
    default_bs: 1.00,
    // April (index 3) utility billing anomaly — wrong meter read (~1.5x spike in April only)
    monthMultipliers: {
      '6450-2000': { 3: 1.55 }, // April electric: ~50% above normal for that month
      '6451-2000': { 3: 1.40 }, // April gas: ~40% above normal for that month
    },
  },

  2023: {
    '5120-0000': 1.01,
    '5120-5000': 1.12,   // Loss to lease widening
    '5220-0000': 2.20,   // ~15% vacancy
    '5250-0000': 4.00,
    '6312-0000': 1.00, '6512-1000': 1.00,
    '6360-1000': 2.20,
    '6360-3000': 0.75,
    '6360-2000': 2.00,
    '5190-0000': 0.85,
    '5920-0100': 1.02, '5920-0400': 0.90, '5920-0500': 1.10,
    '5920-0700': 0.95, '5920-0900': 1.15, '5920-1000': 1.00,
    '5920-1100': 1.30, '5920-1500': 0.85, '5920-8000': 1.00,
    '5910-0000': 1.00,
    '5660-0000': 1.50,
    '6210-1000': 1.35, '6210-9000': 1.30,  // More advertising to fill vacancies
    '6311-1000': 1.02, '6311-3000': 1.05, '6252-0000': 1.15,
    '6311-5000': 1.00, '6311-5200': 1.00, '6311-6000': 1.00,
    '6311-7000': 1.05,
    '6340-0000': 1.50, '6342-0000': 1.80,  // More legal/evictions
    '6350-0000': 1.00,
    '6310-6000': 1.09, '6310-6001': 1.12, '6250-0000': 1.25,
    '6390-0100': 1.07, '6310-9800': 1.05,
    '6510-1000': 1.11, '6510-1100': 1.15,
    '6510-3000': 1.10, '6510-3100': 1.14,
    '6711-0000': 1.09,
    '6723-1000': 1.13, '6723-2000': 1.10, '6723-3000': 1.10,
    '6723-4000': 1.10, '6723-5000': 1.10, '6723-6000': 1.10,
    '6725-0000': 1.10, '6750-0000': 1.10, '6760-0000': 1.10,
    '6390-0300': 1.05, '6391-0500': 1.00, '6392-0000': 1.08,
    '6397-2000': 1.10, '6399-0000': 1.12,
    '6515-1000': 1.08, '6515-1600': 1.05, '6515-1800': 1.20,  // More unit turns
    '6515-2100': 1.05, '6515-2230': 1.10, '6515-3000': 1.15,
    '6515-3500': 1.05, '6515-3700': 1.05, '6515-4000': 1.08,
    '6515-4100': 1.05, '6515-4200': 1.12, '6515-5200': 1.05,
    '6515-7000': 1.05, '6519-0000': 1.05,
    '6520-5200': 1.10, '6520-7000': 1.05, '6525-0000': 1.05,
    '6525-2000': 1.10, '6525-3000': 1.05,
    '6520-1000': 1.60, '6520-1810': 1.70, '6520-1910': 1.30,  // High turnover costs
    '6520-1600': 1.05, '6520-1920': 1.05, '6520-3700': 1.05,
    '6526-0000': 1.05, '6548-0000': 1.10, '6570-0000': 1.05,
    '6790-0000': 1.00,
    '6320-0000': 0.97,
    '6450-2000': 1.22, '6451-2000': 1.20, '6452-0000': 1.18, '6453-0000': 1.18,
    '6710-0000': 1.03,
    '6720-1000': 1.07, '6254-0000': 1.20,
    '6820-1000': 1.00,
    '6920-0000': 1.10,
    '7140-0000': 1.00, '7210-0000': 1.05,
    default_repl: 1.08,
    default_bs: 1.00,
    monthMultipliers: {},
  },

  2024: {
    '5120-0000': 1.02,   // Asking rents up but nobody filling
    '5120-5000': 1.20,
    '5220-0000': 3.00,   // ~22% vacancy
    '5250-0000': 6.00,   // Heavy concessions to attract any tenant
    '6312-0000': 1.00, '6512-1000': 1.00,
    '6360-1000': 3.20,   // Bad debt surges
    '6360-3000': 0.40,
    '6360-2000': 2.80,
    '5190-0000': 0.70,
    '5920-0100': 1.05, '5920-0400': 0.85, '5920-0500': 1.20,
    '5920-0700': 0.80, '5920-0900': 1.30, '5920-1000': 1.10,
    '5920-1100': 1.80, '5920-1500': 0.70, '5920-8000': 1.00,
    '5910-0000': 0.90,
    '5660-0000': 2.20,   // Higher interest on reserves
    '6210-1000': 1.60, '6210-9000': 1.50,  // Desperate advertising spend
    '6311-1000': 1.05, '6311-3000': 1.10, '6252-0000': 1.30,
    '6311-5000': 1.02, '6311-5200': 1.00, '6311-6000': 1.02,
    '6311-7000': 1.10,
    '6340-0000': 2.20, '6342-0000': 2.50,  // Heavy eviction legal fees
    '6350-0000': 1.20,
    '6310-6000': 1.19, '6310-6001': 1.25, '6250-0000': 1.50,
    '6390-0100': 1.15, '6310-9800': 1.10,
    '6510-1000': 1.22, '6510-1100': 1.30,
    '6510-3000': 1.21, '6510-3100': 1.32,
    '6711-0000': 1.20,
    '6723-1000': 1.25, '6723-2000': 1.20, '6723-3000': 1.20,
    '6723-4000': 1.20, '6723-5000': 1.20, '6723-6000': 1.20,
    '6725-0000': 1.22, '6750-0000': 1.22, '6760-0000': 1.20,
    '6390-0300': 1.10, '6391-0500': 1.00, '6392-0000': 1.12,
    '6397-2000': 1.15, '6399-0000': 1.20,
    '6515-1000': 1.15, '6515-1600': 1.12, '6515-1800': 1.35,
    '6515-2100': 1.12, '6515-2230': 1.20, '6515-3000': 1.25,
    '6515-3500': 1.12, '6515-3700': 1.12, '6515-4000': 1.15,
    '6515-4100': 1.12, '6515-4200': 1.22, '6515-5200': 1.12,
    '6515-7000': 1.12, '6519-0000': 1.12,
    '6520-5200': 1.15, '6520-7000': 1.10, '6525-0000': 1.08,
    '6525-2000': 1.15, '6525-3000': 1.10,
    '6520-1000': 2.00, '6520-1810': 2.10, '6520-1910': 1.60,  // Massive turnover
    '6520-1600': 1.10, '6520-1920': 1.10, '6520-3700': 1.10,
    '6526-0000': 1.10, '6548-0000': 1.15, '6570-0000': 1.10,
    '6790-0000': 1.00,
    '6320-0000': 0.98,
    '6450-2000': 1.30, '6451-2000': 1.28, '6452-0000': 1.25, '6453-0000': 1.25,
    '6710-0000': 1.07,
    '6720-1000': 1.14, '6254-0000': 1.35,
    '6820-1000': 1.00,
    '6920-0000': 1.20,
    '7140-0000': 1.00, '7210-0000': 1.10,
    default_repl: 1.18,
    default_bs: 1.00,
    monthMultipliers: {
      // November equipment failure — large utility spike
      '6450-2000': { 10: 2.40 },
      '6451-2000': { 10: 1.90 },
    },
  },
};

// ─── Apply scale factor with optional month multiplier ────────────────────────
function applyScale(origVal, scale, monthMultiplier) {
  if (typeof origVal !== 'number') return origVal;
  return Math.round(origVal * scale * monthMultiplier * 100) / 100;
}

// ─── Build lookup: accountCode -> row index ───────────────────────────────────
function buildAccountIndex(rows) {
  const idx = new Map();
  rows.forEach((row, i) => {
    if (row && row[0]) idx.set(String(row[0]), i);
  });
  return idx;
}

// ─── Sum monthly values across multiple row indices ───────────────────────────
function sumRows(rows, rowIndices) {
  const sums = new Array(12).fill(0);
  for (const ri of rowIndices) {
    const row = rows[ri];
    if (!row) continue;
    for (let m = 0; m < 12; m++) {
      const v = row[MONTH_COLS[m]];
      if (typeof v === 'number') sums[m] += v;
    }
  }
  return sums;
}

function writeMonthly(row, sums) {
  let total = 0;
  for (let m = 0; m < 12; m++) {
    const v = Math.round(sums[m] * 100) / 100;
    row[MONTH_COLS[m]] = v;
    total += v;
  }
  if (typeof row[TOTAL_COL] === 'number' || row[TOTAL_COL] !== undefined) {
    row[TOTAL_COL] = Math.round(total * 100) / 100;
  }
}

// ─── Main generator ───────────────────────────────────────────────────────────
function generateYear(year) {
  const wb = XLSX.readFile(TEMPLATE);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const config = YEAR_CONFIGS[year];

  // 1. Update header rows
  rows[2][0] = `Period = Jan ${year}-Dec ${year}`;
  for (let c = 0; c < 12; c++) {
    if (rows[4][2 + c]) rows[4][2 + c] = `${MONTHS[c]} ${year}`;
  }

  // 2. Build account index
  const acIdx = buildAccountIndex(rows);

  function rowOf(ac) { return acIdx.get(ac); }

  function getScale(ac) {
    if (ac.match(/^[123]\d{3}/)) return config.default_bs ?? 1.00;
    if (ac.startsWith('80')) return config.default_repl ?? 0.95;
    return config[ac] ?? 1.00;
  }

  // 3. Scale all detail rows (those with account codes)
  for (const [ac, ri] of acIdx) {
    const row = rows[ri];
    if (!row) continue;
    const scale = getScale(ac);
    const monthMults = (config.monthMultipliers || {})[ac] || {};
    for (let m = 0; m < 12; m++) {
      const origVal = row[MONTH_COLS[m]];
      if (typeof origVal === 'number') {
        row[MONTH_COLS[m]] = applyScale(origVal, scale, monthMults[m] || 1.0);
      }
    }
    // Recalculate total
    let total = 0;
    for (let m = 0; m < 12; m++) {
      if (typeof row[MONTH_COLS[m]] === 'number') total += row[MONTH_COLS[m]];
    }
    if (typeof row[TOTAL_COL] === 'number') row[TOTAL_COL] = Math.round(total * 100) / 100;
  }

  // 4. Recalculate all subtotal rows from detail values
  // Helper: get monthly sums for a list of account codes
  function getMonthly(...acs) {
    const sums = new Array(12).fill(0);
    for (const ac of acs) {
      const ri = rowOf(ac);
      if (ri == null) continue;
      const row = rows[ri];
      for (let m = 0; m < 12; m++) {
        const v = row[MONTH_COLS[m]];
        if (typeof v === 'number') sums[m] += v;
      }
    }
    return sums;
  }

  // Helper: add two monthly arrays
  function add(...arrays) {
    const result = new Array(12).fill(0);
    for (const arr of arrays) for (let m = 0; m < 12; m++) result[m] += arr[m];
    return result;
  }

  function findRowByLabel(label) {
    return rows.findIndex(r => r && String(r[1] ?? '').trim() === label);
  }

  function setSubtotal(label, sums) {
    const ri = findRowByLabel(label);
    if (ri === -1) return;
    writeMonthly(rows[ri], sums);
  }

  // ── Revenue section ──────────────────────────────────────────────────────────
  const gprDetail     = getMonthly('5120-0000', '5120-5000');
  setSubtotal('TOTAL GROSS POTENTIAL RENT', gprDetail);

  const vacancyDetail = getMonthly('5220-0000');
  // Two rows named "LOSS DUE TO VACANCIES" — find both and update both
  rows.forEach((r, ri) => {
    if (r && String(r[1] ?? '').trim() === 'LOSS DUE TO VACANCIES') writeMonthly(rows[ri], vacancyDetail);
  });

  const concessionDetail = getMonthly('5250-0000');
  rows.forEach((r, ri) => {
    if (r && String(r[1] ?? '').trim() === 'LOSS DUE TO CONCESSIONS') writeMonthly(rows[ri], concessionDetail);
  });

  const officeModel   = getMonthly('6312-0000', '6512-1000');
  setSubtotal('TOTAL OFFICE MODEL & RENT FREE UNITS', officeModel);

  const netBadDebt    = getMonthly('6360-1000', '6360-3000');
  setSubtotal('NET BAD DEBT EXPENSE (RECOVERY)', netBadDebt);

  const totalLoss     = add(vacancyDetail, concessionDetail, officeModel, netBadDebt);
  setSubtotal('TOTAL LOSS', totalLoss);

  const netRentalRev  = add(gprDetail, totalLoss);
  setSubtotal('NET RENTAL REVENUE', netRentalRev);

  const otherTenantDetail = getMonthly(
    '5190-0000','5920-0100','5920-0400','5920-0500','5920-0700',
    '5920-0900','5920-1000','5920-1100','5920-1500','5920-8000','6360-2000'
  );
  setSubtotal('TOTAL OTHER TENANT CHARGES', otherTenantDetail);

  const otherRevDetail = getMonthly('5910-0000');
  setSubtotal('TOTAL OTHER REVENUE', otherRevDetail);

  const corpRevDetail  = getMonthly('5660-0000');
  setSubtotal('TOTAL OTHER CORPORATE REVENUE', corpRevDetail);
  setSubtotal('TOTAL CORPORATE REVENUE', corpRevDetail);

  const totalNonRental = add(otherTenantDetail, otherRevDetail, corpRevDetail);
  setSubtotal('TOTAL NON-RENTAL REVENUE', totalNonRental);

  const totalRevenue   = add(netRentalRev, totalNonRental);
  setSubtotal('TOTAL REVENUE', totalRevenue);

  // ── Controllable expenses ────────────────────────────────────────────────────
  const advertising    = getMonthly('6210-1000', '6210-9000');
  setSubtotal('TOTAL ADVERTISING AND MARKETING EXPENSE', advertising);

  const officeExp      = getMonthly('6311-1000','6311-3000','6252-0000','6311-5000','6311-5200','6311-6000','6311-7000');
  setSubtotal('TOTAL OFFICE EXPENSE', officeExp);

  const legal          = getMonthly('6340-0000','6342-0000','6350-0000');
  setSubtotal('TOTAL LEGAL / AUDIT ACCOUNTING', legal);

  const officePayroll  = getMonthly('6310-6000','6310-6001','6250-0000','6390-0100','6310-9800');
  setSubtotal('TOTAL OFFICE PAYROLL', officePayroll);

  const maintPayroll   = getMonthly('6510-1000','6510-1100','6510-3000','6510-3100');
  setSubtotal('TOTAL MAINTENANCE PAYROLL', maintPayroll);

  const payrollTaxes   = getMonthly('6711-0000');
  setSubtotal('TOTAL PAYROLL TAXES', payrollTaxes);

  const healthIns      = getMonthly('6723-1000','6723-2000','6723-3000','6723-4000','6723-5000','6723-6000','6725-0000','6750-0000','6760-0000');
  setSubtotal('TOTAL HEALTH INSURANCE AND BENEFITS', healthIns);

  const totalPayroll   = add(officePayroll, maintPayroll, payrollTaxes, healthIns);
  setSubtotal('TOTAL PAYROLL AND BENEFITS', totalPayroll);

  const miscAdmin      = getMonthly('6390-0300','6391-0500','6392-0000','6397-2000','6399-0000');
  setSubtotal('TOTAL MISCELLANEOUS ADMIN EXPENSE', miscAdmin);

  const maintSupplies  = getMonthly(
    '6515-1000','6515-1600','6515-1800','6515-2100','6515-2230','6515-3000',
    '6515-3500','6515-3700','6515-4000','6515-4100','6515-4200','6515-5200','6515-7000','6519-0000'
  );
  setSubtotal('TOTAL MAINTENANCE SUPPLIES', maintSupplies);

  const maintContracts = getMonthly('6520-5200','6520-7000','6525-0000','6525-2000','6525-3000');
  setSubtotal('TOTAL MAINTENANCE CONTRACTS', maintContracts);

  const turnover       = getMonthly('6520-1000','6520-1810','6520-1910');
  setSubtotal('TOTAL TURNOVER', turnover);

  const otherMaint     = getMonthly('6520-1600','6520-1920','6520-3700','6526-0000','6548-0000','6570-0000');
  setSubtotal('TOTAL OTHER OPERATING / MAINTENANCE', otherMaint);

  const totalOpMaint   = add(maintSupplies, maintContracts, turnover, otherMaint);
  setSubtotal('TOTAL OPERATING AND MAINTENANCE', totalOpMaint);

  const miscTaxes      = getMonthly('6790-0000');
  setSubtotal('TOTAL MISC TAXES / INSURANCE / LICENSES / PERMITS', miscTaxes);

  const totalControllable = add(advertising, officeExp, legal, totalPayroll, miscAdmin, totalOpMaint, miscTaxes);
  setSubtotal('TOTAL CONTROLLABLE EXPENSES', totalControllable);

  // ── Non-controllable expenses ────────────────────────────────────────────────
  const mgmtFees       = getMonthly('6320-0000');
  setSubtotal('TOTAL MANAGEMENT FEES', mgmtFees);

  const utilities      = getMonthly('6450-2000','6451-2000','6452-0000','6453-0000');
  setSubtotal('TOTAL UTILITIES EXPENSE', utilities);

  const reTaxes        = getMonthly('6710-0000');
  setSubtotal('TOTAL REAL ESTATE TAXES', reTaxes);

  const insurance      = getMonthly('6720-1000','6254-0000');
  setSubtotal('TOTAL PROPERTY AND LIABILITY INSURANCE', insurance);

  const totalNonCtrl   = add(mgmtFees, utilities, reTaxes, insurance);
  setSubtotal('TOTAL NON-CONTROLLABLE EXPENSES', totalNonCtrl);

  const totalOpex      = add(totalControllable, totalNonCtrl);
  setSubtotal('TOTAL OPERATING EXPENSES', totalOpex);

  // ── NOI ──────────────────────────────────────────────────────────────────────
  const noi = totalRevenue.map((v, m) => v - totalOpex[m]);
  setSubtotal('NET OPERATING INCOME (LOSS)', noi);

  // ── Non-operating ────────────────────────────────────────────────────────────
  const financial      = getMonthly('6820-1000');
  setSubtotal('TOTAL FINANCIAL EXPENSE', financial);

  const otherExp       = getMonthly('6920-0000');
  setSubtotal('TOTAL OTHER EXPENSE (REVENUE)', otherExp);

  const partnership    = getMonthly('7140-0000','7210-0000');
  setSubtotal('NET PARTNERSHIP EXPENSE (REVENUE)', partnership);

  // Replacement expense — scale all 80xx rows by default_repl, then sum
  const replAcs = [...acIdx.keys()].filter(ac => ac.startsWith('80'));
  const replacement    = getMonthly(...replAcs);
  setSubtotal('TOTAL REPLACEMENT EXPENSE', replacement);

  const totalNonOp     = add(financial, otherExp, partnership, replacement);
  setSubtotal('TOTAL NON-OPERATING EXPENSE (REVENUE)', totalNonOp);

  const netIncome      = noi.map((v, m) => v - totalNonOp[m]);
  setSubtotal('NET INCOME (LOSS)', netIncome);

  // Balance sheet rows stay at 2025 values (keep as-is — AI doesn't use them for key figures)
  // Cash flow = NET INCOME + TOTAL CHANGES TO BALANCE SHEET
  const bsChanges      = rows.findIndex(r => r && String(r[1] ?? '').trim() === 'TOTAL CHANGES TO BALANCE SHEET');
  if (bsChanges !== -1) {
    const bsRow = rows[bsChanges];
    const cashFlow = netIncome.map((v, m) => {
      const bs = bsRow[MONTH_COLS[m]];
      return typeof bs === 'number' ? v + bs : v;
    });
    setSubtotal('CASH FLOW', cashFlow);
  }

  // 5. Write output
  const newWb = XLSX.utils.book_new();
  const newSheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(newWb, newSheet, 'Report');
  const outPath = path.join('data', `12_Month_Statement_secesml_accrual-2 ${year}.xlsx`);
  XLSX.writeFile(newWb, outPath);
  console.log(`✓ ${year}: ${outPath}`);
}

console.log('Generating test statements...');
[2021, 2022, 2023, 2024].forEach(year => {
  try { generateYear(year); }
  catch (e) { console.error(`✗ ${year}:`, e.message, e.stack); }
});
console.log('Done.');
