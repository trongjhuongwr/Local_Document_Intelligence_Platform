import React, { useState, useEffect } from 'react';
import { BarChart3, Database, Cpu, CheckCircle2, TrendingUp, Compass, Award } from 'lucide-react';

export function EvaluationView() {
  const [evalData, setEvalData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'extraction' | 'retrieval' | 'routing' | 'discrepancy' | 'qa' | 'workflow'>('retrieval');

  useEffect(() => {
    fetch('/api/evals')
      .then(res => res.json())
      .then(d => setEvalData(d.results))
      .catch(console.error);
  }, []);

  if (!evalData) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-6 text-center text-xs text-neutral-500">
        Loading DocFlowBench evaluation report...
      </div>
    );
  }

  const tabs = [
    { id: 'retrieval', label: 'Retrieval Benchmark' },
    { id: 'extraction', label: 'Field Extraction' },
    { id: 'routing', label: 'Query Routing' },
    { id: 'discrepancy', label: 'Discrepancy Detection' },
    { id: 'qa', label: 'Grounded Q&A' },
    { id: 'workflow', label: 'E2E Workflow' },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          DocFlowBench v1.0.1
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Evaluation & Benchmark Suite</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Empirical evaluation results across synthetic audit cases, multi-document extraction, and deterministic rules.
        </p>
      </div>

      {/* Recruiter / Benchmark Overview Banner */}
      <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
          <Award className="w-4 h-4 text-amber-600" />
          <span>Evaluation Methodology</span>
        </div>
        <p className="text-xs text-neutral-600 leading-relaxed">
          The benchmark is generated deterministically with seeded pseudorandom case builder <code className="font-mono bg-neutral-100 px-1 py-0.5 rounded">DocFlowBench</code>. Every case injects multi-document ground-truth anomalies (arithmetic slips, date boundaries, PO overruns, currency mismatch) to test end-to-end audit pipelines without proprietary data leakages.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-200 gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Retrieval */}
      {activeTab === 'retrieval' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
            <strong>Key Finding:</strong> {evalData.retrieval?.headline}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-700">
              Retrieval Mode Comparison Table
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/50 text-neutral-500 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="p-3">Mode</th>
                  <th className="p-3">Recall@1</th>
                  <th className="p-3">Recall@3</th>
                  <th className="p-3">Recall@5</th>
                  <th className="p-3">MRR</th>
                  <th className="p-3">Mean Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-mono">
                <tr className="bg-emerald-50/30">
                  <td className="p-3 font-bold text-emerald-800 font-sans">BM25 (Default)</td>
                  <td className="p-3">{(evalData.retrieval.modes.bm25.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3">{(evalData.retrieval.modes.bm25.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3 font-bold text-emerald-700">{(evalData.retrieval.modes.bm25.recall_at_5 * 100).toFixed(1)}%</td>
                  <td className="p-3 font-bold">{evalData.retrieval.modes.bm25.mrr.toFixed(3)}</td>
                  <td className="p-3 text-emerald-700">{evalData.retrieval.modes.bm25.mean_latency_ms.toFixed(1)} ms</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans">Dense Vector</td>
                  <td className="p-3">{(evalData.retrieval.modes.dense.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3">{(evalData.retrieval.modes.dense.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3">{(evalData.retrieval.modes.dense.recall_at_5 * 100).toFixed(1)}%</td>
                  <td className="p-3">{evalData.retrieval.modes.dense.mrr.toFixed(3)}</td>
                  <td className="p-3">{evalData.retrieval.modes.dense.mean_latency_ms.toFixed(1)} ms</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans">Hybrid Fusion</td>
                  <td className="p-3">{(evalData.retrieval.modes.hybrid.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3">{(evalData.retrieval.modes.hybrid.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3">{(evalData.retrieval.modes.hybrid.recall_at_5 * 100).toFixed(1)}%</td>
                  <td className="p-3">{evalData.retrieval.modes.hybrid.mrr.toFixed(3)}</td>
                  <td className="p-3">{evalData.retrieval.modes.hybrid.mean_latency_ms.toFixed(1)} ms</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Extraction */}
      {activeTab === 'extraction' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Field Accuracy</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {(evalData.extraction.overall_field_accuracy * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Schema Valid Rate</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {(evalData.extraction.overall_schema_valid_rate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Median Latency</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {evalData.extraction.median_llm_latency_ms.toFixed(0)} ms
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">P95 Latency</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {evalData.extraction.p95_llm_latency_ms.toFixed(0)} ms
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-700">
              Accuracy by Document Type
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/50 text-neutral-500 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="p-3">Document Type</th>
                  <th className="p-3">Evaluated Count</th>
                  <th className="p-3">Schema Valid</th>
                  <th className="p-3">Overall Field Accuracy</th>
                  <th className="p-3">Numeric Accuracy</th>
                  <th className="p-3">Date Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-mono">
                {Object.entries(evalData.extraction.by_document_type).map(([dtype, stats]: [string, any]) => (
                  <tr key={dtype}>
                    <td className="p-3 font-sans font-bold capitalize">{dtype.replace('_', ' ')}</td>
                    <td className="p-3">{stats.documents}</td>
                    <td className="p-3 text-emerald-700">{(stats.schema_valid_rate * 100).toFixed(0)}%</td>
                    <td className="p-3 font-bold">{(stats.overall_field_accuracy * 100).toFixed(1)}%</td>
                    <td className="p-3">{(stats.numeric_accuracy * 100).toFixed(1)}%</td>
                    <td className="p-3">{(stats.date_accuracy * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Routing */}
      {activeTab === 'routing' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-neutral-100 border border-neutral-200 text-xs text-neutral-800 font-medium">
            <strong>Headline:</strong> {evalData.routing?.headline}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-2">
              <span className="text-xs font-bold text-neutral-500 uppercase">Production Router (Hybrid)</span>
              <div className="text-2xl font-bold text-emerald-600 font-mono">
                {(evalData.routing.production_router.accuracy * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-neutral-500">Macro F1: {evalData.routing.production_router.macro_f1.toFixed(4)}</div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-2">
              <span className="text-xs font-bold text-neutral-500 uppercase">Deterministic Keyword</span>
              <div className="text-2xl font-bold text-neutral-900 font-mono">
                {(evalData.routing.keyword_only.accuracy * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-neutral-500">Macro F1: {evalData.routing.keyword_only.macro_f1.toFixed(4)}</div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-2">
              <span className="text-xs font-bold text-neutral-500 uppercase">LLM-Only Router</span>
              <div className="text-2xl font-bold text-amber-600 font-mono">
                {(evalData.routing.llm_only.accuracy * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-neutral-500">Macro F1: {evalData.routing.llm_only.macro_f1.toFixed(4)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Discrepancy */}
      {activeTab === 'discrepancy' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3">
              <h3 className="text-sm font-bold text-neutral-900">Deterministic Rules Evaluation</h3>
              <p className="text-xs text-neutral-500">
                Evaluation of the arithmetic & cross-document rule engine on perfect extracted ground-truth.
              </p>
              <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                <div className="p-3 bg-neutral-50 rounded">
                  <div className="text-[10px] text-neutral-400">Precision</div>
                  <div className="text-lg font-bold text-emerald-600">{(evalData.discrepancy_rules.overall.precision * 100).toFixed(0)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 rounded">
                  <div className="text-[10px] text-neutral-400">Recall</div>
                  <div className="text-lg font-bold text-emerald-600">{(evalData.discrepancy_rules.overall.recall * 100).toFixed(0)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 rounded">
                  <div className="text-[10px] text-neutral-400">F1 Score</div>
                  <div className="text-lg font-bold text-emerald-600">{evalData.discrepancy_rules.overall.f1.toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3">
              <h3 className="text-sm font-bold text-neutral-900">End-to-End Pipeline Evaluation</h3>
              <p className="text-xs text-neutral-500">
                Evaluation of LLM extraction + deterministic engine running against raw PDFs.
              </p>
              <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                <div className="p-3 bg-neutral-50 rounded">
                  <div className="text-[10px] text-neutral-400">Precision</div>
                  <div className="text-lg font-bold text-neutral-900">{(evalData.discrepancy_end_to_end.overall.precision * 100).toFixed(1)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 rounded">
                  <div className="text-[10px] text-neutral-400">Recall</div>
                  <div className="text-lg font-bold text-emerald-600">{(evalData.discrepancy_end_to_end.overall.recall * 100).toFixed(1)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 rounded">
                  <div className="text-[10px] text-neutral-400">F1 Score</div>
                  <div className="text-lg font-bold text-neutral-900">{evalData.discrepancy_end_to_end.overall.f1.toFixed(3)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Grounded Q&A */}
      {activeTab === 'qa' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Query Completion</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {(evalData.generation.query_completion_rate * 100).toFixed(0)}%
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Citation Presence</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {(evalData.generation.citation_presence_rate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Valid Citations</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {(evalData.generation.valid_citation_rate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Median Latency</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {evalData.generation.median_latency_ms.toFixed(0)} ms
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Workflow */}
      {activeTab === 'workflow' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Completion Rate</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {(evalData.workflow.completion_rate * 100).toFixed(0)}%
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Audit Consistency</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {(evalData.workflow.review_task_creation_consistency * 100).toFixed(0)}%
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Extraction Failures</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {evalData.workflow.extraction_failure_count}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500">Median Duration</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {(evalData.workflow.median_duration_ms / 1000).toFixed(1)} s
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
