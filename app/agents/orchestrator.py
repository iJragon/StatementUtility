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
multi-family residential property investments. You receive structured financial
statement data and produce clear, actionable executive summaries.

Your analysis style:
- Lead with the most important insight (positive or negative)
- Reference specific dollar amounts and percentages from the data
- Flag risks an investor or property manager should investigate
- Keep language clear and professional — no filler phrases
- Structure your response with short paragraphs, not bullet lists
- Be concise: 3–5 paragraphs maximum"""

    def generate_executive_summary(
        self,
        stmt: FinancialStatement,
        ratios: RatioReport,
        anomalies: List[Anomaly],
        trend_report: TrendReport,
    ) -> Iterator[str]:
        """Stream an executive summary paragraph by paragraph."""
        context = build_financial_context(stmt, ratios, anomalies, trend_report)

        high_anomalies = [a for a in anomalies if a.severity == "high"]
        bad_ratios = [r for r in ratios.flagged() if r.status == "bad"]

        user_prompt = f"""Based on the financial data below, write an executive summary for
{stmt.property_name} covering the period {stmt.period}.

Focus on:
1. Overall financial health (revenue, NOI, cash flow)
2. Key ratios and how they compare to industry benchmarks
3. Any significant concerns or anomalies (there are {len(high_anomalies)} high-severity issues)
4. Month-over-month trends — what is improving and what is worsening
5. One or two actionable recommendations

{context}"""

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ]
        yield from self._stream(messages, temperature=0.4, max_tokens=800)

    def generate_ratio_commentary(
        self,
        stmt: FinancialStatement,
        ratios: RatioReport,
    ) -> str:
        """Return a short paragraph interpreting the ratio results."""
        lines = [f"  {r.label}: {r.pct_display()} ({r.status})" for r in ratios.ratios.values()]
        context = "\n".join(lines)

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Briefly interpret these financial ratios for {stmt.property_name} ({stmt.period}). "
                "Comment on which ratios are strong, which are concerning, and what they suggest "
                "about operational efficiency:\n\n" + context
            )},
        ]
        return self._chat(messages, temperature=0.3, max_tokens=400)

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
