from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any, Tuple


@dataclass
class LineItem:
    """One row in the financial statement (detail line, subtotal, or header)."""
    label: str
    monthly_values: Dict[str, Optional[float]]   # {"Jan 2025": 376175.0, ...}
    annual_total: Optional[float]
    row_number: int                               # 1-based Excel row (for anomaly refs)
    account_code: Optional[str] = None           # e.g. "5120-0000"
    is_subtotal: bool = False                    # True when label starts with TOTAL/NET/CASH
    is_header: bool = False                      # True for pure category header rows
    indent_level: int = 0                        # leading-space indent depth

    def get(self, month: str) -> Optional[float]:
        return self.monthly_values.get(month)

    def nonzero_months(self) -> List[str]:
        return [m for m, v in self.monthly_values.items() if v not in (None, 0.0)]

    def has_any_value(self) -> bool:
        return any(v not in (None, 0.0) for v in self.monthly_values.values())


@dataclass
class SheetStructure:
    """Detected layout of an Excel sheet — column indices and header row."""
    header_row: int                         # 0-based row index
    month_cols: List[Tuple[int, str]]       # [(col_idx, "Jan 2025"), ...]
    total_col: Optional[int]                # column index for the "Total" column
    account_col: Optional[int]             # column index for account codes
    label_col: int                          # column index for row labels
    data_start_row: int                     # 0-based first data row


@dataclass
class FinancialStatement:
    """
    Fully parsed financial statement, format-agnostic.

    All monetary values are stored monthly + as an annual total.
    `key_figures` provides quick access to critical rollup rows by
    semantic name regardless of what the source sheet called them.
    """
    property_name: str
    period: str
    book_type: str
    months: List[str]                                       # ordered list of month labels
    all_rows: List[LineItem]                                # every row in sheet order
    key_figures: Dict[str, LineItem]                        # semantic_name -> LineItem
    structure: SheetStructure
    raw_data: List[List[Any]]                               # original cell values

    # ── convenience accessors ──────────────────────────────────────────────

    def get_figure(self, name: str) -> Optional[LineItem]:
        return self.key_figures.get(name)

    def annual(self, name: str) -> Optional[float]:
        item = self.key_figures.get(name)
        return item.annual_total if item else None

    def monthly(self, name: str, month: str) -> Optional[float]:
        item = self.key_figures.get(name)
        return item.monthly_values.get(month) if item else None

    def data_rows(self) -> List[LineItem]:
        """All rows that are account-level detail (not headers, not subtotals)."""
        return [r for r in self.all_rows if r.account_code and not r.is_subtotal]

    def subtotal_rows(self) -> List[LineItem]:
        return [r for r in self.all_rows if r.is_subtotal]


# ── Semantic names for key_figures ────────────────────────────────────────────
# These are the keys used throughout the analysis layer.
KEY_FIGURE_NAMES = [
    "gross_potential_rent",
    "vacancy_loss",
    "concession_loss",
    "office_model_rent_free",
    "bad_debt",
    "net_rental_revenue",
    "other_tenant_charges",
    "total_revenue",
    "controllable_expenses",
    "non_controllable_expenses",
    "total_operating_expenses",
    "noi",
    "total_payroll",
    "management_fees",
    "utilities",
    "real_estate_taxes",
    "insurance",
    "financial_expense",
    "replacement_expense",
    "total_non_operating",
    "net_income",
    "cash_flow",
]
