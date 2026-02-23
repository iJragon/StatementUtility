"""
Plotly chart builder — generates all executive dashboard visualizations.
Every function returns a Plotly Figure that can be rendered with st.plotly_chart().
"""

from typing import Dict, List, Optional

import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

from app.models.statement import FinancialStatement
from app.analysis.ratio_calculator import RatioReport, BENCHMARKS
from app.analysis.trend_analyzer import TrendReport

# ── Color palette ──────────────────────────────────────────────────────────────
COLORS = {
    "revenue":   "#2ECC71",
    "expense":   "#E74C3C",
    "noi":       "#3498DB",
    "neutral":   "#95A5A6",
    "warning":   "#F39C12",
    "good":      "#27AE60",
    "bad":       "#C0392B",
    "payroll":   "#9B59B6",
    "utilities": "#1ABC9C",
    "taxes":     "#E67E22",
    "mgmt":      "#34495E",
    "ctrl":      "#2980B9",
    "noctrl":    "#8E44AD",
}

_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(family="Inter, sans-serif", size=13),
    margin=dict(l=40, r=40, t=90, b=40),  # t=90 gives breathing room between title and legend
)

# Horizontal legend placed above the plot with enough space below the title
_H_LEGEND = dict(orientation="h", yanchor="bottom", y=1.06, xanchor="center", x=0.5)


# ── 1. Revenue vs Operating Expenses — monthly line chart ─────────────────────

def revenue_vs_opex(stmt: FinancialStatement) -> go.Figure:
    months = stmt.months

    def _vals(key):
        item = stmt.get_figure(key)
        return [item.monthly_values.get(m) if item else None for m in months]

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=months, y=_vals("total_revenue"),
        name="Total Revenue", mode="lines+markers",
        line=dict(color=COLORS["revenue"], width=2.5),
        marker=dict(size=7),
    ))
    fig.add_trace(go.Scatter(
        x=months, y=_vals("total_operating_expenses"),
        name="Total OpEx", mode="lines+markers",
        line=dict(color=COLORS["expense"], width=2.5),
        marker=dict(size=7),
    ))
    fig.add_trace(go.Scatter(
        x=months, y=_vals("noi"),
        name="NOI", mode="lines+markers",
        line=dict(color=COLORS["noi"], width=2.5, dash="dash"),
        marker=dict(size=7),
    ))
    fig.update_layout(
        title="Monthly Revenue vs. Operating Expenses vs. NOI",
        yaxis_tickprefix="$", yaxis_tickformat=",.0f",
        legend=_H_LEGEND,
        **_LAYOUT,
    )
    return fig


# ── 2. Expense Category Breakdown — donut chart (annual) ──────────────────────

def expense_breakdown_donut(stmt: FinancialStatement) -> go.Figure:
    categories = [
        ("Payroll & Benefits",   "total_payroll"),
        ("Management Fees",      "management_fees"),
        ("Utilities",            "utilities"),
        ("Real Estate Taxes",    "real_estate_taxes"),
        ("Insurance",            "insurance"),
        ("Replacement Expense",  "replacement_expense"),
    ]
    # Everything else rolls into "Other Controllable"
    known_total = sum(
        abs(stmt.annual(k) or 0) for _, k in categories
    )
    total_opex = abs(stmt.annual("total_operating_expenses") or 0)
    other = max(0.0, total_opex - known_total)

    labels, values, clrs = [], [], []
    palette = [COLORS["payroll"], COLORS["mgmt"], COLORS["utilities"],
               COLORS["taxes"], COLORS["warning"], COLORS["noi"],
               COLORS["neutral"]]
    for i, (lbl, key) in enumerate(categories):
        v = abs(stmt.annual(key) or 0)
        if v > 0:
            labels.append(lbl)
            values.append(v)
            clrs.append(palette[i % len(palette)])
    if other > 0:
        labels.append("Other")
        values.append(other)
        clrs.append(COLORS["neutral"])

    fig = go.Figure(go.Pie(
        labels=labels, values=values,
        hole=0.45,
        marker=dict(colors=clrs, line=dict(color="#fff", width=2)),
        textinfo="label+percent",
        hovertemplate="%{label}<br>$%{value:,.0f}<extra></extra>",
    ))
    fig.update_layout(
        title="Annual Expense Breakdown by Category",
        **_LAYOUT,
    )
    return fig


# ── 3. Controllable vs Non-Controllable — stacked bar by month ────────────────

def controllable_vs_noncontrollable(stmt: FinancialStatement) -> go.Figure:
    months = stmt.months
    ctrl_item  = stmt.get_figure("controllable_expenses")
    nctrl_item = stmt.get_figure("non_controllable_expenses")

    ctrl_vals  = [ctrl_item.monthly_values.get(m) if ctrl_item else None for m in months]
    nctrl_vals = [nctrl_item.monthly_values.get(m) if nctrl_item else None for m in months]

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=months, y=ctrl_vals, name="Controllable",
        marker_color=COLORS["ctrl"],
        hovertemplate="%{x}<br>Controllable: $%{y:,.0f}<extra></extra>",
    ))
    fig.add_trace(go.Bar(
        x=months, y=nctrl_vals, name="Non-Controllable",
        marker_color=COLORS["noctrl"],
        hovertemplate="%{x}<br>Non-Controllable: $%{y:,.0f}<extra></extra>",
    ))
    fig.update_layout(
        barmode="stack",
        title="Monthly Controllable vs. Non-Controllable Expenses",
        yaxis_tickprefix="$", yaxis_tickformat=",.0f",
        legend=_H_LEGEND,
        **_LAYOUT,
    )
    return fig


# ── 4. Vacancy Rate — monthly bar chart ───────────────────────────────────────

def vacancy_rate_bar(stmt: FinancialStatement) -> go.Figure:
    months = stmt.months
    gpr_item = stmt.get_figure("gross_potential_rent")
    vac_item = stmt.get_figure("vacancy_loss")

    rates = []
    for m in months:
        gpr_v = gpr_item.monthly_values.get(m) if gpr_item else None
        vac_v = vac_item.monthly_values.get(m) if vac_item else None
        if gpr_v and gpr_v != 0 and vac_v is not None:
            rates.append(abs(vac_v) / abs(gpr_v) * 100)
        else:
            rates.append(None)

    bar_colors = [
        COLORS["good"] if (r is not None and r <= 7) else COLORS["bad"]
        for r in rates
    ]

    fig = go.Figure(go.Bar(
        x=months, y=rates,
        marker_color=bar_colors,
        hovertemplate="%{x}<br>Vacancy: %{y:.1f}%<extra></extra>",
    ))
    fig.add_hline(y=7, line_dash="dash", line_color=COLORS["warning"],
                  annotation_text="7% benchmark", annotation_position="top right")
    fig.update_layout(
        title="Monthly Vacancy Rate (% of Gross Potential Rent)",
        yaxis_ticksuffix="%",
        **_LAYOUT,
    )
    return fig


# ── 5. NOI Margin trend — area chart ─────────────────────────────────────────

def noi_margin_trend(stmt: FinancialStatement) -> go.Figure:
    months = stmt.months
    rev_item = stmt.get_figure("total_revenue")
    noi_item = stmt.get_figure("noi")

    margins = []
    for m in months:
        r = rev_item.monthly_values.get(m) if rev_item else None
        n = noi_item.monthly_values.get(m) if noi_item else None
        margins.append((n / r * 100) if (r and r != 0 and n is not None) else None)

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=months, y=margins,
        mode="lines+markers",
        fill="tozeroy",
        line=dict(color=COLORS["noi"], width=2.5),
        fillcolor="rgba(52,152,219,0.15)",
        hovertemplate="%{x}<br>NOI Margin: %{y:.1f}%<extra></extra>",
    ))
    fig.add_hline(y=40, line_dash="dash", line_color=COLORS["warning"],
                  annotation_text="40% target", annotation_position="top right")
    fig.update_layout(
        title="Monthly NOI Margin",
        yaxis_ticksuffix="%",
        **_LAYOUT,
    )
    return fig


# ── 6. Cash Flow vs Net Income — side-by-side monthly bars ───────────────────

def cashflow_vs_netincome(stmt: FinancialStatement) -> go.Figure:
    months = stmt.months
    ni_item = stmt.get_figure("net_income")
    cf_item = stmt.get_figure("cash_flow")

    ni_vals = [ni_item.monthly_values.get(m) if ni_item else None for m in months]
    cf_vals = [cf_item.monthly_values.get(m) if cf_item else None for m in months]

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=months, y=ni_vals, name="Net Income",
        marker_color=COLORS["noi"],
        hovertemplate="%{x}<br>Net Income: $%{y:,.0f}<extra></extra>",
    ))
    fig.add_trace(go.Bar(
        x=months, y=cf_vals, name="Cash Flow",
        marker_color=COLORS["revenue"],
        hovertemplate="%{x}<br>Cash Flow: $%{y:,.0f}<extra></extra>",
    ))
    fig.add_hline(y=0, line_color="#333", line_width=1)
    fig.update_layout(
        barmode="group",
        title="Monthly Net Income vs. Cash Flow",
        yaxis_tickprefix="$", yaxis_tickformat=",.0f",
        legend=_H_LEGEND,
        **_LAYOUT,
    )
    return fig


# ── 7. KPI Gauge — single metric ─────────────────────────────────────────────

def kpi_gauge(name: str, ratio_report: RatioReport) -> Optional[go.Figure]:
    r = ratio_report.get(name)
    if r is None or r.value is None:
        return None

    display_val = r.value * 100 if r.unit == "%" else r.value
    lo = (r.benchmark_low or 0) * (100 if r.unit == "%" else 1)
    hi = (r.benchmark_high or 1) * (100 if r.unit == "%" else 1)
    max_val = max(display_val * 1.5, hi * 1.5)

    color = {"good": "#27AE60", "warning": "#F39C12", "bad": "#C0392B"}.get(r.status, "#95A5A6")

    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=display_val,
        number=dict(suffix="%" if r.unit == "%" else "x", valueformat=".1f"),
        title=dict(text=r.label, font=dict(size=14)),
        gauge=dict(
            axis=dict(range=[0, max_val]),
            bar=dict(color=color),
            steps=[
                dict(range=[0, lo], color="#FADBD8"),
                dict(range=[lo, hi], color="#D5F5E3"),
                dict(range=[hi, max_val], color="#FADBD8"),
            ],
            threshold=dict(
                line=dict(color="black", width=2),
                thickness=0.75,
                value=display_val,
            ),
        ),
    ))
    fig.update_layout(height=250, margin=dict(l=20, r=20, t=50, b=20), **{k: v for k, v in _LAYOUT.items() if k != "margin"})
    return fig


# ── 8. Expense heatmap — Category × Month ────────────────────────────────────

def expense_heatmap(stmt: FinancialStatement) -> go.Figure:
    heatmap_metrics = [
        ("total_payroll",            "Payroll & Benefits"),
        ("management_fees",          "Management Fees"),
        ("utilities",                "Utilities"),
        ("real_estate_taxes",        "Real Estate Taxes"),
        ("insurance",                "Insurance"),
        ("controllable_expenses",    "Controllable"),
        ("non_controllable_expenses","Non-Controllable"),
        ("total_operating_expenses", "Total OpEx"),
    ]

    months = stmt.months
    z_data, y_labels = [], []

    for key, label in heatmap_metrics:
        item = stmt.get_figure(key)
        if item is None:
            continue
        row = [item.monthly_values.get(m) for m in months]
        if any(v is not None for v in row):
            z_data.append(row)
            y_labels.append(label)

    fig = go.Figure(go.Heatmap(
        z=z_data,
        x=months,
        y=y_labels,
        colorscale="RdYlGn_r",
        hovertemplate="<b>%{y}</b><br>%{x}: $%{z:,.0f}<extra></extra>",
        colorbar=dict(title="$"),
    ))
    fig.update_layout(
        title="Expense Heatmap by Category and Month",
        xaxis_tickangle=-35,
        **_LAYOUT,
    )
    return fig


# ── 9. Revenue waterfall ──────────────────────────────────────────────────────

def revenue_waterfall(stmt: FinancialStatement) -> go.Figure:
    components = [
        ("Gross Potential Rent",    "gross_potential_rent",  "absolute"),
        ("Vacancy Loss",            "vacancy_loss",           "relative"),
        ("Concession Loss",         "concession_loss",        "relative"),
        ("Office/Model/Rent Free",  "office_model_rent_free", "relative"),
        ("Bad Debt",                "bad_debt",               "relative"),
        ("Other Tenant Charges",    "other_tenant_charges",   "relative"),
        ("Total Revenue",           "total_revenue",          "total"),
    ]

    labels, measures, values = [], [], []
    for label, key, measure in components:
        v = stmt.annual(key)
        if v is not None:
            labels.append(label)
            measures.append(measure)
            values.append(v)

    fig = go.Figure(go.Waterfall(
        orientation="v",
        measure=measures,
        x=labels,
        y=values,
        connector=dict(line=dict(color="rgb(63, 63, 63)")),
        decreasing=dict(marker_color=COLORS["expense"]),
        increasing=dict(marker_color=COLORS["revenue"]),
        totals=dict(marker_color=COLORS["noi"]),
        hovertemplate="%{x}<br>$%{y:,.0f}<extra></extra>",
    ))
    fig.update_layout(
        title="Annual Revenue Waterfall: Gross Potential to Total Revenue",
        yaxis_tickprefix="$", yaxis_tickformat=",.0f",
        **_LAYOUT,
    )
    return fig


# ── 10. Trend comparison — multi-metric line chart ────────────────────────────

def trend_comparison(trend_report: TrendReport, keys: List[str]) -> go.Figure:
    fig = go.Figure()
    palette = [COLORS["revenue"], COLORS["expense"], COLORS["noi"],
               COLORS["payroll"], COLORS["utilities"], COLORS["mgmt"]]

    for i, key in enumerate(keys):
        s = trend_report.get(key)
        if s is None:
            continue
        fig.add_trace(go.Scatter(
            x=s.months,
            y=s.values,
            name=s.label,
            mode="lines+markers",
            line=dict(color=palette[i % len(palette)], width=2),
            marker=dict(size=6),
            hovertemplate=f"<b>{s.label}</b><br>%{{x}}: $%{{y:,.0f}}<extra></extra>",
        ))

    fig.update_layout(
        title="Trend Comparison",
        yaxis_tickprefix="$", yaxis_tickformat=",.0f",
        legend=_H_LEGEND,
        **_LAYOUT,
    )
    return fig
