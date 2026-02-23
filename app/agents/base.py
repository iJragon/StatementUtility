"""
Base agent — shared LLM client and prompt utilities.
Works with Ollama (free/local) by default; swap to Claude by changing .env.
"""

import json
from typing import Any, Dict, Iterator, List, Optional

from app.config import get_llm_client, is_ai_available
from app.models.statement import FinancialStatement
from app.analysis.ratio_calculator import RatioReport
from app.analysis.anomaly_detector import Anomaly
from app.analysis.trend_analyzer import TrendReport


class BaseAgent:
    def __init__(self):
        self._client = None
        self._model = None

    def _ensure_client(self):
        if self._client is None:
            self._client, self._model = get_llm_client()

    def _chat(
        self,
        messages: List[Dict],
        temperature: float = 0.3,
        max_tokens: int = 1024,
    ) -> str:
        self._ensure_client()
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content or ""

    def _stream(
        self,
        messages: List[Dict],
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> Iterator[str]:
        self._ensure_client()
        stream = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    @staticmethod
    def ai_available() -> bool:
        return is_ai_available()


def _fmt_currency(val: Optional[float]) -> str:
    if val is None:
        return "N/A"
    sign = "-" if val < 0 else ""
    return f"{sign}${abs(val):,.0f}"


def build_financial_context(
    stmt: FinancialStatement,
    ratios: RatioReport,
    anomalies: List[Anomaly],
    trend_report: TrendReport,
) -> str:
    """
    Serialize the key financial data into a compact text block that fits
    within the LLM context window while preserving the information needed
    to answer investor/executive questions.
    """
    lines = [
        f"=== FINANCIAL STATEMENT CONTEXT ===",
        f"Property: {stmt.property_name}",
        f"Period:   {stmt.period}",
        f"Book:     {stmt.book_type}",
        f"Months:   {', '.join(stmt.months)}",
        "",
        "── KEY ANNUAL FIGURES ──",
    ]

    key_labels = {
        "gross_potential_rent":      "Gross Potential Rent",
        "vacancy_loss":              "Vacancy Loss",
        "concession_loss":           "Concession Loss",
        "net_rental_revenue":        "Net Rental Revenue",
        "other_tenant_charges":      "Other Tenant Charges",
        "total_revenue":             "Total Revenue",
        "controllable_expenses":     "Controllable Expenses",
        "non_controllable_expenses": "Non-Controllable Expenses",
        "total_operating_expenses":  "Total Operating Expenses",
        "noi":                       "Net Operating Income (NOI)",
        "total_payroll":             "Total Payroll & Benefits",
        "management_fees":           "Management Fees",
        "utilities":                 "Utilities",
        "real_estate_taxes":         "Real Estate Taxes",
        "insurance":                 "Property & Liability Insurance",
        "financial_expense":         "Financial Expense (Debt Service)",
        "replacement_expense":       "Replacement Expense",
        "net_income":                "Net Income",
        "cash_flow":                 "Cash Flow",
    }
    for key, label in key_labels.items():
        v = stmt.annual(key)
        lines.append(f"  {label}: {_fmt_currency(v)}")

    lines += ["", "── FINANCIAL RATIOS ──"]
    for r in ratios.ratios.values():
        lines.append(f"  {r.label}: {r.pct_display()} [{r.status.upper()}]")

    lines += ["", "── MONTHLY REVENUE ──"]
    rev_item = stmt.get_figure("total_revenue")
    if rev_item:
        for m in stmt.months:
            v = rev_item.monthly_values.get(m)
            lines.append(f"  {m}: {_fmt_currency(v)}")

    lines += ["", "── MONTHLY NOI ──"]
    noi_item = stmt.get_figure("noi")
    if noi_item:
        for m in stmt.months:
            v = noi_item.monthly_values.get(m)
            lines.append(f"  {m}: {_fmt_currency(v)}")

    lines += ["", "── ANOMALIES ──"]
    for a in anomalies[:15]:   # cap at 15 to save tokens
        lines.append(f"  [{a.severity.upper()}] {a.line_item_label} ({a.cell_ref}): {a.description}")

    lines += ["", "── TRENDS ──"]
    for key, s in trend_report.series.items():
        lines.append(
            f"  {s.label}: {s.trend_direction.upper()} "
            f"(overall {s.overall_pct_change:+.1f}%)" if s.overall_pct_change is not None
            else f"  {s.label}: {s.trend_direction.upper()}"
        )

    return "\n".join(lines)
