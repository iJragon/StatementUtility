'use client';

import { useState, useRef, useCallback } from 'react';

export const GLOSSARY: Record<string, string> = {
  // ── Revenue & Income ─────────────────────────────────────────────────────
  'Gross Potential Rent': 'Maximum rent achievable if every unit were occupied at full asking price. This is the theoretical income ceiling before any losses.',
  'Gross Revenue': 'Total income collected from rents and other sources after vacancies and deductions. Also called Effective Gross Income.',
  'Net Rental Revenue': 'Gross potential rent minus vacancy, concessions, and bad debt. The actual rental income collected.',
  'Other Tenant Charges': 'Additional income beyond base rent: parking fees, pet fees, laundry, late charges, and miscellaneous tenant income.',
  'Total Revenue': 'All income from the property combined — net rental revenue plus other tenant charges. The top-line number.',
  'Net Operating Income': 'Revenue minus all operating expenses, before any debt payments. The primary profitability metric for rental property. Often called NOI.',
  'Net Income': 'Profit remaining after ALL expenses including debt service and non-operating items. The true bottom line.',
  'Cash Flow': 'Actual cash in or out of the property after every expense. Differs from net income due to non-cash accounting items like depreciation.',

  // ── Expenses ─────────────────────────────────────────────────────────────
  'Total Operating Expenses': 'All costs to run the property: payroll, utilities, taxes, insurance, maintenance, and management fees — before debt service.',
  'Controllable Expenses': 'Costs management can directly reduce: payroll, repairs, marketing, and supplies.',
  'Non-Controllable Expenses': 'Fixed costs management cannot easily change: property taxes, insurance, and replacement reserves.',
  'Financial Expense': 'Debt service payments — mortgage principal and interest. Also called below-the-line expenses since they come after NOI.',
  'Replacement Reserve': 'Money set aside for future capital repairs like roofs, HVAC, and appliances. Treated as an expense even if not spent immediately.',

  // ── Loss Items ───────────────────────────────────────────────────────────
  'Vacancy Loss': 'Rent lost because units are unoccupied. Shown as a deduction from gross potential rent.',
  'Concession Loss': 'Rent discounts given to attract or retain tenants (e.g. "first month free"), expressed as a deduction from potential rent.',
  'Bad Debt': 'Rent that was never collected and written off as a loss. Above 1% warrants investigation.',

  // ── Ratios ───────────────────────────────────────────────────────────────
  'Operating Expense Ratio': 'Total operating expenses as a % of gross revenue. Lower is better. Above 55% signals thin margins.',
  'OER (Operating Expense Ratio)': 'Total operating expenses as a % of gross revenue. Lower is better. Above 55% signals thin margins.',
  'NOI Margin': 'Net Operating Income as a % of gross revenue. Healthy multifamily properties target 45%-65%.',
  'Vacancy Rate': '% of potential rent lost to empty units. Industry target is under 7%. High vacancy points to a leasing or retention problem.',
  'Concession Rate': 'Rent concessions as a % of gross potential rent. High concessions often signal a soft leasing market.',
  'Bad Debt Rate': 'Uncollected rent as a % of revenue. Above 1% warrants attention — may signal collections or tenant quality issues.',
  'Payroll %': 'Staff and personnel costs as a percentage of total revenue. Typically 10%-25% for multifamily.',
  'Management Fee %': 'Property management company fees as a % of revenue. Industry standard is 4%-8%.',
  'Controllable Expense %': 'The share of total expenses that management can directly reduce, like maintenance or staffing.',
  'Break-Even Occupancy': 'The minimum occupancy rate needed to cover all operating expenses. Below this point the property loses money on operations.',
  'Cash Flow Margin': 'Cash remaining as a % of revenue after ALL costs including debt payments. Positive means the property is self-sustaining.',
  'Debt Service Coverage Ratio': 'How many times NOI covers annual mortgage payments. Lenders require at least 1.25x. Below 1.0x means the property cannot service its own debt.',
  'DSCR (Debt Service Coverage Ratio)': 'How many times NOI covers annual mortgage payments. Lenders require at least 1.25x. Below 1.0x means the property cannot service its own debt.',

  // ── Investment Metrics ───────────────────────────────────────────────────
  'Cap Rate': 'Annual NOI divided by the purchase price, as a percentage. Higher cap rate = better return but sometimes higher risk. Multifamily typically trades at 4%-8% cap rates depending on market.',
  'Cash-on-Cash Return': 'Annual cash flow after debt service divided by your actual cash invested (equity). Measures the return on out-of-pocket dollars. Investors typically target 8%+.',
  'Gross Rent Multiplier': 'Purchase price divided by annual gross revenue. A quick valuation shortcut — lower GRM means a better price relative to income. Typical range is 8x-15x.',
  'Loan-to-Value': 'Loan balance as a % of the property value. Lenders use this to assess risk. Above 80% is considered high leverage. Below 75% is conservative.',
  'Debt Yield': 'NOI as a % of the loan balance. Used by lenders to stress-test a loan independent of interest rates. Most lenders want 8%+ before lending.',
  'NOI per Unit': 'Annual Net Operating Income divided by total unit count. Standard way to compare profitability across properties of different sizes.',
  'Price per Unit': 'Purchase price divided by total units. A common shorthand for valuing multifamily properties — higher means a premium market or asset quality.',

  // ── Productivity Metrics ─────────────────────────────────────────────────
  'NOI per Payroll Dollar': 'For every $1 spent on staff, how much NOI is generated. A direct measure of labor efficiency. Higher means staff costs are well-justified by income produced.',
  'Revenue per Payroll Dollar': 'For every $1 spent on staff, how much revenue is generated. A broader measure of staffing efficiency that includes all income sources.',
  'NOI per Employee': 'Annual NOI divided by total headcount. Shows how much income each employee effectively contributes. Useful for benchmarking staffing levels.',
  'Revenue per Employee': 'Annual gross revenue divided by total headcount. Measures overall staff productivity across the property.',
  'Revenue per Unit': 'Annual gross revenue divided by unit count. Useful for comparing revenue performance across properties of different sizes.',

  // ── Input Fields ─────────────────────────────────────────────────────────
  'Total Units': 'The total number of rentable apartment units in the property. Used to calculate per-unit metrics like NOI per unit and price per unit.',
  'Total Employees': 'Total full-time equivalent employees working at or managing this property. Used to calculate productivity metrics like NOI per employee.',
  'Purchase Price': 'The price paid to acquire this property. Used to calculate cap rate, price per unit, GRM, and cash-on-cash return. Enter as a full number (e.g. 6500000).',
  'Market Value': 'Current estimated market value of the property. Used for LTV calculation. If blank, purchase price is used instead.',
  'Loan Balance': 'Outstanding principal on the property mortgage or loan. Used for LTV, debt yield, and cash-on-cash calculations.',
  'Interest Rate': 'Annual interest rate on the mortgage, as a percentage. For reference only — actual debt service input is used for calculations.',
  'Annual Debt Service': 'Total annual mortgage payments including both principal and interest. Used for DSCR and cash-on-cash calculations.',

  // ── Statement / App Concepts ─────────────────────────────────────────────
  'Book Type': 'The accounting method used in this statement. Accrual records income and expenses when earned or incurred; Cash records only when money actually changes hands.',
  'Statement Explorer': 'Browse every row parsed from your uploaded spreadsheet. Pin any row to surface it as a custom metric — useful for line items your statement contains that the standard model does not recognize.',
};

interface TooltipProps {
  term: string;
  children: React.ReactNode;
}

interface Coords { top: number; left: number }

export default function Tooltip({ term, children }: TooltipProps) {
  const definition = GLOSSARY[term];
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<Coords>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 288;
    const tooltipEstHeight = 100;
    const padding = 12;

    let left = rect.left;
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth - padding;
    }
    if (left < padding) left = padding;

    let top = rect.top - tooltipEstHeight - 8;
    if (top < padding) top = rect.bottom + 8;

    setCoords({ top, left });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  if (!definition) return <>{children}</>;

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center gap-1 cursor-help"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
        <span
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold flex-shrink-0 select-none"
          style={{ backgroundColor: 'var(--border)', color: 'var(--muted)' }}
        >
          ?
        </span>
      </span>

      {visible && (
        <span
          className="pointer-events-none fixed z-[9999] rounded-lg p-3 text-xs leading-5 shadow-xl"
          style={{
            top: coords.top,
            left: coords.left,
            width: 288,
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          }}
        >
          <strong className="block mb-1" style={{ color: 'var(--accent)' }}>{term}</strong>
          {definition}
        </span>
      )}
    </>
  );
}
