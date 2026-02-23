"""
Trend analyzer — computes month-over-month changes and linear trend direction
for key financial metrics.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from app.models.statement import FinancialStatement


@dataclass
class TrendSeries:
    metric: str
    label: str
    months: List[str]
    values: List[Optional[float]]
    mom_changes: List[Optional[float]]    # month-over-month absolute change
    mom_pct_changes: List[Optional[float]]  # month-over-month % change
    trend_direction: str                  # "improving" | "worsening" | "stable" | "volatile"
    overall_pct_change: Optional[float]   # first→last % change
    avg_value: Optional[float]
    peak_month: Optional[str]
    trough_month: Optional[str]


@dataclass
class TrendReport:
    series: Dict[str, TrendSeries] = field(default_factory=dict)

    def get(self, name: str) -> Optional[TrendSeries]:
        return self.series.get(name)


# Metrics to track, and whether "increasing" is good (True) or bad (False)
TRACKED_METRICS: List[Tuple[str, str, bool]] = [
    ("total_revenue",            "Total Revenue",            True),
    ("total_operating_expenses", "Total Operating Expenses", False),
    ("noi",                      "Net Operating Income",     True),
    ("vacancy_loss",             "Vacancy Loss",             False),
    ("controllable_expenses",    "Controllable Expenses",    False),
    ("non_controllable_expenses","Non-Controllable Expenses",False),
    ("total_payroll",            "Total Payroll",            False),
    ("management_fees",          "Management Fees",          False),
    ("cash_flow",                "Cash Flow",                True),
    ("net_income",               "Net Income",               True),
]


def analyze_trends(stmt: FinancialStatement) -> TrendReport:
    report = TrendReport()

    for metric_key, label, higher_is_better in TRACKED_METRICS:
        item = stmt.get_figure(metric_key)
        if item is None:
            continue

        values = [item.monthly_values.get(m) for m in stmt.months]
        numeric = [(i, v) for i, v in enumerate(values) if v is not None]

        if len(numeric) < 2:
            continue

        # Month-over-month changes
        mom_abs: List[Optional[float]] = [None]
        mom_pct: List[Optional[float]] = [None]
        for i in range(1, len(values)):
            prev = values[i - 1]
            curr = values[i]
            if prev is None or curr is None:
                mom_abs.append(None)
                mom_pct.append(None)
            else:
                mom_abs.append(curr - prev)
                mom_pct.append(((curr - prev) / abs(prev)) * 100 if prev != 0 else None)

        # Overall trend
        first_val = values[numeric[0][0]]
        last_val  = values[numeric[-1][0]]
        overall_pct = ((last_val - first_val) / abs(first_val) * 100) if first_val and first_val != 0 else None

        # Average
        nums = [v for v in values if v is not None]
        avg = sum(nums) / len(nums) if nums else None

        # Peak / trough
        peak_idx   = max(numeric, key=lambda x: x[1])[0]
        trough_idx = min(numeric, key=lambda x: x[1])[0]

        # Trend direction via linear slope
        direction = _classify_trend(numeric, higher_is_better, mom_pct)

        report.series[metric_key] = TrendSeries(
            metric=metric_key,
            label=label,
            months=stmt.months,
            values=values,
            mom_changes=mom_abs,
            mom_pct_changes=mom_pct,
            trend_direction=direction,
            overall_pct_change=overall_pct,
            avg_value=avg,
            peak_month=stmt.months[peak_idx] if nums else None,
            trough_month=stmt.months[trough_idx] if nums else None,
        )

    return report


def _classify_trend(
    numeric: List[Tuple[int, float]],
    higher_is_better: bool,
    mom_pct: List[Optional[float]],
) -> str:
    if len(numeric) < 3:
        return "stable"

    indices = [i for i, _ in numeric]
    vals    = [v for _, v in numeric]

    # Simple linear regression slope
    n = len(indices)
    mean_x = sum(indices) / n
    mean_y = sum(vals) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(indices, vals))
    den = sum((x - mean_x) ** 2 for x in indices)
    slope = num / den if den != 0 else 0

    # Volatility: std dev of mom_pct changes
    valid_pcts = [p for p in mom_pct if p is not None]
    if len(valid_pcts) >= 3:
        import statistics
        try:
            stdev = statistics.stdev(valid_pcts)
            if stdev > 20:
                return "volatile"
        except Exception:
            pass

    # Classify slope relative to mean value magnitude
    mean_val = abs(mean_y) if mean_y != 0 else 1
    slope_pct = (slope / mean_val) * 100

    if abs(slope_pct) < 1.0:
        return "stable"

    if slope > 0:
        return "improving" if higher_is_better else "worsening"
    else:
        return "worsening" if higher_is_better else "improving"
