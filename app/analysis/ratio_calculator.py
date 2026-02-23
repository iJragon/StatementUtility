"""
Deterministic financial ratio calculator.

All ratios are computed from the parsed FinancialStatement with no AI required.
Results include both annual figures and month-by-month breakdowns for trending.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.models.statement import FinancialStatement

# ── Industry benchmarks for multi-family residential ──────────────────────────
BENCHMARKS = {
    "oer":                  {"label": "Operating Expense Ratio",      "good": (0.35, 0.55), "unit": "%"},
    "noi_margin":           {"label": "NOI Margin",                   "good": (0.40, 0.65), "unit": "%"},
    "vacancy_rate":         {"label": "Vacancy Rate",                 "good": (0.00, 0.07), "unit": "%"},
    "concession_rate":      {"label": "Concession Rate",              "good": (0.00, 0.02), "unit": "%"},
    "bad_debt_rate":        {"label": "Bad Debt Rate",                "good": (0.00, 0.01), "unit": "%"},
    "payroll_pct":          {"label": "Payroll % of Revenue",         "good": (0.10, 0.25), "unit": "%"},
    "mgmt_fee_pct":         {"label": "Mgmt Fee % of Revenue",        "good": (0.04, 0.08), "unit": "%"},
    "controllable_pct":     {"label": "Controllable % of Total OpEx", "good": (0.25, 0.50), "unit": "%"},
    "break_even_occupancy": {"label": "Break-Even Occupancy",         "good": (0.00, 0.85), "unit": "%"},
    "cash_flow_margin":     {"label": "Cash Flow Margin",             "good": (0.05, 1.00), "unit": "%"},
    "dscr":                 {"label": "Debt Service Coverage Ratio",  "good": (1.25, 9.99), "unit": "x"},
}


@dataclass
class RatioResult:
    name: str
    label: str
    value: Optional[float]           # annual value
    monthly: Dict[str, Optional[float]] = field(default_factory=dict)
    unit: str = "%"
    benchmark_low: Optional[float] = None
    benchmark_high: Optional[float] = None
    status: str = "unknown"          # "good" | "warning" | "bad" | "unknown"
    note: str = ""

    def pct_display(self) -> str:
        if self.value is None:
            return "N/A"
        if self.unit == "%":
            return f"{self.value * 100:.1f}%"
        return f"{self.value:.2f}x"


@dataclass
class RatioReport:
    ratios: Dict[str, RatioResult] = field(default_factory=dict)

    def get(self, name: str) -> Optional[RatioResult]:
        return self.ratios.get(name)

    def flagged(self) -> List[RatioResult]:
        return [r for r in self.ratios.values() if r.status in ("warning", "bad")]


# ── Main entry point ───────────────────────────────────────────────────────────

def calculate_ratios(stmt: FinancialStatement) -> RatioReport:
    report = RatioReport()

    gpr   = stmt.annual("gross_potential_rent")
    rev   = stmt.annual("total_revenue")
    opex  = stmt.annual("total_operating_expenses")
    noi   = stmt.annual("noi")
    vac   = stmt.annual("vacancy_loss")
    conc  = stmt.annual("concession_loss")
    bad   = stmt.annual("bad_debt")
    pay   = stmt.annual("total_payroll")
    mgmt  = stmt.annual("management_fees")
    ctrl  = stmt.annual("controllable_expenses")
    debt  = stmt.annual("financial_expense")
    ni    = stmt.annual("net_income")
    cf    = stmt.annual("cash_flow")

    months = stmt.months

    def _monthly(num_key: str, den_key: str) -> Dict[str, Optional[float]]:
        result = {}
        for m in months:
            n = stmt.monthly(num_key, m)
            d = stmt.monthly(den_key, m)
            result[m] = _safe_div(n, d)
        return result

    # ── Operating Expense Ratio ──────────────────────────────────────────────
    _add(report, "oer", _safe_div(opex, rev), _monthly("total_operating_expenses", "total_revenue"))

    # ── NOI Margin ────────────────────────────────────────────────────────────
    _add(report, "noi_margin", _safe_div(noi, rev), _monthly("noi", "total_revenue"))

    # ── Vacancy Rate (as % of Gross Potential Rent) ───────────────────────────
    vac_abs = abs(vac) if vac is not None else None
    vac_monthly: Dict[str, Optional[float]] = {}
    for m in months:
        v = stmt.monthly("vacancy_loss", m)
        g = stmt.monthly("gross_potential_rent", m)
        vac_monthly[m] = _safe_div(abs(v) if v else None, g)
    _add(report, "vacancy_rate", _safe_div(vac_abs, gpr), vac_monthly)

    # ── Concession Rate ───────────────────────────────────────────────────────
    conc_abs = abs(conc) if conc is not None else None
    _add(report, "concession_rate", _safe_div(conc_abs, gpr),
         {m: _safe_div(abs(stmt.monthly("concession_loss", m) or 0), stmt.monthly("gross_potential_rent", m)) for m in months})

    # ── Bad Debt Rate ─────────────────────────────────────────────────────────
    bad_abs = abs(bad) if bad is not None else None
    _add(report, "bad_debt_rate", _safe_div(bad_abs, rev))

    # ── Payroll % of Revenue ─────────────────────────────────────────────────
    _add(report, "payroll_pct", _safe_div(pay, rev), _monthly("total_payroll", "total_revenue"))

    # ── Management Fee % of Revenue ──────────────────────────────────────────
    _add(report, "mgmt_fee_pct", _safe_div(mgmt, rev), _monthly("management_fees", "total_revenue"))

    # ── Controllable % of Total OpEx ─────────────────────────────────────────
    _add(report, "controllable_pct", _safe_div(ctrl, opex))

    # ── Break-Even Occupancy ─────────────────────────────────────────────────
    _add(report, "break_even_occupancy", _safe_div(opex, gpr))

    # ── Cash Flow Margin ─────────────────────────────────────────────────────
    _add(report, "cash_flow_margin", _safe_div(cf, rev),
         {m: _safe_div(stmt.monthly("cash_flow", m), stmt.monthly("total_revenue", m)) for m in months})

    # ── Debt Service Coverage Ratio ───────────────────────────────────────────
    if debt and debt > 0 and noi is not None:
        _add(report, "dscr", noi / debt)

    return report


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den is None or den == 0:
        return None
    return num / den


def _add(
    report: RatioReport,
    name: str,
    value: Optional[float],
    monthly: Optional[Dict[str, Optional[float]]] = None,
) -> None:
    bench = BENCHMARKS.get(name, {})
    lo = bench.get("good", (None, None))[0]
    hi = bench.get("good", (None, None))[1]
    unit = bench.get("unit", "%")

    if value is None:
        status = "unknown"
    elif lo is not None and hi is not None:
        status = "good" if lo <= value <= hi else ("warning" if abs(value - (lo + hi) / 2) < (hi - lo) else "bad")
    else:
        status = "unknown"

    report.ratios[name] = RatioResult(
        name=name,
        label=bench.get("label", name),
        value=value,
        monthly=monthly or {},
        unit=unit,
        benchmark_low=lo,
        benchmark_high=hi,
        status=status,
    )
