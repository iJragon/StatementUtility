"""
Orchestrator — runs the full analysis pipeline and generates
an AI-powered executive summary using the local Ollama model.
"""

from typing import Iterator, List

from app.agents.base import BaseAgent, build_financial_context
from app.analysis.anomaly_detector import Anomaly
from app.analysis.ratio_calculator import RatioReport
from app.analysis.trend_analyzer import TrendReport
from app.models.statement import FinancialStatement


class OrchestratorAgent(BaseAgent):
    SYSTEM_PROMPT = """You are a senior real estate financial analyst.

OUTPUT FORMAT — follow exactly, no exceptions:
- **Label:** One to two sentence interpretation.
- **Label:** One to two sentence interpretation.
(3 to 5 bullets total, nothing else)

STRICT RULES:
- Your response MUST start with "- **" — no title, no property name, no heading, no preamble
- Do NOT restate numbers already shown in the dashboard (revenue totals, NOI, etc.)
- Every bullet interprets or explains something — WHY or SO WHAT, not just WHAT
- If cash flow differs significantly from net income, dedicate one bullet to explaining why
- No numbered lists, no section headers, no closing sentence after the last bullet"""

    def generate_executive_summary(
        self,
        stmt: FinancialStatement,
        ratios: RatioReport,
        anomalies: List[Anomaly],
        trend_report: TrendReport,
    ) -> Iterator[str]:
        """Stream a bullet-point executive summary."""
        context = build_financial_context(stmt, ratios, anomalies, trend_report)
        high_anomalies = [a for a in anomalies if a.severity == "high"]

        user_prompt = (
            "Example of correct output for a different property:\n"
            "- **Cash flow divergence:** Despite positive NOI, cash flow is negative due to $618K "
            "in balance sheet changes (prepaid expenses, escrow). This is an accounting timing "
            "effect, not an operational loss.\n"
            "- **Vacancy above benchmark:** At 9.2%, vacancy exceeds the 7% industry threshold; "
            "the August spike suggests a lease renewal gap worth investigating.\n"
            "- **Payroll outpacing revenue:** Payroll grew 18% while revenue grew only 6%, "
            "so controllable expense discipline is slipping.\n\n"
            f"Now write the same style summary for the property below. "
            f"There are {len(high_anomalies)} high-severity anomalies, so call out the most "
            "important one if it adds insight beyond what the numbers already show.\n\n"
            f"{context}"
        )

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ]
        yield from self._stream(messages, temperature=0.3, max_tokens=450)

    def explain_anomaly(self, anomaly: Anomaly, stmt: FinancialStatement) -> str:
        """Return a plain-English explanation of a single anomaly."""
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Explain this financial anomaly in plain English for a property manager. "
                f"Be specific about what it means and what action should be taken.\n\n"
                f"Property: {stmt.property_name}\n"
                f"Period: {stmt.period}\n"
                f"Anomaly: [{anomaly.severity.upper()}] {anomaly.line_item_label} — {anomaly.description}\n"
                f"Cell Reference: {anomaly.cell_ref}\n"
                f"Detected Value: {anomaly.value}\n"
                f"Expected: {anomaly.expected}"
            )},
        ]
        return self._chat(messages, temperature=0.3, max_tokens=250)
