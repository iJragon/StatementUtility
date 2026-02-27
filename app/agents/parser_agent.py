"""
Parser Agent — LLM fallback for label mapping.

Only called when the heuristic key-figure extractor leaves gaps (i.e. the
spreadsheet uses non-standard label names).  Sends just the list of row
labels to the LLM — no financial values — and asks it to map each missing
concept to the best matching label.  Fast and cheap: one small API call,
result is cached by file hash so it never re-runs for the same file.
"""

import json
import re
from typing import Dict, List

from app.agents.base import BaseAgent

# Human-readable descriptions sent in the prompt so the LLM understands
# what each semantic concept means regardless of what the file calls it.
CONCEPT_DESCRIPTIONS: Dict[str, str] = {
    "gross_potential_rent":      "Maximum possible rent if all units were occupied at market rate",
    "vacancy_loss":              "Revenue lost due to vacant or unoccupied units",
    "concession_loss":           "Rent discounts or free-rent incentives given to tenants",
    "office_model_rent_free":    "Rent-free units used as office, model, or employee units",
    "bad_debt":                  "Uncollected rent written off as bad debt or credit loss",
    "net_rental_revenue":        "Gross rent minus vacancy, concessions, and bad debt",
    "other_tenant_charges":      "Additional charges to tenants beyond base rent (fees, etc.)",
    "total_revenue":             "Total income from all sources combined",
    "controllable_expenses":     "Operating expenses management can directly control",
    "non_controllable_expenses": "Fixed expenses outside management control (taxes, insurance)",
    "total_operating_expenses":  "Sum of all operating expenses",
    "noi":                       "Net Operating Income: total revenue minus operating expenses",
    "total_payroll":             "All staff wages, salaries, and benefits combined",
    "management_fees":           "Property management company fees",
    "utilities":                 "Gas, electric, water, and other utility costs",
    "real_estate_taxes":         "Property tax expenses",
    "insurance":                 "Property and liability insurance premiums",
    "financial_expense":         "Debt service: loan principal and interest payments",
    "replacement_expense":       "Capital replacement reserve contributions",
    "total_non_operating":       "Non-operating income or expenses below the operating line",
    "net_income":                "Bottom-line profit after all expenses including debt service",
    "cash_flow":                 "Actual cash generated after all expenses and balance sheet changes",
}


class LabelMapperAgent(BaseAgent):
    """
    Maps non-standard spreadsheet row labels to canonical semantic concept names.

    Usage:
        mapper = LabelMapperAgent()
        label_map = mapper.map_labels(all_labels, missing_concepts)
        # label_map = {"gross_potential_rent": "Potential Gross Revenue", ...}
    """

    def map_labels(
        self,
        all_labels: List[str],
        missing_concepts: List[str],
    ) -> Dict[str, str]:
        """
        Returns {concept_name: exact_row_label} for concepts the LLM can
        confidently match.  Concepts with no confident match are omitted.
        """
        if not missing_concepts or not all_labels:
            return {}

        concepts_block = "\n".join(
            f'  "{c}": "{CONCEPT_DESCRIPTIONS.get(c, c)}"'
            for c in missing_concepts
        )
        labels_block = "\n".join(f"  - {lbl}" for lbl in all_labels[:300])

        prompt = (
            "You are analyzing row labels from a financial statement spreadsheet.\n\n"
            "All row labels found in the sheet:\n"
            f"{labels_block}\n\n"
            "Map each concept below to the BEST matching label from the list above.\n"
            "Only include a concept if you are confident there is a match.\n"
            "Return ONLY valid JSON with no explanation or markdown.\n\n"
            "Concepts to find:\n"
            f"{{\n{concepts_block}\n}}\n\n"
            'Return format example:\n'
            '{\n'
            '  "total_revenue": "Total Income",\n'
            '  "noi": "Net Operating Profit (Loss)"\n'
            '}'
        )

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a financial data mapping assistant. "
                    "Return only valid JSON. No markdown, no explanation."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        raw = ""
        try:
            raw = self._chat(messages, temperature=0.0, max_tokens=600)
        except Exception:
            return {}

        return self._parse_json(raw)

    # ── Internal ───────────────────────────────────────────────────────────────

    def _parse_json(self, raw: str) -> Dict[str, str]:
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`")
        # Try direct parse
        try:
            result = json.loads(raw)
            if isinstance(result, dict):
                return {
                    k: v
                    for k, v in result.items()
                    if isinstance(k, str) and isinstance(v, str)
                }
        except Exception:
            pass
        # Try extracting the first {...} block
        m = re.search(r"\{[^{}]+\}", raw, re.DOTALL)
        if m:
            try:
                result = json.loads(m.group())
                if isinstance(result, dict):
                    return {
                        k: v
                        for k, v in result.items()
                        if isinstance(k, str) and isinstance(v, str)
                    }
            except Exception:
                pass
        return {}
