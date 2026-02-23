"""
Rule-based anomaly detector.

Flags issues in the financial statement with exact cell references so the
owner knows exactly where to look in the original spreadsheet.
"""

import re
import statistics
from dataclasses import dataclass, field
from typing import List, Optional

from app.models.statement import FinancialStatement, LineItem

COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# Balance sheet account prefixes — sign changes and variance are normal here
BALANCE_SHEET_PREFIXES = ("1", "2", "3")


def _is_balance_sheet(item: "LineItem") -> bool:
    """Return True for accounts whose sign fluctuation is expected (1xxx/2xxx/3xxx)."""
    if item.account_code:
        return item.account_code[0] in BALANCE_SHEET_PREFIXES
    return False


def col_letter(zero_based_idx: int) -> str:
    """Convert 0-based column index to Excel letter (A, B, ..., Z, AA, ...)."""
    result = ""
    idx = zero_based_idx
    while True:
        result = COL_LETTERS[idx % 26] + result
        idx = idx // 26 - 1
        if idx < 0:
            break
    return result


@dataclass
class Anomaly:
    severity: str          # "high" | "medium" | "low"
    category: str          # "missing_data" | "outlier" | "sign_change" | "formula_mismatch" | "structural"
    description: str
    cell_ref: str          # e.g. "C47" or "C47:N47"
    row_number: int        # 1-based Excel row
    line_item_label: str
    value: Optional[float] = None
    expected: str = ""


def detect_anomalies(stmt: FinancialStatement) -> List[Anomaly]:
    anomalies: List[Anomaly] = []
    s = stmt.structure
    month_col_indices = [ci for ci, _ in s.month_cols]

    for item in stmt.all_rows:
        if item.is_header:
            continue

        month_vals = [item.monthly_values.get(m) for m in stmt.months]

        # ── 1. Blank / None cells in a data row that has some values ──────────
        if item.account_code:  # only flag detail rows, not subtotals
            none_months = [
                (m, ci) for (m, ci), v in zip(zip(stmt.months, month_col_indices), month_vals)
                if v is None
            ]
            if none_months and any(v is not None for v in month_vals):
                for missing_month, col_idx in none_months:
                    cell = f"{col_letter(col_idx)}{item.row_number}"
                    anomalies.append(Anomaly(
                        severity="medium",
                        category="missing_data",
                        description=f"Missing value for {missing_month}",
                        cell_ref=cell,
                        row_number=item.row_number,
                        line_item_label=item.label,
                        expected="numeric value",
                    ))

        # ── 2. Entirely blank data row (None only — not zero — indicates missing data) ──
        # Zero values are often intentional (unused accounts); only flag truly None cells
        if item.account_code and all(v is None for v in month_vals):
            first_col = col_letter(month_col_indices[0]) if month_col_indices else "C"
            last_col  = col_letter(month_col_indices[-1]) if month_col_indices else "N"
            anomalies.append(Anomaly(
                severity="low",
                category="missing_data",
                description="All monthly values are blank (None) for this account — no data was entered",
                cell_ref=f"{first_col}{item.row_number}:{last_col}{item.row_number}",
                row_number=item.row_number,
                line_item_label=item.label,
            ))

        # ── 3. Unexpected sign change mid-year (skip balance sheet accts) ───────
        numeric = [v for v in month_vals if v is not None and v != 0.0]
        if len(numeric) >= 4 and not _is_balance_sheet(item):
            signs = set(1 if v > 0 else -1 for v in numeric)
            if len(signs) > 1:
                # Find the first month where the sign flipped
                prev_sign = None
                for m, v in zip(stmt.months, month_vals):
                    if v is None or v == 0.0:
                        continue
                    cur_sign = 1 if v > 0 else -1
                    if prev_sign is not None and cur_sign != prev_sign:
                        ci = month_col_indices[stmt.months.index(m)]
                        anomalies.append(Anomaly(
                            severity="medium",
                            category="sign_change",
                            description=f"Sign flipped in {m} (was {'positive' if prev_sign > 0 else 'negative'}, now {'positive' if cur_sign > 0 else 'negative'})",
                            cell_ref=f"{col_letter(ci)}{item.row_number}",
                            row_number=item.row_number,
                            line_item_label=item.label,
                            value=v,
                        ))
                        break
                    prev_sign = cur_sign

        # ── 4. Month-over-month outlier (> 2.5 std dev spike, skip balance sheet) ──
        if len(numeric) >= 4 and not _is_balance_sheet(item):
            try:
                mean = statistics.mean(numeric)
                stdev = statistics.stdev(numeric)
                if stdev > 0:
                    for m, v in zip(stmt.months, month_vals):
                        if v is None:
                            continue
                        z = abs(v - mean) / stdev
                        if z > 2.5:
                            ci = month_col_indices[stmt.months.index(m)]
                            anomalies.append(Anomaly(
                                severity="medium",
                                category="outlier",
                                description=(
                                    f"{m} value ({_fmt(v)}) is {z:.1f} std devs from the monthly average ({_fmt(mean)})"
                                ),
                                cell_ref=f"{col_letter(ci)}{item.row_number}",
                                row_number=item.row_number,
                                line_item_label=item.label,
                                value=v,
                                expected=f"~{_fmt(mean)}",
                            ))
            except statistics.StatisticsError:
                pass

    # ── 5. Cash flow negative while net income positive ───────────────────────
    ni = stmt.annual("net_income")
    cf = stmt.annual("cash_flow")
    if ni is not None and cf is not None and ni > 0 and cf < 0:
        ni_row = stmt.get_figure("net_income")
        cf_row = stmt.get_figure("cash_flow")
        anomalies.append(Anomaly(
            severity="high",
            category="structural",
            description=(
                f"Cash Flow is negative (${cf:,.0f}) despite positive Net Income (${ni:,.0f}). "
                "This is typically caused by balance sheet changes (prepaid expenses, escrow deposits, "
                "accruals). Review the 'Changes to Balance Sheet' section."
            ),
            cell_ref=(
                f"O{cf_row.row_number}" if cf_row else "N/A"
            ),
            row_number=cf_row.row_number if cf_row else 0,
            line_item_label="Cash Flow vs Net Income",
            value=cf,
            expected=f"Positive (Net Income = ${ni:,.0f})",
        ))

    # ── 6. NOI negative ───────────────────────────────────────────────────────
    noi = stmt.annual("noi")
    if noi is not None and noi < 0:
        noi_row = stmt.get_figure("noi")
        anomalies.append(Anomaly(
            severity="high",
            category="structural",
            description=f"Net Operating Income is negative (${noi:,.0f}). Operating expenses exceed revenue.",
            cell_ref=f"O{noi_row.row_number}" if noi_row else "N/A",
            row_number=noi_row.row_number if noi_row else 0,
            line_item_label="Net Operating Income",
            value=noi,
            expected="Positive",
        ))

    # Deduplicate: if the same row has multiple outlier months, consolidate into one
    anomalies = _deduplicate_outliers(anomalies)

    # Sort: high severity first, then by row number
    severity_order = {"high": 0, "medium": 1, "low": 2}
    anomalies.sort(key=lambda a: (severity_order.get(a.severity, 3), a.row_number))
    return anomalies


def _deduplicate_outliers(anomalies: List[Anomaly]) -> List[Anomaly]:
    """
    Merge multiple outlier anomalies for the same row into a single summary anomaly.
    Keeps sign-change, missing-data, and structural anomalies as-is.
    """
    from collections import defaultdict
    outlier_groups: dict = defaultdict(list)
    other: List[Anomaly] = []

    for a in anomalies:
        if a.category == "outlier":
            outlier_groups[a.row_number].append(a)
        else:
            other.append(a)

    merged: List[Anomaly] = []
    for row_num, group in outlier_groups.items():
        if len(group) == 1:
            merged.append(group[0])
        else:
            months_listed = ", ".join(
                a.cell_ref.rstrip("0123456789") + "" for a in group
            )
            # Build a combined cell ref spanning the range
            cols = [a.cell_ref.rstrip("0123456789") for a in group]
            cell_range = f"{cols[0]}{row_num}:{cols[-1]}{row_num}"
            merged.append(Anomaly(
                severity="medium",
                category="outlier",
                description=(
                    f"{len(group)} months show unusually high or low values "
                    f"(avg ${group[0].value:,.0f} vs mean {group[0].expected})"
                    if group[0].value is not None else
                    f"{len(group)} months flagged as statistical outliers"
                ),
                cell_ref=cell_range,
                row_number=row_num,
                line_item_label=group[0].line_item_label,
                expected=group[0].expected,
            ))

    return other + merged


def _fmt(val: float) -> str:
    return f"${val:,.0f}"
