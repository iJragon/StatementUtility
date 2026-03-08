'use client';

import { useState } from 'react';
import type { AnalysisResult } from '@/lib/models/statement';

interface DealDetailsTabProps {
  analysis: AnalysisResult;
}

interface DealInputs {
  purchasePrice: string;
  marketValue: string;
  units: string;
  sqFt: string;
  loanBalance: string;
  interestRate: string;
  annualDebtService: string;
}

function safeNum(val: string): number | null {
  const n = parseFloat(val.replace(/[$,%\s]/g, ''));
  return isNaN(n) ? null : n;
}

function fmt(val: number | null, prefix = '', suffix = '', decimals = 2): string {
  if (val === null) return 'N/A';
  return `${prefix}${val.toFixed(decimals)}${suffix}`;
}

function fmtDollar(val: number | null): string {
  if (val === null) return 'N/A';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function statusForMetric(metric: string, value: number | null): 'good' | 'warning' | 'bad' | 'unknown' {
  if (value === null) return 'unknown';
  switch (metric) {
    case 'capRate': return value >= 6 ? 'good' : value >= 4 ? 'warning' : 'bad';
    case 'coc': return value >= 8 ? 'good' : value >= 4 ? 'warning' : 'bad';
    case 'ltv': return value <= 75 ? 'good' : value <= 85 ? 'warning' : 'bad';
    case 'dscr': return value >= 1.25 ? 'good' : value >= 1.0 ? 'warning' : 'bad';
    case 'debtYield': return value >= 8 ? 'good' : value >= 6 ? 'warning' : 'bad';
    default: return 'unknown';
  }
}

export default function DealDetailsTab({ analysis }: DealDetailsTabProps) {
  const { statement } = analysis;
  const noi = statement.keyFigures['noi']?.annualTotal ?? null;

  const [inputs, setInputs] = useState<DealInputs>({
    purchasePrice: '',
    marketValue: '',
    units: '',
    sqFt: '',
    loanBalance: '',
    interestRate: '',
    annualDebtService: '',
  });

  function update(key: keyof DealInputs, value: string) {
    setInputs(prev => ({ ...prev, [key]: value }));
  }

  const purchasePrice = safeNum(inputs.purchasePrice);
  const marketValue = safeNum(inputs.marketValue);
  const units = safeNum(inputs.units);
  const sqFt = safeNum(inputs.sqFt);
  const loanBalance = safeNum(inputs.loanBalance);
  const interestRate = safeNum(inputs.interestRate);
  const annualDebtService = safeNum(inputs.annualDebtService);

  // Annual GPR for GRM
  const grossRevenue = statement.keyFigures['total_revenue']?.annualTotal ?? null;

  // Calculated metrics
  const capRate = noi !== null && purchasePrice !== null && purchasePrice > 0
    ? (noi / purchasePrice) * 100 : null;

  const cashAvailForEquity = noi !== null && annualDebtService !== null
    ? noi - annualDebtService : null;
  const equityInvested = purchasePrice !== null && loanBalance !== null
    ? purchasePrice - loanBalance : null;
  const coc = cashAvailForEquity !== null && equityInvested !== null && equityInvested > 0
    ? (cashAvailForEquity / equityInvested) * 100 : null;

  const grm = purchasePrice !== null && grossRevenue !== null && grossRevenue > 0
    ? purchasePrice / grossRevenue : null;

  const ltv = loanBalance !== null && (marketValue ?? purchasePrice) !== null && (marketValue ?? purchasePrice)! > 0
    ? (loanBalance / (marketValue ?? purchasePrice)!) * 100 : null;

  const dscr = noi !== null && annualDebtService !== null && annualDebtService > 0
    ? noi / annualDebtService : null;

  const debtYield = noi !== null && loanBalance !== null && loanBalance > 0
    ? (noi / loanBalance) * 100 : null;

  const noiPerUnit = noi !== null && units !== null && units > 0
    ? noi / units : null;

  const pricePerUnit = purchasePrice !== null && units !== null && units > 0
    ? purchasePrice / units : null;

  const metrics = [
    { key: 'capRate', label: 'Cap Rate', value: capRate, display: fmt(capRate, '', '%') },
    { key: 'coc', label: 'Cash-on-Cash', value: coc, display: fmt(coc, '', '%') },
    { key: 'grm', label: 'GRM', value: grm, display: fmt(grm, '', 'x') },
    { key: 'ltv', label: 'LTV', value: ltv, display: fmt(ltv, '', '%') },
    { key: 'dscr', label: 'DSCR', value: dscr, display: fmt(dscr, '', 'x') },
    { key: 'debtYield', label: 'Debt Yield', value: debtYield, display: fmt(debtYield, '', '%') },
    { key: 'noiPerUnit', label: 'NOI / Unit', value: noiPerUnit, display: fmtDollar(noiPerUnit) },
    { key: 'pricePerUnit', label: 'Price / Unit', value: pricePerUnit, display: fmtDollar(pricePerUnit) },
  ];

  const inputStyle = {
    backgroundColor: 'var(--bg)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  };

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text)' }}>Deal Inputs</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { key: 'purchasePrice' as const, label: 'Purchase Price ($)', placeholder: '5,000,000' },
            { key: 'marketValue' as const, label: 'Market Value ($)', placeholder: '5,200,000' },
            { key: 'units' as const, label: 'Units', placeholder: '100' },
            { key: 'sqFt' as const, label: 'Sq Ft', placeholder: '80,000' },
            { key: 'loanBalance' as const, label: 'Loan Balance ($)', placeholder: '3,500,000' },
            { key: 'interestRate' as const, label: 'Interest Rate (%)', placeholder: '5.5' },
            { key: 'annualDebtService' as const, label: 'Annual Debt Service ($)', placeholder: '250,000' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
                {label}
              </label>
              <input
                type="text"
                value={inputs[key]}
                onChange={e => update(key, e.target.value)}
                placeholder={placeholder}
                className="input-field text-sm"
                style={inputStyle}
              />
            </div>
          ))}
        </div>
      </div>

      {/* NOI from statement */}
      {noi !== null && (
        <div className="p-3 rounded-md text-sm" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>
          Using NOI from statement: <strong>{fmtDollar(noi)}</strong> annually
        </div>
      )}

      {/* Calculated metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map(({ key, label, value, display }) => {
          const status = statusForMetric(key, value);
          return (
            <div key={key} className="card text-center">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{display}</p>
              {value !== null && (
                <span className={`badge-${status} mt-1 inline-block`}>{status}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
