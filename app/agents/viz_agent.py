"""
Visualization Agent — generates Plotly figures from natural language requests.

The user types what they want to see in plain English.  The agent:
  1. Tells the LLM what data is available (metric names + whether monthly
     data exists) — no actual numbers are sent, keeping the prompt small.
  2. Asks the LLM to return a structured JSON chart specification.
  3. Resolves data references from the FinancialStatement and builds the
     actual Plotly figure deterministically — the LLM never generates code.

Supported chart types: line, bar, area, scatter, pie
"""

import json
import re
from typing import Dict, List, Optional, Tuple

import plotly.graph_objects as go

from app.agents.base import BaseAgent
from app.models.statement import FinancialStatement

# Colour palette consistent with the rest of the app
_COLORS = [
    "#2ECC71", "#E74C3C", "#3498DB", "#9B59B6",
    "#F39C12", "#1ABC9C", "#E67E22", "#34495E",
]
_FILL_COLORS = [
    "rgba(46,204,113,0.15)", "rgba(231,76,60,0.15)",
    "rgba(52,152,219,0.15)", "rgba(155,89,182,0.15)",
    "rgba(243,156,18,0.15)", "rgba(26,188,156,0.15)",
    "rgba(230,126,34,0.15)", "rgba(52,73,94,0.15)",
]

_SCHEMA = """\
{
  "title": "Descriptive chart title",
  "chart_type": "line | bar | area | scatter | pie",
  "traces": [
    {
      "data_ref": "<key_figure key OR exact row label from available data>",
      "label":    "<display name for legend>",
      "chart_type": "<optional per-trace override: line | bar | area>"
    }
  ],
  "yaxis_format": "$ | % | x | (empty for plain numbers)",
  "explanation": "One or two sentences explaining what this chart shows and why it is useful."
}"""

_SYSTEM = (
    "You are a financial data visualization assistant. "
    "Return only valid JSON matching the requested schema. "
    "No markdown fences, no explanation outside the JSON."
)


class VizAgent(BaseAgent):
    """
    Generates a Plotly figure from a plain-English visualization request.

    Returns (figure, explanation).  figure is None if generation fails.
    """

    def generate(
        self,
        request: str,
        stmt: FinancialStatement,
    ) -> Tuple[Optional[go.Figure], str]:

        available = self._build_available_block(stmt)

        prompt = (
            f'The user wants to see: "{request}"\n\n'
            "Available data (data_ref key -> row label -> monthly data available):\n"
            f"{available}\n\n"
            f"Generate a chart spec matching this JSON schema:\n{_SCHEMA}\n\n"
            "Rules:\n"
            "- Use only data_ref values that appear in the available data list above.\n"
            "- Pick the chart_type that best fits the request "
            "(line for trends, bar for comparisons, area for cumulative, pie for breakdown).\n"
            "- yaxis_format: '$' for dollar amounts, '%' for percentages, "
            "'x' for ratios, '' for plain numbers.\n"
            "- Return ONLY valid JSON."
        )

        messages = [
            {"role": "system", "content": _SYSTEM},
            {"role": "user",   "content": prompt},
        ]

        raw = ""
        try:
            raw = self._chat(messages, temperature=0.1, max_tokens=600)
        except Exception as e:
            return None, f"Chart generation failed: {e}"

        spec = self._parse_spec(raw)
        if not spec:
            return None, "Could not parse a chart specification from the AI response."

        fig = self._build_figure(spec, stmt)
        explanation = spec.get("explanation", "")

        if fig is None:
            return None, "Chart built but no data could be resolved for the requested metrics."

        return fig, explanation

    # ── Private helpers ────────────────────────────────────────────────────────

    def _build_available_block(self, stmt: FinancialStatement) -> str:
        lines: List[str] = []

        # Named key figures first (most reliable)
        for key, item in stmt.key_figures.items():
            has_monthly = item.has_any_value()
            lines.append(
                f'  key:"{key}" -> "{item.label}" '
                f'(monthly:{"yes" if has_monthly else "no"})'
            )

        # Any other data row not already covered
        seen = {item.label for item in stmt.key_figures.values()}
        for item in stmt.all_rows:
            if item.label in seen or item.is_header:
                continue
            if item.has_any_value() or item.annual_total is not None:
                lines.append(
                    f'  row:"{item.label}" '
                    f'(monthly:{"yes" if item.has_any_value() else "no"})'
                )
                seen.add(item.label)

        return "\n".join(lines[:120])   # cap to keep prompt small

    def _parse_spec(self, raw: str) -> Optional[Dict]:
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`")
        try:
            spec = json.loads(raw)
            if isinstance(spec, dict) and "traces" in spec:
                return spec
        except Exception:
            pass
        # Try extracting the outermost {...} block
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                spec = json.loads(m.group())
                if isinstance(spec, dict) and "traces" in spec:
                    return spec
            except Exception:
                pass
        return None

    def _build_figure(
        self, spec: Dict, stmt: FinancialStatement
    ) -> Optional[go.Figure]:
        chart_type   = spec.get("chart_type", "line").lower()
        traces_spec  = spec.get("traces", [])
        title        = spec.get("title", "Custom Chart")
        yaxis_fmt    = spec.get("yaxis_format", "")
        months       = stmt.months

        fig = go.Figure()

        if chart_type == "pie":
            self._add_pie(fig, traces_spec, stmt)
        else:
            for i, ts in enumerate(traces_spec):
                data_ref   = ts.get("data_ref", "")
                label      = ts.get("label", data_ref)
                t_type     = ts.get("chart_type", chart_type).lower()
                color      = _COLORS[i % len(_COLORS)]
                fill_color = _FILL_COLORS[i % len(_FILL_COLORS)]

                values = self._resolve_monthly(data_ref, stmt, months)
                if values is None:
                    continue

                hover = f"%{{x}}<br>{label}: {'$' if yaxis_fmt == '$' else ''}%{{y:,.1f}}{'%' if yaxis_fmt == '%' else ''}<extra></extra>"

                if t_type == "bar":
                    fig.add_trace(go.Bar(
                        x=months, y=values, name=label,
                        marker_color=color,
                        hovertemplate=hover,
                    ))
                elif t_type == "area":
                    fig.add_trace(go.Scatter(
                        x=months, y=values, name=label,
                        mode="lines",
                        fill="tozeroy",
                        line=dict(color=color, width=2.5),
                        fillcolor=fill_color,
                        hovertemplate=hover,
                    ))
                else:   # line / scatter
                    fig.add_trace(go.Scatter(
                        x=months, y=values, name=label,
                        mode="lines+markers",
                        line=dict(color=color, width=2.5),
                        marker=dict(size=7),
                        hovertemplate=hover,
                    ))

        if not fig.data:
            return None

        yaxis_kwargs: Dict = {}
        if yaxis_fmt == "$":
            yaxis_kwargs = {"yaxis_tickprefix": "$", "yaxis_tickformat": ",.0f"}
        elif yaxis_fmt == "%":
            yaxis_kwargs = {"yaxis_ticksuffix": "%"}

        fig.update_layout(
            title=title,
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(family="Inter, sans-serif", size=13),
            margin=dict(l=40, r=40, t=90, b=40),
            legend=dict(orientation="h", yanchor="bottom", y=1.06, xanchor="center", x=0.5),
            **yaxis_kwargs,
        )
        return fig

    def _add_pie(
        self, fig: go.Figure, traces_spec: List[Dict], stmt: FinancialStatement
    ) -> None:
        labels, values = [], []
        for ts in traces_spec:
            data_ref = ts.get("data_ref", "")
            label    = ts.get("label", data_ref)
            annual   = self._resolve_annual(data_ref, stmt)
            if annual is not None and abs(annual) > 0:
                labels.append(label)
                values.append(abs(annual))
        if labels:
            fig.add_trace(go.Pie(
                labels=labels,
                values=values,
                hole=0.4,
                marker=dict(
                    colors=_COLORS[:len(labels)],
                    line=dict(color="#fff", width=2),
                ),
                textinfo="label+percent",
                hovertemplate="%{label}<br>$%{value:,.0f}<extra></extra>",
            ))

    def _resolve_monthly(
        self,
        data_ref: str,
        stmt: FinancialStatement,
        months: List[str],
    ) -> Optional[List]:
        # 1. Named key figure
        item = stmt.key_figures.get(data_ref)
        if item:
            return [item.monthly_values.get(m) for m in months]
        # 2. Exact label match
        ref_lower = data_ref.lower().strip()
        for row in stmt.all_rows:
            if row.label.lower().strip() == ref_lower:
                return [row.monthly_values.get(m) for m in months]
        # 3. Partial match
        for row in stmt.all_rows:
            if ref_lower in row.label.lower():
                return [row.monthly_values.get(m) for m in months]
        return None

    def _resolve_annual(
        self, data_ref: str, stmt: FinancialStatement
    ) -> Optional[float]:
        item = stmt.key_figures.get(data_ref)
        if item:
            return item.annual_total
        ref_lower = data_ref.lower().strip()
        for row in stmt.all_rows:
            if row.label.lower().strip() == ref_lower:
                return row.annual_total
        return None
