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

Sidebar (always visible):
  - File uploader + Analyze button
  - AI status
  - Session history with disk persistence + per-entry delete + clear all

Analysis is split into two phases so the UI never appears stuck:
  Phase 1 (fast)  — parse, ratios, anomalies, trends  → rerun → tabs populate instantly
  Phase 2 (AI)    — summary + commentary generated below tabs with live streaming preview.
                    A banner above tabs tells the user what is happening.
                    After Phase 2 completes another rerun populates the AI tab sections.
"""

import io
import sys
import os
import re
import hashlib
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import streamlit as st
import pandas as pd

from app.parser.excel_parser import parse_excel
from app.analysis.ratio_calculator import calculate_ratios
from app.analysis.anomaly_detector import detect_anomalies
from app.analysis.trend_analyzer import analyze_trends
from app.visualization import chart_builder as charts
from app.agents.orchestrator import OrchestratorAgent
from app.agents.chat_agent import ChatAgent
from app.agents.viz_agent import VizAgent
from app.config import is_ai_available, MODEL_PROVIDER, OLLAMA_MODEL, ANTHROPIC_MODEL
from app.utils.glossary import tt
from app.utils import session_io



def _clean_meta(text: str) -> str:
    """
    Strip internal system codes and Excel label prefixes from metadata strings.
    Handles patterns like:
      (.secesml)               - parenthetical codes
      .secesml                 - trailing dot-codes
      tdg_cfdet                - underscore_identifiers
      "Period = Jan 2025-..."  - label-prefixed cells (keeps value after =)
      "; Tree ="               - trailing Excel artifact suffixes
    Falls back to the original string if cleaning removes everything.
    """
    if not text:
        return text
    original = text
    # Parenthetical codes like (.secesml) or (tdg_cfdet)
    text = re.sub(r"\s*\([.a-z][a-z0-9_.]{1,30}\)", "", text, flags=re.IGNORECASE)
    # Trailing dot-codes like .secesml
    text = re.sub(r"\s*\.[a-z]{2,20}$", "", text.strip(), flags=re.IGNORECASE)
    # Standalone underscore_words like tdg_cfdet (but not "Jan 2025" or "Accrual")
    text = re.sub(r"\s*\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b", "", text, flags=re.IGNORECASE)
    # Trailing "; Label =" junk like "; Tree =" or "; View ="
    text = re.sub(r"\s*;\s*[A-Za-z][A-Za-z\s]{0,20}=\s*\S*\s*$", "", text).strip()
    # "Label = Value" prefix — strip the label, keep just the value
    # e.g. "Period = Jan 2025-Dec 2025" → "Jan 2025-Dec 2025"
    # e.g. "Book = Accrual" → "Accrual"
    # Only strip if the label part is a short word-only phrase (no dates/numbers)
    text = re.sub(r"^[A-Za-z][A-Za-z\s]{0,20}\s*=\s*", "", text).strip()
    result = text.strip(" ·-./,;")
    return result if result else original


def _safe_md(text: str) -> str:
    """
    Escape characters that cause unintended Markdown rendering in AI-generated text.
    - Dollar signs: prevent KaTeX from treating $value as a LaTeX math expression.
    - Underscores: prevent italic rendering. The LLM often outputs identifiers like
      Net_Income or wraps phrases in _underscores_ for emphasis, which causes Streamlit
      to italicize the text and silently eat the surrounding spaces, making words run
      together (e.g. "despitepositiveNetIncome").
    """
    text = text.replace("$", r"\$")
    text = text.replace("_", r"\_")
    return text




# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Statement Utility",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

ai_ok      = is_ai_available()
model_name = ANTHROPIC_MODEL if MODEL_PROVIDER == "anthropic" else OLLAMA_MODEL

# ── Custom styles ──────────────────────────────────────────────────────────────
# Base CSS: layout/shape only — no colors, works in both light and dark.
# Theme CSS: injected after session state init (always present in both branches
# to avoid layout shift when toggling).
st.markdown("""
<style>
/* ── Chrome ── */
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
[data-testid="stDeployButton"] {display: none;}
[data-testid="stToolbarActions"] {display: none;}

/* Hide the Streamlit header bar */
header {
    height: 0 !important;
    min-height: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
}

/* ── Sidebar: always visible, collapse button hidden ── */
[data-testid="stSidebarCollapseButton"] { display: none !important; }
[data-testid="stSidebarCollapsedControl"] { display: none !important; }

/* ── Main container ── */
.main .block-container {
    padding-top: 1rem;
    padding-bottom: 1rem;
    max-width: 1400px;
}

/* ── Metric cards: shape only, no color override ── */
[data-testid="metric-container"] {
    border-radius: 12px;
    padding: 20px 16px;
    border: 1px solid rgba(128,128,128,0.2);
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
[data-testid="stMetricValue"] {
    font-size: 1.5rem !important;
    font-weight: 700 !important;
}
[data-testid="stMetricLabel"] p {
    font-size: 0.72rem !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
    opacity: 0.65;
}

/* ── Tabs: shape only ── */
.stTabs [data-baseweb="tab-list"] {
    gap: 2px;
    border-radius: 10px;
    padding: 4px;
}
.stTabs [data-baseweb="tab"] {
    border-radius: 8px;
    padding: 8px 18px;
    font-weight: 500;
    font-size: 0.9rem;
    border: none !important;
    background: transparent;
}
.stTabs [aria-selected="true"] {
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    font-weight: 600;
}

/* ── Sidebar title ── */
[data-testid="stSidebar"] h1 {
    font-size: 1.25rem !important;
    font-weight: 700 !important;
}

/* ── Buttons ── */
.stButton > button {
    border-radius: 8px;
    font-weight: 500;
}
.stButton > button[kind="primary"] {
    font-weight: 600;
    letter-spacing: 0.02em;
}

/* ── Alerts ── */
[data-testid="stAlert"] {
    border-radius: 10px;
}

/* ── Expanders ── */
[data-testid="stExpander"] {
    border-radius: 10px !important;
    border: 1px solid rgba(128,128,128,0.2) !important;
}

/* ── Dataframes ── */
[data-testid="stDataFrame"] {
    border-radius: 10px;
    overflow: hidden;
}

/* ── Chat messages ── */
[data-testid="stChatMessage"] {
    border-radius: 12px;
    margin-bottom: 8px;
}

/* ── Financial term tooltips ── */
.fin-term {
    border-bottom: 1.5px dashed rgba(128,128,128,0.55);
    cursor: help;
    position: relative;
    display: inline;
}
.fin-term::before {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    background: #1e2a3a;
    color: #e8f4f8;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.78rem;
    line-height: 1.55;
    white-space: normal;
    width: 260px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.1);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
    z-index: 99999;
    text-align: left;
    font-weight: 400;
    font-style: normal;
    text-transform: none;
    letter-spacing: 0;
}
.fin-term::after {
    content: '';
    position: absolute;
    bottom: calc(100% + 2px);
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: #1e2a3a;
    opacity: 0;
    transition: opacity 0.18s ease;
    z-index: 99999;
    pointer-events: none;
}
.fin-term:hover::before,
.fin-term:hover::after {
    opacity: 1;
}

/* ── Custom KPI cards (tooltip-enabled metric labels) ── */
.kpi-card {
    border-radius: 12px;
    padding: 20px 16px;
    border: 1px solid rgba(128,128,128,0.2);
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    margin-bottom: 4px;
}
.kpi-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(128,128,128,1);
    margin-bottom: 6px;
    position: relative;
}
.kpi-value {
    font-size: 1.5rem;
    font-weight: 700;
}
</style>
""", unsafe_allow_html=True)

# ── Session state ──────────────────────────────────────────────────────────────
for key, default in {
    "stmt": None,
    "ratios": None,
    "anomalies": None,
    "trends": None,
    "chat_history": [],
    "chat_agent": None,
    "summary_text": "",
    "ratio_commentary": "",
    "anomaly_explanations": {},
    "file_hash": None,
    "file_bytes": None,        # raw Excel bytes for session export
    "custom_charts": [],       # [{request, explanation, fig}] for Custom Charts tab
    "ai_pending": False,       # True while Phase 2 (AI) still needs to run
    # Deal Details inputs — keyed individually so widget key= binding works without double-entry
    "deal_purchase_price": 0.0,
    "deal_market_value":   0.0,
    "deal_units":          0,
    "deal_sqft":           0,
    "deal_loan_balance":   0.0,
    "deal_interest_rate":  0.0,
}.items():
    if key not in st.session_state:
        st.session_state[key] = default

st.markdown("""
<style>
/* Dark mode: base="dark" in config.toml handles all native components.
   Only custom HTML elements need explicit colours. */
.kpi-value { color: #ffffff; }
.kpi-label { color: rgba(255,255,255,0.6); }
</style>
""", unsafe_allow_html=True)


# ── Sidebar — controls ─────────────────────────────────────────────────────────
with st.sidebar:
    st.title("Statement Utility")
    st.divider()

    uploaded = st.file_uploader(
        "Upload Excel statement (.xlsx)",
        type=["xlsx", "xls"],
    )

    if not ai_ok:
        st.warning(
            f"AI unavailable. Charts and ratios still work.\n\n"
            f"Start Ollama and run:\n"
            f"`ollama pull {OLLAMA_MODEL}`"
        )

    analyze_btn = st.button(
        "Analyze",
        type="primary",
        disabled=uploaded is None,
        use_container_width=True,
    )

    reanalyze_btn = False
    if st.session_state.stmt is not None:
        reanalyze_btn = st.button(
            "Reanalyze",
            use_container_width=True,
            help="Re-run all analysis on the currently loaded statement.",
        )
    st.divider()

    # ── Session export ─────────────────────────────────────────────────────
    if st.session_state.stmt is not None and st.session_state.file_bytes:
        _stmt = st.session_state.stmt
        _export_name = (
            f"{_stmt.property_name.replace(' ', '_')[:30]}"
            f"_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
        )
        _export_bytes = session_io.export_session(
            filename=_stmt.property_name,
            file_bytes=st.session_state.file_bytes,
            property_name=_stmt.property_name,
            period=_stmt.period,
            summary_text=st.session_state.summary_text,
            ratio_commentary=st.session_state.ratio_commentary,
            anomaly_explanations=dict(st.session_state.anomaly_explanations),
            chat_history=list(st.session_state.chat_history),
            custom_charts=list(st.session_state.custom_charts),
        )
        st.download_button(
            "Export Session",
            data=_export_bytes,
            file_name=_export_name,
            mime="application/json",
            use_container_width=True,
            help="Download your full session (file, AI summaries, chat, charts) as a JSON file you can import later.",
        )

    # ── Session import ─────────────────────────────────────────────────────
    with st.expander("Import Session", expanded=False):
        st.caption("Restore a previously exported session (.json).")
        import_file = st.file_uploader(
            "Choose session file",
            type=["json"],
            key="import_uploader",
            label_visibility="collapsed",
        )
        if import_file is not None:
            if st.button("Restore Session", use_container_width=True):
                st.session_state["_import_bytes"] = import_file.read()
                st.rerun()

    st.divider()
    st.caption("Model provider: " + MODEL_PROVIDER)


# ── Phase 1: fast analysis (parse + ratios + anomalies + trends) ───────────────
if (analyze_btn and uploaded) or reanalyze_btn:
    file_data = st.session_state.file_bytes if reanalyze_btn else uploaded.read()
    file_hash = hashlib.md5(file_data).hexdigest()

    st.session_state.file_bytes = file_data
    with st.status("Reading your statement…", expanded=True) as phase1_status:
        st.write("Parsing spreadsheet…")
        try:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                tmp.write(file_data)
                tmp_path = tmp.name
            stmt = parse_excel(tmp_path)
            os.unlink(tmp_path)
            st.session_state.stmt = stmt
        except Exception as e:
            st.error(f"Failed to parse spreadsheet: {e}")
            st.stop()

        # LLM fallback: identify any key figures the heuristic missed
        if ai_ok:
            try:
                from app.agents.parser_agent import LabelMapperAgent
                from app.parser.excel_parser import KEY_FIGURE_PATTERNS, enrich_key_figures
                missing = [k for k in KEY_FIGURE_PATTERNS if k not in stmt.key_figures]
                if missing:
                    st.write(f"AI resolving {len(missing)} non-standard label(s)...")
                    mapper = LabelMapperAgent()
                    label_map = mapper.map_labels(
                        [row.label for row in stmt.all_rows if not row.is_header],
                        missing,
                    )
                    if label_map:
                        enrich_key_figures(stmt, label_map)
            except Exception:
                pass  # fallback failure is non-fatal; heuristic results stand

        st.write("Calculating financial ratios…")
        st.session_state.ratios = calculate_ratios(stmt)

        st.write("Detecting anomalies…")
        st.session_state.anomalies = detect_anomalies(stmt)

        st.write("Analyzing trends…")
        st.session_state.trends = analyze_trends(stmt)

        st.write("Wiring up chat agent…")
        chat_agent = ChatAgent()
        if ai_ok:
            chat_agent.set_context(
                stmt,
                st.session_state.ratios,
                st.session_state.anomalies,
                st.session_state.trends,
            )
        st.session_state.chat_agent = chat_agent
        st.session_state.file_hash  = file_hash

        phase1_status.update(
            label="Data ready! AI insights generating next…" if ai_ok else "Analysis complete!",
            state="complete",
            expanded=False,
        )

    st.session_state.summary_text         = ""
    st.session_state.ratio_commentary     = ""
    st.session_state.anomaly_explanations = {}
    st.session_state.chat_history         = []
    st.session_state.file_hash            = file_hash
    st.session_state.ai_pending           = ai_ok

    st.rerun()   # rerun so tabs populate immediately before Phase 2 starts




# ── Import session handler ─────────────────────────────────────────────────────
if "_import_bytes" in st.session_state:
    _raw = st.session_state.pop("_import_bytes")
    try:
        _imported = session_io.import_session(_raw)
        _file_bytes = _imported["file_bytes"]
        _file_hash  = hashlib.md5(_file_bytes).hexdigest()
        with st.status("Restoring session…", expanded=True) as _imp_status:
            st.write("Re-parsing spreadsheet…")
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as _tmp:
                _tmp.write(_file_bytes)
                _tmp_path = _tmp.name
            _stmt = parse_excel(_tmp_path)
            os.unlink(_tmp_path)

            st.write("Rebuilding ratios and anomalies…")
            _ratios    = calculate_ratios(_stmt)
            _anomalies = detect_anomalies(_stmt)
            _trends    = analyze_trends(_stmt)

            st.write("Wiring chat agent…")
            _chat_agent = ChatAgent()
            if ai_ok:
                _chat_agent.set_context(_stmt, _ratios, _anomalies, _trends)

            # Restore session state
            st.session_state.stmt                 = _stmt
            st.session_state.ratios               = _ratios
            st.session_state.anomalies            = _anomalies
            st.session_state.trends               = _trends
            st.session_state.file_bytes           = _file_bytes
            st.session_state.file_hash            = _file_hash
            st.session_state.chat_agent           = _chat_agent
            st.session_state.summary_text         = _imported["summary_text"]
            st.session_state.ratio_commentary     = _imported["ratio_commentary"]
            st.session_state.anomaly_explanations = _imported["anomaly_explanations"]
            st.session_state.chat_history         = _imported["chat_history"]
            st.session_state.custom_charts        = _imported["custom_charts"]
            st.session_state.ai_pending           = False

            _imp_status.update(label="Session restored!", state="complete", expanded=False)
        st.rerun()
    except Exception as _e:
        st.error(f"Import failed: {_e}")


# ── Main content ───────────────────────────────────────────────────────────────
stmt      = st.session_state.stmt
ratios    = st.session_state.ratios
anomalies = st.session_state.anomalies
trends    = st.session_state.trends

if stmt is None:
    st.markdown("""
    <div style="height:calc(100vh - 3rem); display:flex; align-items:center; justify-content:center; padding:0 24px;">
    <div style="max-width:720px; width:100%; text-align:center;">

      <div style="margin-bottom:40px;">
        <div style="font-size:0.75rem; font-weight:700; letter-spacing:0.14em;
                    text-transform:uppercase; opacity:0.35; margin-bottom:14px;">
          Statement Utility
        </div>
        <div style="font-size:2.1rem; font-weight:700; letter-spacing:-0.02em; margin:0 0 16px;">
          Financial Statement Analysis
        </div>
        <div style="width:36px; height:3px; background:#2ECC71; border-radius:2px; margin:0 auto 20px;"></div>
        <p style="font-size:1rem; opacity:0.55; margin:0; line-height:1.65; max-width:480px; margin:0 auto;">
          Upload a P&amp;L statement to instantly generate charts, ratios,
          anomaly detection, and AI-powered insights.
        </p>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;
                  text-align:left; margin:24px 0;">
        <div style="padding:22px; border-radius:12px;
                    border:1px solid rgba(128,128,128,0.15);
                    background:rgba(128,128,128,0.04);">
          <div style="font-size:1.3rem; margin-bottom:10px;">📈</div>
          <div style="font-weight:600; font-size:0.92rem; margin-bottom:5px;">Charts &amp; Ratios</div>
          <div style="font-size:0.8rem; opacity:0.5; line-height:1.55;">
            Revenue trends, expense breakdowns, NOI margin, DSCR, and key financial ratios with benchmarks.
          </div>
        </div>
        <div style="padding:22px; border-radius:12px;
                    border:1px solid rgba(128,128,128,0.15);
                    background:rgba(128,128,128,0.04);">
          <div style="font-size:1.3rem; margin-bottom:10px;">🔍</div>
          <div style="font-weight:600; font-size:0.92rem; margin-bottom:5px;">Anomaly Detection</div>
          <div style="font-size:0.8rem; opacity:0.5; line-height:1.55;">
            Flags spikes, sign changes, and outliers with exact cell references from your spreadsheet.
          </div>
        </div>
        <div style="padding:22px; border-radius:12px;
                    border:1px solid rgba(128,128,128,0.15);
                    background:rgba(128,128,128,0.04);">
          <div style="font-size:1.3rem; margin-bottom:10px;">🤖</div>
          <div style="font-weight:600; font-size:0.92rem; margin-bottom:5px;">AI Executive Summary</div>
          <div style="font-size:0.8rem; opacity:0.5; line-height:1.55;">
            Interpretive bullet-point insights from a local LLM. Explains the why, not just the what.
          </div>
        </div>
        <div style="padding:22px; border-radius:12px;
                    border:1px solid rgba(128,128,128,0.15);
                    background:rgba(128,128,128,0.04);">
          <div style="font-size:1.3rem; margin-bottom:10px;">💬</div>
          <div style="font-weight:600; font-size:0.92rem; margin-bottom:5px;">Chat with Your Data</div>
          <div style="font-size:0.8rem; opacity:0.5; line-height:1.55;">
            Ask questions in plain language. Answers are grounded in real numbers from your statement.
          </div>
        </div>
      </div>

      <p style="font-size:0.78rem; opacity:0.28; margin:0;">
        ← Upload a statement in the sidebar to get started
      </p>

    </div>
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# ── AI-pending banner ──────────────────────────────────────────────────────────
# Shown above tabs so the user knows AI is still running while they browse data.
if st.session_state.ai_pending:
    st.info(
        "All data tabs are ready to browse. "
        "AI is generating the **Executive Summary** below. "
        "This usually takes 30–90 seconds depending on your model.",
        icon="⏳",
    )

# ── Tabs ───────────────────────────────────────────────────────────────────────
st.markdown(
    '<p style="font-size:0.72rem;font-weight:700;letter-spacing:0.1em;'
    'text-transform:uppercase;opacity:0.35;margin:0 0 2px;">Analysis</p>',
    unsafe_allow_html=True,
)
atabs = st.tabs([
    "Executive Summary",
    "Revenue",
    "Expenses",
    "Financial Ratios",
    "Trends",
    "Anomalies",
])

st.markdown(
    '<p style="font-size:0.72rem;font-weight:700;letter-spacing:0.1em;'
    'text-transform:uppercase;opacity:0.35;margin:12px 0 2px;">Interactive</p>',
    unsafe_allow_html=True,
)
itabs = st.tabs([
    "Deal Details",
    "Chat",
    "Custom Charts",
])


# ── Tab 1: Executive Summary ───────────────────────────────────────────────────
with atabs[0]:
    st.header(_clean_meta(stmt.property_name))
    _period   = _clean_meta(stmt.period)
    _booktype = _clean_meta(stmt.book_type)
    _caption  = "  ·  ".join(p for p in [_period, _booktype] if p)
    st.caption(_caption)

    col1, col2, col3, col4, col5 = st.columns(5)
    def _kpi(col, label_html, key):
        v = stmt.annual(key)
        val = f"${abs(v):,.0f}" if v is not None else "N/A"
        col.markdown(
            f'<div class="kpi-card">'
            f'<div class="kpi-label">{label_html}</div>'
            f'<div class="kpi-value">{val}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )

    _kpi(col1, tt("Total Revenue"),      "total_revenue")
    _kpi(col2, tt("Operating Expenses"), "total_operating_expenses")
    _kpi(col3, tt("NOI"),                "noi")
    _kpi(col4, tt("Net Income"),         "net_income")
    _kpi(col5, tt("Cash Flow"),          "cash_flow")

    st.divider()

    high_count = sum(1 for a in anomalies if a.severity == "high")
    if high_count:
        st.error(f"{high_count} high-severity {'issue' if high_count == 1 else 'issues'} detected. See the Anomalies tab.")

    st.subheader("Executive Summary")
    if st.session_state.summary_text:
        st.markdown(_safe_md(st.session_state.summary_text))
    elif st.session_state.ai_pending:
        st.caption("Generating… check back in a moment.")
    elif ai_ok:
        st.info("AI summary was not generated. Try clicking **Analyze** again.")
    else:
        st.info("Start Ollama to enable AI-generated executive summaries.")



# ── Tab 2: Revenue ─────────────────────────────────────────────────────────────
with atabs[1]:
    st.header("Revenue")
    st.plotly_chart(charts.revenue_vs_opex(stmt), use_container_width=True)
    st.plotly_chart(charts.vacancy_rate_bar(stmt), use_container_width=True)
    st.plotly_chart(charts.noi_margin_trend(stmt), use_container_width=True)


# ── Tab 3: Expenses ────────────────────────────────────────────────────────────
with atabs[2]:
    st.header("Expenses")
    col_a, col_b = st.columns(2)
    with col_a:
        st.plotly_chart(charts.expense_breakdown_donut(stmt), use_container_width=True)
    with col_b:
        st.plotly_chart(charts.controllable_vs_noncontrollable(stmt), use_container_width=True)

    st.plotly_chart(charts.expense_heatmap(stmt), use_container_width=True)
    st.plotly_chart(charts.cashflow_vs_netincome(stmt), use_container_width=True)


# ── Tab 4: Financial Ratios ────────────────────────────────────────────────────
with atabs[3]:
    st.header("Financial Ratios")

    gauge_keys = ["oer", "noi_margin", "vacancy_rate", "dscr"]
    gauge_cols = st.columns(len(gauge_keys))
    for col, key in zip(gauge_cols, gauge_keys):
        fig = charts.kpi_gauge(key, ratios)
        if fig:
            col.plotly_chart(fig, use_container_width=True)

    st.divider()

    def _fmt_bench(val, unit):
        if val is None:
            return "—"
        return f"{val*100:.0f}%" if unit == "%" else f"{val:.2f}x"

    _STATUS_BADGE = {
        "Good":    '<span style="background:rgba(46,204,113,0.18);color:#2ECC71;padding:2px 8px;border-radius:4px;font-size:0.8rem;font-weight:600;">Good</span>',
        "Watch":   '<span style="background:rgba(243,156,18,0.18);color:#F39C12;padding:2px 8px;border-radius:4px;font-size:0.8rem;font-weight:600;">Watch</span>',
        "Concern": '<span style="background:rgba(231,76,60,0.18);color:#E74C3C;padding:2px 8px;border-radius:4px;font-size:0.8rem;font-weight:600;">Concern</span>',
    }

    _th = "padding:10px 14px;font-weight:600;opacity:0.7;text-align:left;border-bottom:2px solid rgba(128,128,128,0.2);"
    _td = "padding:9px 14px;border-bottom:1px solid rgba(128,128,128,0.1);vertical-align:middle;"
    _rows_html = ""
    for r in ratios.ratios.values():
        lo = _fmt_bench(r.benchmark_low, r.unit)
        hi = _fmt_bench(r.benchmark_high, r.unit)
        bench = f"{lo}–{hi}" if lo != "—" or hi != "—" else "—"
        badge = _STATUS_BADGE.get({"good": "Good", "warning": "Watch", "bad": "Concern"}.get(r.status, ""), "")
        _rows_html += (
            f"<tr>"
            f"<td style='{_td}'>{tt(r.label, key=r.name)}</td>"
            f"<td style='{_td}'>{r.pct_display()}</td>"
            f"<td style='{_td};opacity:0.7;'>{bench}</td>"
            f"<td style='{_td}'>{badge}</td>"
            f"</tr>"
        )
    st.markdown(
        f"<table style='width:100%;border-collapse:collapse;font-size:0.9rem;'>"
        f"<thead><tr>"
        f"<th style='{_th}'>Metric</th>"
        f"<th style='{_th}'>Value</th>"
        f"<th style='{_th}'>Benchmark</th>"
        f"<th style='{_th}'>Status</th>"
        f"</tr></thead>"
        f"<tbody>{_rows_html}</tbody>"
        f"</table>",
        unsafe_allow_html=True,
    )


# ── Tab 5: Trends ─────────────────────────────────────────────────────────────
with atabs[4]:
    st.header("Trends")

    _avail_keys = list(trends.series.keys())
    _selected = st.multiselect(
        "Select metrics to compare",
        options=_avail_keys,
        default=_avail_keys[:4],
        format_func=lambda k: trends.series[k].label,
        key="trends_select",
    )
    if _selected:
        st.plotly_chart(charts.trend_comparison(trends, _selected), use_container_width=True)

    _trend_rows = []
    for _tkey, _ts in trends.series.items():
        _icon = {"improving": "📈", "worsening": "📉", "stable": "➡️", "volatile": "〰️"}.get(_ts.trend_direction, "")
        _trend_rows.append({
            "Metric":         _ts.label,
            "Direction":      f"{_icon} {_ts.trend_direction.title()}",
            "Overall Change": f"{_ts.overall_pct_change:+.1f}%" if _ts.overall_pct_change else "N/A",
            "Peak Month":     _ts.peak_month   or "N/A",
            "Trough Month":   _ts.trough_month or "N/A",
            "Monthly Avg":    f"${_ts.avg_value:,.0f}" if _ts.avg_value else "N/A",
        })
    st.dataframe(pd.DataFrame(_trend_rows), use_container_width=True, hide_index=True)


# ── Tab 6: Anomalies ──────────────────────────────────────────────────────────
with atabs[5]:
    st.header("Anomalies & Issues")

    if not anomalies:
        st.success("No anomalies detected.")
    else:
        sev_filter = st.multiselect(
            "Filter by severity",
            ["high", "medium", "low"],
            default=["high", "medium", "low"],
        )
        filtered    = [a for a in anomalies if a.severity in sev_filter]
        anomaly_pos = {id(a): i for i, a in enumerate(anomalies)}

        st.caption(f"{len(filtered)} issues shown")

        for a in filtered:
            pos  = anomaly_pos[id(a)]
            icon = {"high": "🔴", "medium": "🟡", "low": "🔵"}.get(a.severity, "⚪")
            with st.expander(
                f"{icon} {a.line_item_label} (Cell {a.cell_ref})",
                expanded=(a.severity == "high"),
            ):
                st.markdown(f"**Category:** {a.category.replace('_', ' ').title()}")
                st.markdown(f"**Description:** {_safe_md(a.description)}")
                if a.value is not None:
                    st.markdown(f"**Detected value:** `{a.value:,.2f}`")
                if a.expected:
                    st.markdown(f"**Expected:** {_safe_md(a.expected)}")
                st.markdown(f"**Row:** {a.row_number}  ·  **Cell:** `{a.cell_ref}`")

                if ai_ok:
                    expl_key = f"anomaly_expl_{pos}"
                    if expl_key in st.session_state.anomaly_explanations:
                        st.info(st.session_state.anomaly_explanations[expl_key])
                    else:
                        if st.button("Explain this anomaly", key=f"explain_{pos}"):
                            orchestrator = OrchestratorAgent()
                            with st.spinner("Analyzing…"):
                                explanation = orchestrator.explain_anomaly(a, stmt)
                            st.session_state.anomaly_explanations[expl_key] = explanation
                            st.info(explanation)


# ── Tab 7: Chat ────────────────────────────────────────────────────────────────
with itabs[1]:
    st.header("Chat with your Report")
    st.caption("Ask any question about the financial data. The agent answers using real numbers from your statement.")

    if not ai_ok:
        st.warning(
            "AI is not available. Start Ollama and pull a model to enable chat.\n\n"
            f"Run: `ollama pull {OLLAMA_MODEL}`"
        )
    elif st.session_state.ai_pending:
        # Phase 2 is running below — chat must wait or its st.rerun() will
        # kill the streaming response mid-flight, leaving an empty reply.
        st.info(
            "AI is still generating insights below. "
            "Chat will be available as soon as that finishes.",
            icon="⏳",
        )
    else:
        # Clear chat history button (only show when there is history)
        if st.session_state.chat_history:
            if st.button("Clear chat history", key="clear_chat"):
                st.session_state.chat_history = []
                st.rerun()

        for msg in st.session_state.chat_history:
            with st.chat_message(msg["role"]):
                content = _safe_md(msg["content"]) if msg["role"] == "assistant" else msg["content"]
                st.markdown(content)

        # ── Persistent suggestion pool — show up to 5 unasked questions ────────
        _ALL_SUGGESTIONS = [
            "Why is cash flow negative if net income is positive?",
            "Which expense category is growing fastest month over month?",
            "How does our vacancy rate compare to the industry benchmark?",
            "What drove the changes in NOI between Q1 and Q4?",
            "Are there any expenses I should investigate further?",
            "What is the overall NOI margin and how does it trend?",
            "Which months had the highest and lowest revenue?",
            "How does payroll expense compare to total operating expenses?",
            "What is the debt service coverage ratio and what does it mean?",
            "Are there any months with unusual spikes in utility costs?",
            "What percentage of gross potential rent is lost to vacancy?",
            "What is the biggest driver of operating expense growth?",
        ]
        _asked = {msg["content"] for msg in st.session_state.chat_history if msg["role"] == "user"}
        _remaining = [q for q in _ALL_SUGGESTIONS if q not in _asked]
        if _remaining:
            st.subheader("Suggested questions")
            _show = _remaining[:5]
            _scols = st.columns(2)
            for _si, _sq in enumerate(_show):
                _pool_idx = _ALL_SUGGESTIONS.index(_sq)
                if _scols[_si % 2].button(_sq, key=f"sugg_{_pool_idx}", use_container_width=True):
                    st.session_state._pending_question = _sq

        pending    = st.session_state.pop("_pending_question", None)
        user_input = st.chat_input("Ask about your financial report…")
        question   = pending or user_input

        if question:
            chat_agent: ChatAgent = st.session_state.chat_agent
            if chat_agent is None:
                st.error("Please run analysis first.")
            else:
                with st.chat_message("user"):
                    st.markdown(question)
                st.session_state.chat_history.append({"role": "user", "content": question})

                with st.chat_message("assistant"):
                    placeholder   = st.empty()
                    placeholder.markdown("_Thinking..._")
                    full_response = ""
                    try:
                        for chunk in chat_agent.ask(question, st.session_state.chat_history[:-1]):
                            full_response += chunk
                            placeholder.markdown(_safe_md(full_response) + "▌")
                    except Exception as e:
                        placeholder.error(f"Chat error: {e}")
                        full_response = f"_(Error: {e})_"
                    if full_response:
                        placeholder.markdown(_safe_md(full_response))
                    else:
                        placeholder.warning(
                            "No response received. "
                            "Check that Ollama is running (`ollama serve`) and the model is loaded."
                        )

                st.session_state.chat_history.append({"role": "assistant", "content": full_response})
                st.rerun()  # refresh so suggestion buttons update to exclude the just-asked question


# ── Tab 8: Custom Charts ───────────────────────────────────────────────────────
with itabs[2]:
    st.header("Custom Charts")
    st.caption(
        "Describe any chart you want to see in plain English and the AI will generate it. "
        "Example: \"Show payroll and utilities side by side by month\" or "
        "\"Pie chart of annual expense breakdown.\""
    )

    if not ai_ok:
        st.warning("AI is not available. Custom chart generation requires an AI connection.")
    else:
        with st.form("custom_chart_form", clear_on_submit=True):
            user_request = st.text_input(
                "What do you want to see?",
                placeholder="e.g. Compare NOI margin and vacancy rate trends over the year",
            )
            submitted = st.form_submit_button("Generate Chart", type="primary", use_container_width=True)

        # Financial / chart keyword gate — reject nonsense before hitting the LLM.
        _CHART_KEYWORDS = {
            "show", "chart", "plot", "graph", "compare", "display", "visualize",
            "line", "bar", "pie", "area", "scatter", "trend", "breakdown",
            "revenue", "income", "expense", "cost", "profit", "loss", "noi", "cash",
            "rent", "vacancy", "payroll", "utilities", "utility", "tax", "taxes",
            "insurance", "management", "maintenance", "repair", "operating",
            "debt", "service", "dscr", "oer", "margin", "rate", "ratio", "flow",
            "monthly", "annual", "quarter", "month", "year", "total", "net", "gross",
            "occupancy", "concession", "fee", "reserve", "percentage", "percent",
            "jan", "feb", "mar", "apr", "may", "jun",
            "jul", "aug", "sep", "oct", "nov", "dec",
        }

        if submitted and user_request.strip():
            _words = set(re.sub(r"[^a-z\s]", "", user_request.lower()).split())
            if not _words & _CHART_KEYWORDS:
                st.warning(
                    "Please describe a financial metric or chart you'd like to see. "
                    "For example: *\"Show NOI and revenue by month\"* or "
                    "*\"Pie chart of annual expense breakdown.\"*"
                )
            else:
                with st.spinner("Generating chart..."):
                    viz_agent = VizAgent()
                    fig, explanation = viz_agent.generate(user_request.strip(), stmt)
                if fig is not None:
                    st.session_state.custom_charts.insert(0, {
                        "request":     user_request.strip(),
                        "explanation": explanation,
                        "fig":         fig,
                    })
                else:
                    st.error(f"Could not generate chart: {explanation}")

        if st.session_state.custom_charts:
            for i, entry in enumerate(st.session_state.custom_charts):
                with st.expander(
                    f"**{entry['request']}**",
                    expanded=(i == 0),
                ):
                    if entry["explanation"]:
                        st.caption(entry["explanation"])
                    st.plotly_chart(entry["fig"], use_container_width=True)

            if st.button("Clear all custom charts", key="clear_custom_charts"):
                st.session_state.custom_charts = []
                st.rerun()


# ── Tab 9: Deal Details ────────────────────────────────────────────────────────
with itabs[0]:
    st.header("Deal Details")
    st.caption(
        "Enter acquisition and financing info to unlock investment-level metrics "
        "that complement the operating data in your statement."
    )

    # ── Inputs — key= binds directly to session state, no manual read/write needed
    col_prop, col_fin = st.columns(2, gap="large")

    with col_prop:
        st.subheader("Property")
        st.number_input("Purchase Price ($)", min_value=0.0, step=10_000.0,
                        format="%.0f", key="deal_purchase_price")
        st.number_input("Current Market Value ($)", min_value=0.0, step=10_000.0,
                        format="%.0f", key="deal_market_value",
                        help="Leave 0 to use purchase price")
        st.number_input("Number of Units", min_value=0, step=1, key="deal_units")
        st.number_input("Total Square Footage", min_value=0, step=500, key="deal_sqft")

    with col_fin:
        st.subheader("Financing")
        st.number_input("Outstanding Loan Balance ($)", min_value=0.0, step=10_000.0,
                        format="%.0f", key="deal_loan_balance")
        st.number_input("Interest Rate (%)", min_value=0.0, max_value=30.0,
                        step=0.125, format="%.3f", key="deal_interest_rate")

    st.divider()

    # ── Calculated metrics ─────────────────────────────────────────────────────
    _pp   = st.session_state.deal_purchase_price
    _mv   = st.session_state.deal_market_value or _pp
    _u    = int(st.session_state.deal_units)
    _sf   = int(st.session_state.deal_sqft)
    _loan = st.session_state.deal_loan_balance
    _rate = st.session_state.deal_interest_rate

    _noi = stmt.annual("noi")
    _rev = stmt.annual("total_revenue")
    _cf  = stmt.annual("cash_flow")

    _equity_val    = _mv - _loan              # current equity (always valid; = _mv if no loan)
    _cash_invested = (_pp - _loan) if _loan > 0 else _pp  # actual down payment / cash at closing

    def _pct(v):
        return f"{v * 100:.2f}%" if v is not None else "N/A"

    def _dollar(v):
        return f"${v:,.0f}" if v is not None else "N/A"

    def _mult(v):
        return f"{v:.1f}x" if v is not None else "N/A"

    def _status_badge(status):
        _sc = {
            "Good":    ("#2ECC71", "rgba(46,204,113,0.15)"),
            "Watch":   ("#F39C12", "rgba(243,156,18,0.15)"),
            "Concern": ("#E74C3C", "rgba(231,76,60,0.15)"),
        }
        c, bg = _sc.get(status, ("#888", "rgba(128,128,128,0.1)"))
        return (
            f'<span style="background:{bg};color:{c};padding:2px 8px;'
            f'border-radius:6px;font-size:0.72rem;font-weight:600;">{status}</span>'
        )

    def _deal_kpi(col, label, value_str, bench=None, status=None, note=None):
        badge = _status_badge(status) if status else ""
        note_html  = f'<div style="font-size:0.76rem;opacity:0.45;margin-top:5px;">{note}</div>'  if note  else ""
        bench_html = f'<div style="font-size:0.73rem;opacity:0.38;margin-top:4px;">{bench}</div>' if bench else ""
        col.markdown(
            f'<div class="kpi-card" style="min-height:110px;">'
            f'<div class="kpi-label">{label}</div>'
            f'<div class="kpi-value" style="font-size:1.3rem;">{value_str}</div>'
            f'{note_html}{badge}{bench_html}'
            f'</div>',
            unsafe_allow_html=True,
        )

    if _pp <= 0:
        st.info("Enter a purchase price above to calculate investment metrics.")
    else:
        # Compute metrics
        cap_rate = (_noi / _pp)              if _noi is not None and _pp > 0            else None
        coc      = (_cf  / _cash_invested)  if _cf  is not None and _cash_invested > 0  else None
        grm      = (_pp  / _rev)        if _rev and _rev > 0                  else None
        ppu      = (_pp  / _u)          if _u > 0                             else None
        psf      = (_pp  / _sf)         if _sf > 0                            else None
        noi_u    = (_noi / _u)          if _noi is not None and _u > 0        else None
        dy       = (_noi / _loan)       if _noi is not None and _loan > 0     else None
        ltv      = (_loan / _mv)        if _loan > 0 and _mv > 0             else None

        def _cap_status(v):
            if v is None: return None
            return "Good" if v >= 0.06 else "Watch" if v >= 0.04 else "Concern"

        def _coc_status(v):
            if v is None: return None
            return "Good" if v >= 0.08 else "Watch" if v >= 0.05 else "Concern"

        def _ltv_status(v):
            if v is None: return None
            return "Good" if v <= 0.65 else "Watch" if v <= 0.75 else "Concern"

        def _dy_status(v):
            if v is None: return None
            return "Good" if v >= 0.10 else "Watch" if v >= 0.08 else "Concern"

        st.subheader("Investment Metrics")
        r1 = st.columns(4)
        r2 = st.columns(4)

        _deal_kpi(r1[0], "Cap Rate",
                  _pct(cap_rate),
                  bench="Benchmark: 6%+",
                  status=_cap_status(cap_rate))

        _deal_kpi(r1[1], "Cash-on-Cash",
                  _pct(coc),
                  bench="Benchmark: 8%+",
                  status=_coc_status(coc),
                  note=f"${_cf:,.0f} CF / ${_cash_invested:,.0f} invested" if coc else None)

        _deal_kpi(r1[2], "Gross Rent Multiplier",
                  _mult(grm),
                  bench="Lower is better",
                  note=f"${_pp:,.0f} / ${_rev:,.0f} revenue" if grm else None)

        _deal_kpi(r1[3], "Equity",
                  _dollar(_equity_val),
                  bench=f"${_mv:,.0f} - ${_loan:,.0f}" if _loan > 0 else "All-cash (no loan)")

        _deal_kpi(r2[0], "Price / Unit",
                  _dollar(ppu),
                  note=f"{_u} units" if _u else None)

        _deal_kpi(r2[1], "NOI / Unit",
                  _dollar(noi_u) if noi_u else ("Enter units" if _u == 0 else "N/A"),
                  note="Annual" if noi_u else None)

        _deal_kpi(r2[2], "LTV",
                  _pct(ltv) if ltv else "Enter loan balance",
                  bench="Benchmark: <65%" if ltv else None,
                  status=_ltv_status(ltv))

        _deal_kpi(r2[3], "Debt Yield",
                  _pct(dy) if dy else "Enter loan balance",
                  bench="Benchmark: 10%+" if dy else None,
                  status=_dy_status(dy))

        if psf or _rate > 0:
            parts = []
            if psf:
                parts.append(f"Price/sq ft: ${psf:,.0f}  ({_sf:,} sq ft)")
            if _rate > 0:
                parts.append(f"Interest rate: {_rate:.3f}%")
            st.caption("  ·  ".join(parts))


# ── Phase 2: AI generation (runs after tabs so all data tabs are visible first) ─
# Only step labels are written here so no markdown content bleeds into every tab.
# After generation completes a rerun populates the AI sections in their own tabs.
if st.session_state.ai_pending:
    st.divider()
    with st.status("Generating AI insights…", expanded=True) as ai_status:
        orchestrator = OrchestratorAgent()

        st.write("Writing executive summary…")
        full_text = ""
        for chunk in orchestrator.generate_executive_summary(stmt, ratios, anomalies, trends):
            full_text += chunk
        st.session_state.summary_text = full_text

        ai_status.update(label="AI insights ready!", state="complete", expanded=False)

    st.session_state.ai_pending = False
    st.rerun()   # rerun to populate Executive Summary and Ratio Commentary in their tabs
