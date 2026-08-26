# Discrepancy Detection Evaluation — mode: end_to_end

Cases: 15 · Expected anomalies: 14 · Precision: **63.16%** · Recall: **85.71%** · F1: **72.73%**

| Anomaly type | TP | FP | FN | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- |
| amount_exceeds_contract | 0 | 1 | 0 | 0.00% | 0.00% | 0.00% |
| conflicting_invoice_number | 1 | 0 | 0 | 100.00% | 100.00% | 100.00% |
| duplicate_invoice | 1 | 0 | 0 | 100.00% | 100.00% | 100.00% |
| inconsistent_payment_terms | 1 | 1 | 0 | 50.00% | 100.00% | 66.67% |
| incorrect_tax_calculation | 1 | 2 | 0 | 33.33% | 100.00% | 50.00% |
| incorrect_total | 1 | 2 | 0 | 33.33% | 100.00% | 50.00% |
| invoice_date_outside_contract | 0 | 1 | 1 | 0.00% | 0.00% | 0.00% |
| missing_required_field | 0 | 0 | 1 | 0.00% | 0.00% | 0.00% |
| po_mismatch | 1 | 0 | 0 | 100.00% | 100.00% | 100.00% |
| policy_violation | 2 | 0 | 0 | 100.00% | 100.00% | 100.00% |
| vendor_name_mismatch | 2 | 0 | 0 | 100.00% | 100.00% | 100.00% |
| wrong_currency | 2 | 0 | 0 | 100.00% | 100.00% | 100.00% |
