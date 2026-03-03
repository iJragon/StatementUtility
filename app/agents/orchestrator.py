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
    SYSTEM_PROMPT = """You are a senior real estate financial analyst specializing in
multi-family residential property investments.

Return ONLY 3–5 bullet points in this exact format:
- **[Key finding label]:** [One to two sentence interpretation]

Rules:
- Every bullet must be INTERPRETIVE — explain what a number means, not just repeat it
- The dashboard already shows raw KPIs; your job is to explain WHY and SO WHAT
- Reference specific figures only to support an insight, not to list them
- Flag risks, anomalies, or divergences that warrant attention
- If cash flow differs significantly from net income, always explain why
- No preamble, no conclusion sentence, no markdown beyond the bullet format above"""

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
            f"Write a bullet-point executive summary for {stmt.property_name} ({stmt.period}).\n\n"
            "Do NOT restate KPI values already visible in the dashboard header. "
            "Focus on what the numbers MEAN — what is unusual, what warrants attention, "
            f"and what is driving performance. There are {len(high_anomalies)} high-severity "
            "anomalies — note the most important one if relevant.\n\n"
            f"{context}"
        )

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ]
        yield from self._stream(messages, temperature=0.4, max_tokens=500)

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
