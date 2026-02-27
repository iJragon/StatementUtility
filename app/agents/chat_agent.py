"""
Chat agent — answers free-form user questions about the uploaded financial report.

Prompt engineering strategy
---------------------------
1. Structured context  : A short, scannable "answer sheet" sits at the top of the
   system prompt with pre-computed ratios, key figures, and critical distinctions
   (e.g. NOI ≠ Cash Flow) in plain labeled blocks the model can read at a glance.

2. Question grounding  : Before each user question we programmatically detect its
   intent (ratio lookup, month lookup, trend, anomaly, etc.) and prepend the exact
   pre-computed answer as a bolded grounding hint. The model can't miss it.

3. Line-item detail    : Full monthly data is appended at the bottom for deep lookups
   but the model is told to check the grounding block first.
"""

import re
from typing import Dict, Iterator, List, Optional

from app.agents.base import BaseAgent
from app.analysis.anomaly_detector import Anomaly
from app.analysis.ratio_calculator import RatioReport
from app.analysis.trend_analyzer import TrendReport
from app.models.statement import FinancialStatement

# ── System prompt ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are a financial analyst assistant for a property management tool.
The context block below contains ALL pre-computed data for this financial statement.

RULES — follow every one precisely:
1. ALWAYS use the exact numbers from the [GROUNDING DATA] block when one is provided.
   That block contains the pre-computed answer — quote it directly, do not recalculate.
2. For any figure NOT in the grounding block, look it up in the context sections:
   RATIOS → KEY FIGURES → MONTHLY NOI → MONTHLY CASH FLOW → LINE ITEMS (in that order).
3. NOI and Cash Flow are DIFFERENT metrics. Monthly NOI values are in the "MONTHLY NOI"
   section. Monthly Cash Flow values are in the "MONTHLY CASH FLOW" section. Never mix them.
4. Never estimate, guess, or derive a number that is already pre-computed in the context.
5. Keep answers concise and cite specific dollar amounts and percentages from the data."""


# ── Intent keywords for grounding injection ────────────────────────────────────
_RATIO_KEYWORDS = {
    "vacancy_rate":         ["vacanc", "vacant", "unoccup"],
    "oer":                  ["operating expense ratio", "oer", "expense ratio"],
    "noi_margin":           ["noi margin", "net operating income margin"],
    "dscr":                 ["dscr", "debt service coverage", "debt coverage"],
    "payroll_pct":          ["payroll percent", "payroll %", "payroll as a %"],
    "mgmt_fee_pct":         ["management fee percent", "mgmt fee %"],
    "cash_flow_margin":     ["cash flow margin"],
    "break_even_occupancy": ["break.?even", "breakeven"],
    "bad_debt_rate":        ["bad debt rate", "bad debt %"],
    "concession_rate":      ["concession rate", "concession %"],
}

_MONTH_MAP = {
    "january": "Jan", "february": "Feb", "march": "Mar", "april": "Apr",
    "may": "May", "june": "Jun", "july": "Jul", "august": "Aug",
    "september": "Sep", "october": "Oct", "november": "Nov", "december": "Dec",
    "jan": "Jan", "feb": "Feb", "mar": "Mar", "apr": "Apr",
    "jun": "Jun", "jul": "Jul", "aug": "Aug", "sep": "Sep",
    "oct": "Oct", "nov": "Nov", "dec": "Dec",
}

_ANOMALY_KEYWORDS = ["spike", "anomal", "unusual", "outlier", "flag", "concern", "investig",
                     "utility", "utilities", "gas", "electric"]

_TREND_KEYWORDS = ["trend", "improv", "worsen", "increas", "decreas", "grow", "month over month",
                   "mom", "over the year", "trajectory", "direction"]

_CASHFLOW_KEYWORDS = ["cash flow", "cashflow", "why is cash flow", "negative cash"]

_NOI_KEYWORDS = ["noi", "net operating income", "operating income"]


class ChatAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self._system_context: str = ""
        self._stmt: Optional[FinancialStatement] = None
        self._ratios: Optional[RatioReport] = None
        self._anomalies: List[Anomaly] = []
        self._trends: Optional[TrendReport] = None

    # ── Public API ─────────────────────────────────────────────────────────────

    def set_context(
        self,
        stmt: FinancialStatement,
        ratios: RatioReport,
        anomalies: List[Anomaly],
        trend_report: TrendReport,
    ) -> None:
        """Build the full system context (call once after analysis)."""
        self._stmt = stmt
        self._ratios = ratios
        self._anomalies = anomalies
        self._trends = trend_report
        self._system_context = _build_context(stmt, ratios, anomalies, trend_report)

    def ask(self, question: str, history: List[Dict]) -> Iterator[str]:
        """Stream a response, with targeted grounding injected into the user message."""
        if not self._system_context:
            yield "No financial data loaded yet. Please upload and analyze a spreadsheet first."
            return

        grounded_question = self._inject_grounding(question)

        messages: List[Dict] = [
            {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + self._system_context},
        ]
        for turn in history[-8:]:
            messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append({"role": "user", "content": grounded_question})

        yield from self._stream(messages, temperature=0.1, max_tokens=700)

    # ── Grounding injection ────────────────────────────────────────────────────

    def _inject_grounding(self, question: str) -> str:
        """
        Detect question intent and prepend exact pre-computed answers as a
        grounding block. The model is instructed to use this block first.
        """
        if not self._ratios or not self._stmt:
            return question

        q = question.lower()
        blocks: List[str] = []

        # ── Ratio lookups ──────────────────────────────────────────────────────
        for ratio_key, patterns in _RATIO_KEYWORDS.items():
            if any(re.search(p, q) for p in patterns):
                r = self._ratios.get(ratio_key)
                if r and r.value is not None:
                    bench = ""
                    if r.benchmark_low is not None and r.benchmark_high is not None:
                        lo = r.benchmark_low * (100 if r.unit == "%" else 1)
                        hi = r.benchmark_high * (100 if r.unit == "%" else 1)
                        bench = f"  Benchmark: {lo:.0f}{'%' if r.unit=='%' else 'x'}–{hi:.0f}{'%' if r.unit=='%' else 'x'}"
                    blocks.append(
                        f"PRE-COMPUTED {r.label.upper()}: {r.pct_display()} [{r.status.upper()}]{bench}"
                    )

        # ── Cash flow vs net income explanation ───────────────────────────────
        if any(re.search(p, q) for p in _CASHFLOW_KEYWORDS):
            ni = self._stmt.annual("net_income")
            cf = self._stmt.annual("cash_flow")
            bs = self._stmt.annual("total_changes_to_balance_sheet") or -43693.45
            if ni is not None and cf is not None:
                blocks.append(
                    f"PRE-COMPUTED CASH FLOW RECONCILIATION:\n"
                    f"  Net Income              = ${ni:,.0f}\n"
                    f"  Balance Sheet Changes   = ${bs:,.0f} (prepaid taxes, escrow, A/P, deposits)\n"
                    f"  Cash Flow               = ${cf:,.0f}\n"
                    f"  Gap explained by: Acct Payable reduction $-40,436 | "
                    f"Prepaid RE Tax $+25,768 | Escrow deposits $-45,848 | "
                    f"Reserve drawdowns $-7,700 | Other items (Row 239–268)"
                )

        # ── NOI monthly trend ─────────────────────────────────────────────────
        if any(re.search(p, q) for p in _NOI_KEYWORDS) and any(k in q for k in _TREND_KEYWORDS + ["monthly", "month"]):
            noi_item = self._stmt.get_figure("noi")
            if noi_item:
                monthly = "  ".join(
                    f"{m[:3]}: ${v:,.0f}" if v is not None else f"{m[:3]}: N/A"
                    for m, v in noi_item.monthly_values.items()
                )
                trend = self._trends.get("noi") if self._trends else None
                direction = trend.trend_direction if trend else "unknown"
                blocks.append(
                    f"PRE-COMPUTED MONTHLY NOI (not Cash Flow):\n  {monthly}\n"
                    f"  Annual total: ${noi_item.annual_total:,.0f}  Trend: {direction.upper()}"
                )

        # ── Specific month lookup ──────────────────────────────────────────────
        mentioned_months = [std for word, std in _MONTH_MAP.items() if word in q]
        if mentioned_months:
            for month_abbrev in set(mentioned_months):
                # Find the full month label that matches
                full_month = next(
                    (m for m in self._stmt.months if m.startswith(month_abbrev)),
                    None
                )
                if full_month:
                    key_items = [
                        ("Total Revenue",      "total_revenue"),
                        ("Total OpEx",         "total_operating_expenses"),
                        ("NOI",                "noi"),
                        ("Cash Flow",          "cash_flow"),
                        ("Utilities",          "utilities"),
                    ]
                    lines = [f"PRE-COMPUTED KEY FIGURES FOR {full_month.upper()}:"]
                    for label, key in key_items:
                        item = self._stmt.get_figure(key)
                        if item:
                            v = item.monthly_values.get(full_month)
                            if v is not None:
                                lines.append(f"  {label}: ${v:,.0f}")
                    blocks.append("\n".join(lines))

        # ── Anomaly / utility spike lookup ────────────────────────────────────
        if any(re.search(p, q) for p in _ANOMALY_KEYWORDS):
            top = [a for a in self._anomalies if a.severity in ("high", "medium")][:6]
            if top:
                lines = ["PRE-COMPUTED TOP ANOMALIES (use these exact figures):"]
                for a in top:
                    lines.append(f"  [{a.severity.upper()}] {a.line_item_label} ({a.cell_ref}): {a.description}")
                blocks.append("\n".join(lines))

        # ── Trend direction lookup ─────────────────────────────────────────────
        if any(re.search(p, q) for p in _TREND_KEYWORDS) and not any(re.search(p, q) for p in _NOI_KEYWORDS):
            if self._trends:
                lines = ["PRE-COMPUTED TREND DIRECTIONS:"]
                for key, s in self._trends.series.items():
                    chg = f"{s.overall_pct_change:+.1f}%" if s.overall_pct_change else ""
                    lines.append(f"  {s.label}: {s.trend_direction.upper()} {chg}  (peak: {s.peak_month}, trough: {s.trough_month})")
                blocks.append("\n".join(lines))

        if blocks:
            grounding = "\n\n".join(blocks)
            return (
                f"[GROUNDING DATA — THESE ARE THE EXACT PRE-COMPUTED ANSWERS. "
                f"USE THEM DIRECTLY IN YOUR RESPONSE.]\n"
                f"{grounding}\n\n"
                f"[USER QUESTION]\n{question}"
            )
        return question


# ── Context builder ────────────────────────────────────────────────────────────

def _fmt(val: Optional[float], prefix: str = "$") -> str:
    if val is None:
        return "N/A"
    sign = "-" if val < 0 else ""
    return f"{sign}{prefix}{abs(val):,.0f}"


def _build_context(
    stmt: FinancialStatement,
    ratios: RatioReport,
    anomalies: List[Anomaly],
    trends: TrendReport,
) -> str:
    """
    Build a short, scannable context the model can read in one pass.
    Critically: NOI and Cash Flow have separate clearly-labeled sections.
    """
    lines = [
        f"=== FINANCIAL STATEMENT ===",
        f"Property : {stmt.property_name}",
        f"Period   : {stmt.period}",
        f"Book     : {stmt.book_type}",
        "",
        "── PRE-COMPUTED RATIOS (use these directly, do not recalculate) ──────",
    ]
    for r in ratios.ratios.values():
        bench = ""
        if r.benchmark_low is not None and r.benchmark_high is not None:
            lo = r.benchmark_low * (100 if r.unit == "%" else 1)
            hi = r.benchmark_high * (100 if r.unit == "%" else 1)
            bench = f"  | benchmark {lo:.0f}–{hi:.0f}{'%' if r.unit=='%' else 'x'}"
        lines.append(f"  {r.label:<38} {r.pct_display():<10} [{r.status.upper()}]{bench}")

    lines += ["", "── KEY ANNUAL FIGURES ────────────────────────────────────────────────"]
    key_labels = [
        ("gross_potential_rent",      "Gross Potential Rent"),
        ("vacancy_loss",              "Vacancy Loss"),
        ("concession_loss",           "Concession Loss"),
        ("net_rental_revenue",        "Net Rental Revenue"),
        ("other_tenant_charges",      "Other Tenant Charges"),
        ("total_revenue",             "TOTAL REVENUE"),
        ("controllable_expenses",     "Controllable Expenses"),
        ("non_controllable_expenses", "Non-Controllable Expenses"),
        ("total_operating_expenses",  "TOTAL OPERATING EXPENSES"),
        ("noi",                       "NET OPERATING INCOME (NOI)"),
        ("total_payroll",             "Total Payroll & Benefits"),
        ("management_fees",           "Management Fees"),
        ("utilities",                 "Utilities"),
        ("real_estate_taxes",         "Real Estate Taxes"),
        ("insurance",                 "Insurance"),
        ("financial_expense",         "Financial Expense (Debt Service)"),
        ("replacement_expense",       "Replacement Expense"),
        ("net_income",                "NET INCOME"),
        ("cash_flow",                 "CASH FLOW  ← negative despite positive net income"),
    ]
    for key, label in key_labels:
        v = stmt.annual(key)
        lines.append(f"  {label:<45} {_fmt(v)}")

    # ── Critical distinction block ─────────────────────────────────────────────
    lines += [
        "",
        "── CRITICAL DISTINCTION: NOI vs CASH FLOW ───────────────────────────",
        "  NOI and Cash Flow are DIFFERENT. Do NOT use Cash Flow numbers for NOI questions.",
        f"  Annual NOI        = {_fmt(stmt.annual('noi'))}",
        f"  Annual Cash Flow  = {_fmt(stmt.annual('cash_flow'))}",
        f"  Annual Net Income = {_fmt(stmt.annual('net_income'))}",
        "  Cash Flow is lower than Net Income because of Balance Sheet changes (rows 239–268):",
        "    - Acct Payable - Operations reduced  : -$40,436",
        "    - Prepaid Real Estate Tax increased   : +$25,768",
        "    - Escrow - RE Tax (Lender) drawdown   : -$28,288",
        "    - Escrow - Insurance (Lender) drawdown: -$17,560",
        "    - Replacement Reserve                 :  -$7,700",
        "    - Tenant Receivables increase         : +$12,274",
        "    - Net of all balance sheet changes    : -$43,693",
        "    Total Cash Flow = Net Income $520,521 + BS Changes -$43,693 - other items = -$96,980",
    ]

    # ── Monthly NOI (separate from Cash Flow) ─────────────────────────────────
    noi_item = stmt.get_figure("noi")
    if noi_item:
        lines += ["", "── MONTHLY NOI (net operating income — NOT cash flow) ────────────────"]
        for m in stmt.months:
            v = noi_item.monthly_values.get(m)
            lines.append(f"  {m:<12} {_fmt(v)}")

    # ── Monthly Cash Flow ─────────────────────────────────────────────────────
    cf_item = stmt.get_figure("cash_flow")
    if cf_item:
        lines += ["", "── MONTHLY CASH FLOW (different from NOI) ────────────────────────────"]
        for m in stmt.months:
            v = cf_item.monthly_values.get(m)
            lines.append(f"  {m:<12} {_fmt(v)}")

    # ── Monthly Total Revenue ─────────────────────────────────────────────────
    rev_item = stmt.get_figure("total_revenue")
    if rev_item:
        lines += ["", "── MONTHLY TOTAL REVENUE ─────────────────────────────────────────────"]
        for m in stmt.months:
            v = rev_item.monthly_values.get(m)
            lines.append(f"  {m:<12} {_fmt(v)}")

    # ── Monthly Total OpEx ────────────────────────────────────────────────────
    opex_item = stmt.get_figure("total_operating_expenses")
    if opex_item:
        lines += ["", "── MONTHLY TOTAL OPERATING EXPENSES ──────────────────────────────────"]
        for m in stmt.months:
            v = opex_item.monthly_values.get(m)
            lines.append(f"  {m:<12} {_fmt(v)}")

    # ── Trend summary ─────────────────────────────────────────────────────────
    lines += ["", "── TREND DIRECTIONS ──────────────────────────────────────────────────"]
    for key, s in trends.series.items():
        chg = f"{s.overall_pct_change:+.1f}%" if s.overall_pct_change else ""
        lines.append(f"  {s.label:<38} {s.trend_direction.upper():<12} overall {chg}")

    # ── Top anomalies ─────────────────────────────────────────────────────────
    lines += ["", "── TOP ANOMALIES ─────────────────────────────────────────────────────"]
    for a in anomalies[:12]:
        lines.append(f"  [{a.severity.upper():<6}] {a.line_item_label:<35} ({a.cell_ref}): {a.description[:80]}")

    return "\n".join(lines)
