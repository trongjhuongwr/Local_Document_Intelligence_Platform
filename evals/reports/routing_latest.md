# Query Routing Evaluation

Four router variants are measured on the same labeled set. The production default is purely deterministic (ROUTER_LLM_ENABLED=false) because the measurements below show the 1B LLM lowers accuracy on this closed domain.

Queries: 40 · Production (deterministic): **92.50%** (macro F1 92.63%) · Keyword-first+LLM: 82.50% · LLM-only few-shot: 70.00% (zero-shot measured at 20.00%) · Method mix: {'keyword_default': 9, 'keyword': 31}

| Route | Production F1 | Keyword+LLM F1 | LLM-only F1 | Keyword-only F1 |
| --- | --- | --- | --- | --- |
| factual_rag | 82.35% | 54.55% | 53.33% | 82.35% |
| structured_lookup | 94.12% | 69.57% | 69.57% | 94.12% |
| document_compare | 100.00% | 100.00% | 82.35% | 100.00% |
| discrepancy_analysis | 93.33% | 93.33% | 66.67% | 93.33% |
| summarization | 93.33% | 93.33% | 76.92% | 93.33% |

Confusion matrix (production): rows = expected, columns = predicted

{'factual_rag': {'factual_rag': 7, 'structured_lookup': 1}, 'structured_lookup': {'structured_lookup': 8}, 'document_compare': {'document_compare': 8}, 'discrepancy_analysis': {'discrepancy_analysis': 7, 'factual_rag': 1}, 'summarization': {'summarization': 7, 'factual_rag': 1}}
