"""
Statement Utility — Streamlit dashboard

Tabs:
  1. Executive Summary  (AI narrative + KPI cards)
  2. Revenue            (waterfall + monthly line chart)
  3. Expenses           (donut + controllable bar + heatmap)
  4. Financial Ratios   (gauges + table with benchmarks)
  5. Anomalies          (flagged items with cell refs)
  6. Trends             (multi-metric trend comparison)
  7. Chat               (ask questions about the report)
"""

import io
import streamlit as st

from app.parser.excel_parser import parse_excel
from app.analysis.ratio_calculator import calculate_ratios
from app.analysis.anomaly_detector import detect_anomalies
from app.analysis.trend_analyzer import analyze_trends
from app.visualization import chart_builder as charts
from app.agents.orchestrator import OrchestratorAgent
from app.agents.chat_agent import ChatAgent
from app.config import is_ai_available, MODEL_PROVIDER, OLLAMA_MODEL, ANTHROPIC_MODEL

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Statement Utility",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Session state init ─────────────────────────────────────────────────────────
for key, default in {
    "stmt": None,
    "ratios": None,
    "anomalies": None,
    "trends": None,
    "chat_history": [],
    "chat_agent": None,
    "summary_text": "",
}.items():
    if key not in st.session_state:
        st.session_state[key] = default


# ── Sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("Statement Utility")
    st.caption("AI-powered financial statement analysis")
    st.divider()

    uploaded = st.file_uploader(
        "Upload Excel statement (.xlsx)",
        type=["xlsx", "xls"],
        help="Supports any format — the parser auto-detects structure.",
    )

    ai_ok = is_ai_available()
    model_name = ANTHROPIC_MODEL if MODEL_PROVIDER == "anthropic" else OLLAMA_MODEL
    if ai_ok:
        st.success(f"AI ready ({model_name})")
    else:
        st.warning(
            f"AI unavailable — charts & ratios will still work.\n\n"
            f"To enable AI insights, start Ollama and run:\n"
            f"`ollama pull {OLLAMA_MODEL}`"
        )

    analyze_btn = st.button(
        "Analyze",
        type="primary",
        disabled=uploaded is None,
        use_container_width=True,
    )
    st.divider()
    st.caption("Model provider: " + MODEL_PROVIDER)


# ── Analysis pipeline ──────────────────────────────────────────────────────────
if analyze_btn and uploaded:
    with st.spinner("Parsing spreadsheet..."):
        try:
            file_bytes = io.BytesIO(uploaded.read())
            # Write to a temp path openpyxl can read
            import tempfile, os
            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                tmp.write(file_bytes.read())
                tmp_path = tmp.name

            stmt = parse_excel(tmp_path)
            os.unlink(tmp_path)
            st.session_state.stmt = stmt
        except Exception as e:
            st.error(f"Failed to parse spreadsheet: {e}")
            st.stop()

    with st.spinner("Calculating ratios..."):
        st.session_state.ratios = calculate_ratios(stmt)

    with st.spinner("Detecting anomalies..."):
        st.session_state.anomalies = detect_anomalies(stmt)

    with st.spinner("Analyzing trends..."):
        st.session_state.trends = analyze_trends(stmt)

    # Wire up chat agent
    chat_agent = ChatAgent()
    if ai_ok:
        chat_agent.set_context(
            stmt,
            st.session_state.ratios,
            st.session_state.anomalies,
            st.session_state.trends,
        )
    st.session_state.chat_agent = chat_agent
    st.session_state.chat_history = []
    st.session_state.summary_text = ""

    st.success("Analysis complete.")


# ── Main content ───────────────────────────────────────────────────────────────
stmt     = st.session_state.stmt
ratios   = st.session_state.ratios
anomalies= st.session_state.anomalies
trends   = st.session_state.trends

if stmt is None:
    st.info("Upload an Excel financial statement in the sidebar and click **Analyze** to begin.")
    st.stop()

tabs = st.tabs([
    "Executive Summary",
    "Revenue",
    "Expenses",
    "Financial Ratios",
    "Anomalies",
    "Trends",
    "Chat",
])


# ── Tab 1: Executive Summary ───────────────────────────────────────────────────
with tabs[0]:
    st.header(f"{stmt.property_name}")
    st.caption(f"{stmt.period}  ·  {stmt.book_type}")

    # KPI metric cards
    col1, col2, col3, col4, col5 = st.columns(5)
    def _kpi(col, label, key, prefix="$", invert=False):
        v = stmt.annual(key)
        col.metric(label, f"{prefix}{abs(v):,.0f}" if v is not None else "N/A",
                   delta=None)

    _kpi(col1, "Total Revenue",   "total_revenue")
    _kpi(col2, "Total OpEx",      "total_operating_expenses")
    _kpi(col3, "NOI",             "noi")
    _kpi(col4, "Net Income",      "net_income")
    _kpi(col5, "Cash Flow",       "cash_flow")

    st.divider()

    # Anomaly banner
    high_count = sum(1 for a in anomalies if a.severity == "high")
    if high_count:
        st.error(f"{high_count} high-severity issue(s) detected — see the Anomalies tab.")

    # AI executive summary
    if ai_ok:
        if not st.session_state.summary_text:
            st.subheader("Executive Summary")
            orchestrator = OrchestratorAgent()
            summary_placeholder = st.empty()
            full_text = ""
            with st.spinner("Generating AI summary..."):
                for chunk in orchestrator.generate_executive_summary(stmt, ratios, anomalies, trends):
                    full_text += chunk
                    summary_placeholder.markdown(full_text + "▌")
            summary_placeholder.markdown(full_text)
            st.session_state.summary_text = full_text
        else:
            st.subheader("Executive Summary")
            st.markdown(st.session_state.summary_text)
    else:
        st.info("Start Ollama to enable AI-generated executive summaries.")

    # Quick ratio snapshot
    st.divider()
    st.subheader("Key Ratios at a Glance")
    ratio_cols = st.columns(4)
    ratio_items = list(ratios.ratios.values())[:8]
    for i, r in enumerate(ratio_items):
        status_icon = {"good": "🟢", "warning": "🟡", "bad": "🔴"}.get(r.status, "⚪")
        ratio_cols[i % 4].metric(r.label, r.pct_display(), delta=None)


# ── Tab 2: Revenue ─────────────────────────────────────────────────────────────
with tabs[1]:
    st.header("Revenue Analysis")

    st.plotly_chart(charts.revenue_vs_opex(stmt), use_container_width=True)
    st.plotly_chart(charts.revenue_waterfall(stmt), use_container_width=True)
    st.plotly_chart(charts.vacancy_rate_bar(stmt), use_container_width=True)
    st.plotly_chart(charts.noi_margin_trend(stmt), use_container_width=True)

    # Revenue table
    st.subheader("Monthly Revenue Detail")
    import pandas as pd
    rev_rows = []
    rev_keys = [
        ("gross_potential_rent", "Gross Potential Rent"),
        ("vacancy_loss",         "Vacancy Loss"),
        ("concession_loss",      "Concession Loss"),
        ("net_rental_revenue",   "Net Rental Revenue"),
        ("other_tenant_charges", "Other Tenant Charges"),
        ("total_revenue",        "Total Revenue"),
    ]
    for key, label in rev_keys:
        item = stmt.get_figure(key)
        if item:
            row = {"Line Item": label}
            for m in stmt.months:
                v = item.monthly_values.get(m)
                row[m] = f"${v:,.0f}" if v is not None else "—"
            row["Annual Total"] = f"${item.annual_total:,.0f}" if item.annual_total else "—"
            rev_rows.append(row)
    if rev_rows:
        st.dataframe(pd.DataFrame(rev_rows).set_index("Line Item"), use_container_width=True)


# ── Tab 3: Expenses ────────────────────────────────────────────────────────────
with tabs[2]:
    st.header("Expense Analysis")

    col_a, col_b = st.columns(2)
    with col_a:
        st.plotly_chart(charts.expense_breakdown_donut(stmt), use_container_width=True)
    with col_b:
        st.plotly_chart(charts.controllable_vs_noncontrollable(stmt), use_container_width=True)

    st.plotly_chart(charts.expense_heatmap(stmt), use_container_width=True)
    st.plotly_chart(charts.cashflow_vs_netincome(stmt), use_container_width=True)


# ── Tab 4: Financial Ratios ────────────────────────────────────────────────────
with tabs[3]:
    st.header("Financial Ratios")

    # Gauge row
    gauge_keys = ["oer", "noi_margin", "vacancy_rate", "dscr"]
    gauge_cols = st.columns(len(gauge_keys))
    for col, key in zip(gauge_cols, gauge_keys):
        fig = charts.kpi_gauge(key, ratios)
        if fig:
            col.plotly_chart(fig, use_container_width=True)

    st.divider()

    # Full ratio table
    import pandas as pd
    ratio_rows = []
    for r in ratios.ratios.values():
        lo = f"{r.benchmark_low*100:.0f}%" if r.benchmark_low is not None and r.unit == "%" else (str(r.benchmark_low) if r.benchmark_low else "—")
        hi = f"{r.benchmark_high*100:.0f}%" if r.benchmark_high is not None and r.unit == "%" else (str(r.benchmark_high) if r.benchmark_high else "—")
        status_icon = {"good": "Good", "warning": "Watch", "bad": "Concern"}.get(r.status, "—")
        ratio_rows.append({
            "Metric": r.label,
            "Value": r.pct_display(),
            "Benchmark Low": lo,
            "Benchmark High": hi,
            "Status": status_icon,
        })
    df_ratios = pd.DataFrame(ratio_rows)

    def _color_status(val):
        colors = {"Good": "background-color: #d4edda", "Watch": "background-color: #fff3cd", "Concern": "background-color: #f8d7da"}
        return colors.get(val, "")

    styled = df_ratios.style.applymap(_color_status, subset=["Status"])
    st.dataframe(styled, use_container_width=True, hide_index=True)

    if ai_ok:
        with st.expander("AI Ratio Commentary"):
            orchestrator = OrchestratorAgent()
            with st.spinner("Generating commentary..."):
                commentary = orchestrator.generate_ratio_commentary(stmt, ratios)
            st.markdown(commentary)


# ── Tab 5: Anomalies ──────────────────────────────────────────────────────────
with tabs[4]:
    st.header("Anomalies & Issues")

    if not anomalies:
        st.success("No anomalies detected.")
    else:
        sev_filter = st.multiselect(
            "Filter by severity",
            ["high", "medium", "low"],
            default=["high", "medium", "low"],
        )
        filtered = [a for a in anomalies if a.severity in sev_filter]
        st.caption(f"{len(filtered)} issue(s) shown")

        for a in filtered:
            icon = {"high": "🔴", "medium": "🟡", "low": "🔵"}.get(a.severity, "⚪")
            with st.expander(f"{icon} [{a.severity.upper()}]  {a.line_item_label}  —  Cell {a.cell_ref}", expanded=(a.severity == "high")):
                st.markdown(f"**Category:** {a.category.replace('_', ' ').title()}")
                st.markdown(f"**Description:** {a.description}")
                if a.value is not None:
                    st.markdown(f"**Detected value:** `{a.value:,.2f}`")
                if a.expected:
                    st.markdown(f"**Expected:** {a.expected}")
                st.markdown(f"**Row:** {a.row_number}  ·  **Cell:** `{a.cell_ref}`")

                if ai_ok:
                    if st.button("Explain this anomaly", key=f"explain_{a.row_number}_{a.cell_ref}"):
                        orchestrator = OrchestratorAgent()
                        with st.spinner("Analyzing..."):
                            explanation = orchestrator.explain_anomaly(a, stmt)
                        st.info(explanation)


# ── Tab 6: Trends ─────────────────────────────────────────────────────────────
with tabs[5]:
    st.header("Trend Analysis")

    available_keys = list(trends.series.keys())
    selected = st.multiselect(
        "Select metrics to compare",
        options=available_keys,
        default=available_keys[:4],
        format_func=lambda k: trends.series[k].label,
    )
    if selected:
        st.plotly_chart(charts.trend_comparison(trends, selected), use_container_width=True)

    st.divider()
    st.subheader("Trend Summary")
    import pandas as pd
    trend_rows = []
    for key, s in trends.series.items():
        icon = {"improving": "📈", "worsening": "📉", "stable": "➡️", "volatile": "〰️"}.get(s.trend_direction, "")
        trend_rows.append({
            "Metric": s.label,
            "Direction": f"{icon} {s.trend_direction.title()}",
            "Overall Change": f"{s.overall_pct_change:+.1f}%" if s.overall_pct_change else "—",
            "Peak Month": s.peak_month or "—",
            "Trough Month": s.trough_month or "—",
            "Monthly Avg": f"${s.avg_value:,.0f}" if s.avg_value else "—",
        })
    st.dataframe(pd.DataFrame(trend_rows), use_container_width=True, hide_index=True)


# ── Tab 7: Chat ────────────────────────────────────────────────────────────────
with tabs[6]:
    st.header("Chat with your Report")
    st.caption("Ask any question about the financial data — the agent answers using real numbers from your statement.")

    if not ai_ok:
        st.warning(
            "AI is not available. Start Ollama and pull a model to enable chat.\n\n"
            f"Run: `ollama pull {OLLAMA_MODEL}`"
        )
    else:
        # Render chat history
        for msg in st.session_state.chat_history:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])

        # Suggested starter questions
        if not st.session_state.chat_history:
            st.subheader("Suggested questions")
            suggestions = [
                "Why is cash flow negative if net income is positive?",
                "Which expense category is growing fastest month over month?",
                "How does our vacancy rate compare to the industry benchmark?",
                "What drove the changes in NOI between Q1 and Q4?",
                "Are there any expenses I should investigate further?",
            ]
            cols = st.columns(2)
            for i, q in enumerate(suggestions):
                if cols[i % 2].button(q, key=f"sugg_{i}", use_container_width=True):
                    st.session_state._pending_question = q

        # Process pending suggestion click
        pending = st.session_state.pop("_pending_question", None)

        # Chat input
        user_input = st.chat_input("Ask about your financial report...")
        question = pending or user_input

        if question:
            chat_agent: ChatAgent = st.session_state.chat_agent
            if chat_agent is None:
                st.error("Please run analysis first.")
            else:
                # Display user message
                with st.chat_message("user"):
                    st.markdown(question)
                st.session_state.chat_history.append({"role": "user", "content": question})

                # Stream assistant response
                with st.chat_message("assistant"):
                    response_placeholder = st.empty()
                    full_response = ""
                    for chunk in chat_agent.ask(question, st.session_state.chat_history[:-1]):
                        full_response += chunk
                        response_placeholder.markdown(full_response + "▌")
                    response_placeholder.markdown(full_response)

                st.session_state.chat_history.append({"role": "assistant", "content": full_response})
