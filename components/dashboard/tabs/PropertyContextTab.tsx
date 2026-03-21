'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import type { AnalysisResult, PromotedRow } from '@/lib/models/statement';
import Tooltip from '@/components/Tooltip';

// ── Inputs interface (persisted to localStorage per fileHash) ─────────────────

export interface PropertyInputs {
  purchasePrice: string;
  marketValue: string;
  units: string;
  sqFt: string;
  headcount: string;
  loanBalance: string;
  interestRate: string;
  annualDebtService: string;
}

export const DEFAULT_PROPERTY_INPUTS: PropertyInputs = {
  purchasePrice: '',
  marketValue: '',
  units: '',
  sqFt: '',
  headcount: '',
  loanBalance: '',
  interestRate: '',
  annualDebtService: '',
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface PropertyContextTabProps {
  analysis: AnalysisResult;
  inputs: PropertyInputs;
  onInputChange: (key: keyof PropertyInputs, value: string) => void;
  onPromotedRowsChange: (rows: PromotedRow[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(val: string): number | null {
  const n = parseFloat(val.replace(/[$,%\s]/g, ''));
  return isNaN(n) ? null : n;
}

function fmtDollar(val: number | null): string {
  if (val === null) return 'N/A';
  if (!isFinite(val) || isNaN(val)) return 'Check inputs';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtX(val: number | null, decimals = 2): string {
  if (val === null) return 'N/A';
  if (!isFinite(val) || isNaN(val)) return 'Check inputs';
  return `${val.toFixed(decimals)}x`;
}

function fmtPct(val: number | null): string {
  if (val === null) return 'N/A';
  if (!isFinite(val) || isNaN(val)) return 'Check inputs';
  return `${val.toFixed(1)}%`;
}

function statusFor(metric: string, value: number | null): 'good' | 'warning' | 'bad' | 'unknown' {
  if (value === null) return 'unknown';
  switch (metric) {
    case 'capRate':   return value >= 6 ? 'good' : value >= 4 ? 'warning' : 'bad';
    case 'coc':       return value >= 8 ? 'good' : value >= 4 ? 'warning' : 'bad';
    case 'ltv':       return value <= 75 ? 'good' : value <= 85 ? 'warning' : 'bad';
    case 'dscr':      return value >= 1.25 ? 'good' : value >= 1.0 ? 'warning' : 'bad';
    case 'debtYield': return value >= 8 ? 'good' : value >= 6 ? 'warning' : 'bad';
    default:          return 'unknown';
  }
}

const KEY_FIGURE_LABELS: Record<string, string> = {
  gross_potential_rent: 'Gross Potential Rent',
  vacancy_loss: 'Vacancy Loss',
  concession_loss: 'Concession Loss',
  bad_debt: 'Bad Debt',
  net_rental_revenue: 'Net Rental Revenue',
  other_tenant_charges: 'Other Tenant Charges',
  total_revenue: 'Total Revenue',
  controllable_expenses: 'Controllable Expenses',
  non_controllable_expenses: 'Non-Controllable Expenses',
  total_operating_expenses: 'Total Operating Expenses',
  noi: 'Net Operating Income',
  total_payroll: 'Total Payroll',
  management_fees: 'Management Fees',
  utilities: 'Utilities',
  real_estate_taxes: 'Real Estate Taxes',
  insurance: 'Insurance',
  financial_expense: 'Financial Expense / Debt Service',
  replacement_expense: 'Replacement Reserve',
  total_non_operating: 'Total Non-Operating',
  net_income: 'Net Income',
  cash_flow: 'Cash Flow',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, status,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  status?: 'good' | 'warning' | 'bad' | 'unknown';
}) {
  return (
    <div className="card text-center">
      <p className="text-xs leading-snug" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{sub}</p>}
      {status && status !== 'unknown' && (
        <span className={`badge-${status} mt-1 inline-block`}>{status}</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PropertyContextTab({
  analysis,
  inputs,
  onInputChange,
  onPromotedRowsChange,
}: PropertyContextTabProps) {
  const { statement } = analysis;
  const kf = statement.keyFigures;

  // Statement data
  const noi          = kf['noi']?.annualTotal ?? null;
  const totalRev     = kf['total_revenue']?.annualTotal ?? null;
  const payroll      = kf['total_payroll']?.annualTotal ?? null;
  const grossRevenue = totalRev;

  // User inputs
  const purchasePrice    = safeNum(inputs.purchasePrice);
  const marketValue      = safeNum(inputs.marketValue);
  const units            = safeNum(inputs.units);
  const sqFt             = safeNum(inputs.sqFt);
  const headcount        = safeNum(inputs.headcount);
  const loanBalance      = safeNum(inputs.loanBalance);
  const annualDebtService = safeNum(inputs.annualDebtService);

  // ── Productivity metrics ────────────────────────────────────────────────────
  const payrollAbs = payroll !== null ? Math.abs(payroll) : null;
  const revAbs     = totalRev !== null ? Math.abs(totalRev) : null;

  const noiPerPayrollDollar  = noi !== null && payrollAbs && payrollAbs > 0 ? noi / payrollAbs : null;
  const revPerPayrollDollar  = revAbs !== null && payrollAbs && payrollAbs > 0 ? revAbs / payrollAbs : null;
  const noiPerUnit           = noi !== null && units && units > 0 ? noi / units : null;
  const revPerUnit           = revAbs !== null && units && units > 0 ? revAbs / units : null;
  const noiPerEmployee       = noi !== null && headcount && headcount > 0 ? noi / headcount : null;
  const revPerEmployee       = revAbs !== null && headcount && headcount > 0 ? revAbs / headcount : null;

  // ── Investment metrics ──────────────────────────────────────────────────────
  const capRate = noi !== null && purchasePrice && purchasePrice > 0
    ? (noi / purchasePrice) * 100 : null;
  const cashAvailForEquity = noi !== null && annualDebtService !== null ? noi - annualDebtService : null;
  const equityInvested     = purchasePrice !== null && loanBalance !== null ? purchasePrice - loanBalance : null;
  const coc = cashAvailForEquity !== null && equityInvested && equityInvested > 0
    ? (cashAvailForEquity / equityInvested) * 100 : null;
  const grm = purchasePrice !== null && grossRevenue && Math.abs(grossRevenue) > 0
    ? purchasePrice / Math.abs(grossRevenue) : null;
  const ltv = loanBalance !== null && (marketValue ?? purchasePrice) && (marketValue ?? purchasePrice)! > 0
    ? (loanBalance / (marketValue ?? purchasePrice)!) * 100 : null;
  const dscr = noi !== null && annualDebtService && annualDebtService > 0
    ? noi / annualDebtService : null;
  const debtYield = noi !== null && loanBalance && loanBalance > 0
    ? (noi / loanBalance) * 100 : null;
  const pricePerUnit = purchasePrice !== null && units && units > 0 ? purchasePrice / units : null;

  // ── Statement Explorer state ────────────────────────────────────────────────
  const [promotedRows, setPromotedRows] = useState<PromotedRow[]>(
    statement.promotedRows ?? []
  );
  const [search, setSearch] = useState('');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [pendingRow, setPendingRow] = useState<number | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');

  // Sync if analysis changes (e.g. navigating to a different file)
  useEffect(() => {
    setPromotedRows(statement.promotedRows ?? []);
  }, [statement]);

  function promoteRow(rowNumber: number, sourceLabel: string, annualTotal: number | null) {
    const label = pendingLabel.trim() || sourceLabel;
    const next = [
      ...promotedRows.filter(r => r.rowNumber !== rowNumber),
      { rowNumber, label, sourceLabel, annualTotal },
    ];
    setPromotedRows(next);
    onPromotedRowsChange(next);
    setPendingRow(null);
    setPendingLabel('');
  }

  function unpromoteRow(rowNumber: number) {
    const next = promotedRows.filter(r => r.rowNumber !== rowNumber);
    setPromotedRows(next);
    onPromotedRowsChange(next);
  }

  const promotedSet = new Set(promotedRows.map(r => r.rowNumber));
  const filteredRows = statement.allRows.filter(r => {
    if (!search) return true;
    return r.label.toLowerCase().includes(search.toLowerCase());
  });

  const inputStyle = {
    backgroundColor: 'var(--bg)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  };

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Property Inputs ─────────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text)' }}>
          Property Inputs
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          Values the statement does not contain. Filling these in unlocks additional metrics below.
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {([
            { key: 'units'            as const, label: 'Total Units',            placeholder: '120',       tooltip: 'Total Units' },
            { key: 'headcount'        as const, label: 'Total Employees',         placeholder: '8',         tooltip: 'Total Employees' },
            { key: 'sqFt'             as const, label: 'Square Footage',          placeholder: '95000',     tooltip: undefined },
            { key: 'purchasePrice'    as const, label: 'Purchase Price',          placeholder: '6500000',   tooltip: 'Purchase Price' },
            { key: 'marketValue'      as const, label: 'Market Value',            placeholder: '7200000',   tooltip: 'Market Value' },
            { key: 'loanBalance'      as const, label: 'Loan Balance',            placeholder: '4500000',   tooltip: 'Loan Balance' },
            { key: 'interestRate'     as const, label: 'Interest Rate (%)',       placeholder: '5.5',       tooltip: 'Interest Rate' },
            { key: 'annualDebtService'as const, label: 'Annual Debt Service',     placeholder: '290000',    tooltip: 'Annual Debt Service' },
          ]).map(({ key, label, placeholder, tooltip }) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
                {tooltip ? <Tooltip term={tooltip}>{label}</Tooltip> : label}
              </label>
              <input
                type="text"
                value={inputs[key]}
                onChange={e => onInputChange(key, e.target.value)}
                placeholder={placeholder}
                className="input-field text-sm"
                style={inputStyle}
              />
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
          Enter dollar amounts as full numbers (e.g. <code className="font-mono">6500000</code> not <code className="font-mono">6.5M</code>).
        </p>
      </div>

      {/* ── Productivity Metrics ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Productivity Metrics
          </p>
          {(units === null || headcount === null) && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Add units and employees above to unlock per-unit and per-employee metrics
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard
            label={<Tooltip term="NOI per Payroll Dollar">NOI per Payroll Dollar</Tooltip>}
            value={fmtX(noiPerPayrollDollar)}
            sub={noiPerPayrollDollar !== null ? `$1 of payroll generates ${fmtX(noiPerPayrollDollar)} of NOI` : 'Requires payroll in statement'}
          />
          <MetricCard
            label={<Tooltip term="Revenue per Payroll Dollar">Revenue per Payroll Dollar</Tooltip>}
            value={fmtX(revPerPayrollDollar)}
            sub={revPerPayrollDollar !== null ? `$1 of payroll drives ${fmtX(revPerPayrollDollar)} of revenue` : 'Requires payroll in statement'}
          />
          <MetricCard
            label={<Tooltip term="NOI per Unit">NOI per Unit</Tooltip>}
            value={fmtDollar(noiPerUnit)}
            sub="Annual NOI divided by unit count"
          />
          <MetricCard
            label={<Tooltip term="Revenue per Unit">Revenue per Unit</Tooltip>}
            value={fmtDollar(revPerUnit)}
            sub="Annual revenue divided by unit count"
          />
          <MetricCard
            label={<Tooltip term="NOI per Employee">NOI per Employee</Tooltip>}
            value={fmtDollar(noiPerEmployee)}
            sub="Annual NOI divided by headcount"
          />
          <MetricCard
            label={<Tooltip term="Revenue per Employee">Revenue per Employee</Tooltip>}
            value={fmtDollar(revPerEmployee)}
            sub="Annual revenue divided by headcount"
          />
        </div>
      </div>

      {/* ── Investment Metrics ───────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Investment Metrics
        </p>
        {noi !== null && (
          <div className="mb-3 px-3 py-2 rounded-md text-xs" style={{ backgroundColor: 'rgba(59,130,246,0.08)', color: 'var(--accent)' }}>
            Using NOI from statement: <strong>{fmtDollar(noi)}</strong> annually
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([
            { key: 'capRate',      label: 'Cap Rate',             tooltip: 'Cap Rate',                         display: fmtPct(capRate),         value: capRate },
            { key: 'coc',          label: 'Cash-on-Cash Return',  tooltip: 'Cash-on-Cash Return',              display: fmtPct(coc),             value: coc },
            { key: 'grm',          label: 'Gross Rent Multiplier',tooltip: 'Gross Rent Multiplier',            display: fmtX(grm),               value: grm },
            { key: 'ltv',          label: 'Loan-to-Value',        tooltip: 'Loan-to-Value',                    display: fmtPct(ltv),             value: ltv },
            { key: 'dscr',         label: 'Debt Service Coverage',tooltip: 'DSCR (Debt Service Coverage Ratio)', display: fmtX(dscr),            value: dscr },
            { key: 'debtYield',    label: 'Debt Yield',           tooltip: 'Debt Yield',                       display: fmtPct(debtYield),       value: debtYield },
            { key: 'noiPerUnit',   label: 'NOI per Unit',         tooltip: 'NOI per Unit',                     display: fmtDollar(noiPerUnit),   value: noiPerUnit },
            { key: 'pricePerUnit', label: 'Price per Unit',       tooltip: 'Price per Unit',                   display: fmtDollar(pricePerUnit), value: pricePerUnit },
          ]).map(({ key, label, tooltip, display, value }) => (
            <MetricCard
              key={key}
              label={<Tooltip term={tooltip}>{label}</Tooltip>}
              value={display}
              status={statusFor(key, value)}
            />
          ))}
        </div>
      </div>

      {/* ── Custom Metrics (promoted rows) ──────────────────────────────────── */}
      {promotedRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
            Custom Metrics
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {promotedRows.map(r => (
              <div key={r.rowNumber} className="card relative group">
                <button
                  onClick={() => unpromoteRow(r.rowNumber)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--muted)', backgroundColor: 'var(--border)' }}
                  title="Remove"
                >
                  x
                </button>
                <p className="text-xs font-semibold pr-6" style={{ color: 'var(--text)' }}>{r.label}</p>
                {r.label !== r.sourceLabel && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>from: {r.sourceLabel}</p>
                )}
                <p className="text-xl font-bold mt-2" style={{ color: 'var(--accent)' }}>
                  {fmtDollar(r.annualTotal)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>annual total</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Statement Explorer ───────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setExplorerOpen(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold transition-opacity hover:opacity-70"
          style={{ color: 'var(--accent)' }}
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            style={{ transform: explorerOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {explorerOpen ? 'Hide' : 'Open'} statement explorer
          <span className="font-normal" style={{ color: 'var(--muted)' }}>
            ({statement.allRows.length} rows)
          </span>
        </button>

        {explorerOpen && (
          <div className="card mt-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Statement Explorer</h3>
              {promotedRows.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {promotedRows.length} pinned
                </span>
              )}
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Every row parsed from your statement. Pin any row to surface it as a custom metric above,
              useful for line items your statement contains that our standard model does not cover.
            </p>

            <input
              type="text"
              placeholder="Search rows..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field text-sm mb-3 w-full"
              style={inputStyle}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="text-left pb-2 font-medium pr-4" style={{ color: 'var(--muted)', minWidth: 40 }}>#</th>
                    <th className="text-left pb-2 font-medium pr-4" style={{ color: 'var(--muted)' }}>Row Label</th>
                    <th className="text-right pb-2 font-medium px-3" style={{ color: 'var(--muted)' }}>Annual Total</th>
                    <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)', minWidth: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => {
                    const isPinned = promotedSet.has(row.rowNumber);
                    const isPending = pendingRow === row.rowNumber;
                    return (
                      <tr
                        key={row.rowNumber}
                        className="border-b"
                        style={{
                          borderColor: 'var(--border)',
                          opacity: isPinned ? 0.45 : 1,
                        }}
                      >
                        <td className="py-1.5 pr-4 font-mono" style={{ color: 'var(--muted)' }}>
                          {row.rowNumber}
                        </td>
                        <td className="py-1.5 pr-4" style={{ color: 'var(--text)', paddingLeft: row.indentLevel * 10 }}>
                          {row.label}
                          {row.isSubtotal && (
                            <span className="ml-1.5 text-xs px-1 rounded" style={{ backgroundColor: 'var(--border)', color: 'var(--muted)' }}>
                              subtotal
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-right px-3 font-mono" style={{ color: 'var(--text)' }}>
                          {row.annualTotal !== null
                            ? `${row.annualTotal < 0 ? '-' : ''}$${Math.abs(row.annualTotal).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                            : '-'}
                        </td>
                        <td className="py-1.5 text-right">
                          {isPinned ? (
                            <button
                              onClick={() => unpromoteRow(row.rowNumber)}
                              className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-70"
                              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                            >
                              unpin
                            </button>
                          ) : isPending ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                autoFocus
                                type="text"
                                placeholder={row.label}
                                value={pendingLabel}
                                onChange={e => setPendingLabel(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') promoteRow(row.rowNumber, row.label, row.annualTotal);
                                  if (e.key === 'Escape') { setPendingRow(null); setPendingLabel(''); }
                                }}
                                className="input-field text-xs"
                                style={{ ...inputStyle, width: 120, padding: '2px 6px' }}
                              />
                              <button
                                onClick={() => promoteRow(row.rowNumber, row.label, row.annualTotal)}
                                className="text-xs px-2 py-0.5 rounded"
                                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                              >
                                Pin
                              </button>
                              <button
                                onClick={() => { setPendingRow(null); setPendingLabel(''); }}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                              >
                                x
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setPendingRow(row.rowNumber); setPendingLabel(''); }}
                              className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-70"
                              style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                            >
                              pin
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRows.length === 0 && (
                <p className="text-center py-6 text-xs" style={{ color: 'var(--muted)' }}>No rows match your search.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── AI Extraction Report ─────────────────────────────────────────────── */}
      {statement.parserReport && statement.parserReport.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text)' }}>AI Extraction Report</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            Shows which row the AI identified for each financial concept. Not found means the concept was absent from this statement.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="text-left pb-2 font-medium" style={{ color: 'var(--muted)' }}>Concept</th>
                  <th className="text-left pb-2 font-medium" style={{ color: 'var(--muted)' }}>Row in Statement</th>
                  <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Annual Total</th>
                  <th className="text-right pb-2 font-medium" style={{ color: 'var(--muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {statement.parserReport.map(entry => (
                  <tr key={entry.key} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-1.5 font-medium" style={{ color: 'var(--text)' }}>
                      {KEY_FIGURE_LABELS[entry.key] ?? entry.key}
                    </td>
                    <td className="py-1.5 font-mono" style={{ color: entry.label ? 'var(--text)' : 'var(--muted)' }}>
                      {entry.label ? `Row ${entry.rowNumber}: "${entry.label}"` : '-'}
                    </td>
                    <td className="py-1.5 text-right font-mono" style={{ color: 'var(--text)' }}>
                      {entry.annualTotal !== null
                        ? `${entry.annualTotal < 0 ? '-' : ''}$${Math.abs(entry.annualTotal).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                        : '-'}
                    </td>
                    <td className="py-1.5 text-right">
                      {entry.label
                        ? <span className="badge-good">found</span>
                        : <span className="badge-unknown">not found</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
