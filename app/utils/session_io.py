"""
Export and import full session snapshots.

Export format: JSON (.json)
  - Text fields (summary, chat history, etc.) are stored as-is
  - Plotly figures are serialized with fig.to_json()
  - The original Excel file is base64-encoded so the session is self-contained

Import: reverses the process.  The caller is responsible for re-running
parse_excel / calculate_ratios / detect_anomalies / analyze_trends on the
restored file bytes.
"""

import base64
import json
from datetime import datetime
from typing import Any, Dict, List


def export_session(
    *,
    filename: str,
    file_bytes: bytes,
    property_name: str,
    period: str,
    summary_text: str,
    ratio_commentary: str,
    anomaly_explanations: dict,
    chat_history: list,
    custom_charts: list,
) -> bytes:
    """
    Serialize the current session to UTF-8 encoded JSON bytes.

    Returns bytes ready to be passed to st.download_button.
    """
    charts_data: List[Dict[str, Any]] = []
    for c in custom_charts:
        fig_json = None
        if c.get("fig") is not None:
            try:
                fig_json = c["fig"].to_json()
            except Exception:
                pass
        charts_data.append({
            "request":     c.get("request", ""),
            "explanation": c.get("explanation", ""),
            "fig_json":    fig_json,
        })

    payload = {
        "version":              1,
        "exported_at":          datetime.now().isoformat(),
        "filename":             filename,
        "file_data_b64":        base64.b64encode(file_bytes).decode("utf-8"),
        "property_name":        property_name,
        "period":               period,
        "summary_text":         summary_text,
        "ratio_commentary":     ratio_commentary,
        "anomaly_explanations": anomaly_explanations,
        "chat_history":         chat_history,
        "custom_charts":        charts_data,
    }

    return json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")


def import_session(data: bytes) -> Dict[str, Any]:
    """
    Deserialize a session snapshot exported by export_session().

    Returns a dict with keys:
      filename, file_bytes, property_name, period,
      summary_text, ratio_commentary, anomaly_explanations,
      chat_history, custom_charts

    Raises ValueError on invalid or unrecognized input.
    """
    try:
        payload = json.loads(data.decode("utf-8"))
    except Exception as exc:
        raise ValueError(f"Could not read session file: {exc}") from exc

    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise ValueError(
            "Unrecognized session file format. "
            "Only files exported by Statement Utility (version 1) are supported."
        )

    b64 = payload.get("file_data_b64", "")
    if not b64:
        raise ValueError("Session file does not contain spreadsheet data.")

    try:
        file_bytes = base64.b64decode(b64)
    except Exception as exc:
        raise ValueError(f"Could not decode spreadsheet data: {exc}") from exc

    # Restore Plotly figures from their JSON representations
    import plotly.io as pio  # local import — avoids hard dep at module level
    custom_charts: List[Dict[str, Any]] = []
    for c in payload.get("custom_charts", []):
        fig = None
        if c.get("fig_json"):
            try:
                fig = pio.from_json(c["fig_json"])
            except Exception:
                pass
        if fig is not None:
            custom_charts.append({
                "request":     c.get("request", ""),
                "explanation": c.get("explanation", ""),
                "fig":         fig,
            })

    return {
        "filename":             payload.get("filename", "imported.xlsx"),
        "file_bytes":           file_bytes,
        "property_name":        payload.get("property_name", ""),
        "period":               payload.get("period", ""),
        "summary_text":         payload.get("summary_text", ""),
        "ratio_commentary":     payload.get("ratio_commentary", ""),
        "anomaly_explanations": payload.get("anomaly_explanations", {}),
        "chat_history":         payload.get("chat_history", []),
        "custom_charts":        custom_charts,
    }
