# Statement Utility

A local financial statement analysis tool that ingests Excel P&L spreadsheets and produces financial ratios, visualizations, anomaly detection with exact cell references, trend analysis, and an AI-powered chat interface — all running free on your own machine.

---

## What It Does

| Tab | Description |
|-----|-------------|
| **Executive Summary** | AI-generated narrative + KPI cards + key ratio snapshot |
| **Revenue** | Monthly revenue vs. OpEx line chart, waterfall, vacancy rate bar chart, NOI margin trend |
| **Expenses** | Donut breakdown, controllable vs. non-controllable stacked bar, expense heatmap, cash flow vs. net income |
| **Financial Ratios** | 11 ratios benchmarked against industry standards, KPI gauges, color-coded table, AI commentary |
| **Anomalies** | Rule-based flags with exact Excel cell references, filter by severity, AI explanation per anomaly |
| **Trends** | Month-over-month trend comparison for 10 key metrics, peak/trough identification |
| **Chat** | Ask anything about the report in plain English — answers grounded in real numbers |

### Sidebar features
- **File upload** — drag-and-drop any `.xlsx` P&L
- **Analysis history** — disk-persisted, loads instantly, per-entry delete + clear all
- **Force reanalyze** — re-run everything fresh even on a previously-seen file

---

## Prerequisites

### 1. Python 3.12

The launcher (`run.bat`) looks for Python at:
```
C:\Users\<you>\AppData\Local\Programs\Python\Python312\python.exe
```

Install via winget:
```
winget install Python.Python.3.12
```

Or download from https://www.python.org/downloads/

> **Tip:** During installation, check "Add Python to PATH".

### 2. Ollama (free local AI)

Ollama runs the AI model on your machine — no API key or internet connection required after the initial model download.

```
winget install Ollama.Ollama
```

Or download from https://ollama.com/download

### 3. Python Dependencies

```
pip install -r requirements.txt
```

Installs: `streamlit`, `pandas`, `openpyxl`, `plotly`, `openai`, `python-dotenv`, `numpy`, `httpx`

---

## First-Time Setup

### 1. Copy the environment file

```
copy .env.example .env
```

The default `.env` works out of the box with Ollama — no changes needed.

### 2. Pull the AI model (one-time, ~4.9 GB download)

```
ollama pull llama3.1:8b
```

> **Lighter alternative:** `ollama pull llama3.2:3b` (~2 GB) is faster but slightly less capable.

---

## Running the App

### Option A — Double-click launcher (easiest)

Double-click **`run.bat`** in the project folder. It will:
1. Start Ollama in the background (if not already running)
2. Check for the `llama3.1:8b` model (pull it if missing)
3. Launch the Streamlit dashboard at `http://localhost:8501`

### Option B — Manual launch

```bash
# 1. Start Ollama (separate terminal)
ollama serve

# 2. Launch the app
streamlit run app/main.py
```

---

## How It Works

### Parser
The Excel parser is **format-agnostic** — it uses heuristics to detect the header row, month columns, account code column, and label column automatically. No template required. It scores each row against known financial label patterns to extract key figures like Total Revenue, NOI, Cash Flow, etc.

### Analysis pipeline (two phases)
1. **Phase 1** (fast) — parse, ratios, anomaly detection, trend analysis → UI tabs populate immediately
2. **Phase 2** (AI) — executive summary and ratio commentary generate in the background, then populate their tabs

Results are cached to disk by file content hash, so re-uploading the same file loads instantly. Use **Force reanalyze** to regenerate everything fresh.

### Anomaly detection
- Missing values in partial data rows
- Unexpected sign changes mid-year (P&L accounts only)
- Statistical outliers (>2.5 std dev from monthly average)
- Structural issues (e.g. negative cash flow despite positive net income)

Balance sheet accounts (1xxx/2xxx/3xxx) are excluded from sign-change and outlier checks.

---

## Upgrading to Claude (Optional)

The app works free with Ollama by default. To use Claude for higher-quality responses:

1. Get an API key from https://console.anthropic.com
2. Edit `.env`:
   ```
   MODEL_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-4-6
   ```
3. Restart the app — no other changes needed.

---

## File Structure

```
StatementUtility/
├── app/
│   ├── main.py                    # Streamlit dashboard (7 tabs)
│   ├── config.py                  # LLM provider configuration
│   ├── models/
│   │   └── statement.py           # Data models (FinancialStatement, LineItem)
│   ├── parser/
│   │   └── excel_parser.py        # Format-agnostic Excel parser
│   ├── analysis/
│   │   ├── ratio_calculator.py    # 11 financial ratios with benchmarks
│   │   ├── anomaly_detector.py    # Rule-based anomaly detection with cell refs
│   │   └── trend_analyzer.py      # Month-over-month trend analysis
│   ├── visualization/
│   │   └── chart_builder.py       # 10 Plotly chart types
│   └── agents/
│       ├── base.py                # Base LLM agent + financial context builder
│       ├── orchestrator.py        # Executive summary and ratio commentary
│       └── chat_agent.py          # Interactive Q&A with grounding injection
├── .env.example                   # Environment variable template
├── requirements.txt               # Python dependencies
└── run.bat                        # Windows one-click launcher
```

---

## Troubleshooting

**"streamlit is not recognized"**
Run `pip install streamlit` or use the full path to the Scripts folder.

**"ollama is not recognized"**
Restart your terminal after installing Ollama, or use the full path:
`C:\Users\<you>\AppData\Local\Programs\Ollama\ollama.exe`

**Chat says "AI not available"**
Ollama isn't running. Start it with `ollama serve`, or use `run.bat` which handles this automatically.

**Model not found error**
Pull the model first: `ollama pull llama3.1:8b`

**Parser doesn't detect the right rows**
The parser expects:
- Month names in a header row (Jan/Feb or January/February)
- Numeric account codes in one column (e.g. `5120-0000`)
- Text descriptions in the adjacent column
- Numeric values in the monthly columns

**Too many anomalies flagged**
The detector flags P&L accounts (5xxx–8xxx) for sign changes and statistical outliers. Zero values are intentional and not flagged — only truly blank/missing cells are. Balance sheet accounts (1xxx–3xxx) are excluded entirely.
