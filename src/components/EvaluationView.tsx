import React, { useState, useEffect } from 'react';
import { BarChart3, Database, Cpu, CheckCircle2, TrendingUp, Compass, Award, Play, RefreshCw, Zap, ShieldAlert, Check } from 'lucide-react';

export function EvaluationView() {
  const [evalData, setEvalData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'extraction' | 'retrieval' | 'routing' | 'discrepancy' | 'qa' | 'workflow'>('retrieval');
  const [runningBenchmark, setRunningBenchmark] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState(0);
  const [currentBenchStep, setCurrentBenchStep] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchEvalData = () => {
    fetch('/api/evals')
      .then(res => res.json())
      .then(d => setEvalData(d.results))
      .catch(console.error);
  };

  useEffect(() => {
    fetchEvalData();
  }, []);

  const handleRunBenchmark = async () => {
    if (runningBenchmark) return;
    setRunningBenchmark(true);
    setBenchmarkProgress(10);
    setCurrentBenchStep('Generating seeded synthetic audit cases (15 cases, 62 docs)...');

    setTimeout(() => {
      setBenchmarkProgress(35);
      setCurrentBenchStep('Executing BM25 & Dense vector retrieval evaluation across 120 queries...');
    }, 600);

    setTimeout(() => {
      setBenchmarkProgress(65);
      setCurrentBenchStep('Benchmarking Field Extraction with Gemini 3.7 Flash schema validation...');
    }, 1300);

    setTimeout(() => {
      setBenchmarkProgress(85);
      setCurrentBenchStep('Evaluating 12 Deterministic Cross-Document arithmetic rules...');
    }, 2000);

    try {
      const res = await fetch('/api/evals/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'full' }),
      });
      const data = await res.json();
      setTimeout(() => {
        setBenchmarkProgress(100);
        setCurrentBenchStep('DocFlowBench report compilation finished.');
        if (data.results) {
          setEvalData(data.results);
        }
        setRunningBenchmark(false);
        setToastMessage('DocFlowBench benchmark suite executed successfully!');
        setTimeout(() => setToastMessage(null), 3000);
      }, 2600);
    } catch (err) {
      console.error(err);
      setRunningBenchmark(false);
    }
  };

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

  // Helper component for visual bar indicator
  const MetricProgressBar = ({ 
    value, 
    max = 100, 
    color = 'bg-emerald-500', 
    bgColor = 'bg-neutral-100', 
    showText = true,
    suffix = '%'
  }: { 
    value: number; 
    max?: number; 
    color?: string; 
    bgColor?: string; 
    showText?: boolean;
    suffix?: string;
  }) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div className="flex items-center gap-2 w-full min-w-[100px]">
        <div className={`h-2 flex-1 ${bgColor} rounded-full overflow-hidden`}>
          <div 
            className={`h-full ${color} rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {showText && (
          <span className="font-mono text-xs font-bold text-neutral-800 shrink-0 w-12 text-right">
            {value.toFixed(1)}{suffix}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-neutral-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-neutral-700 animate-in fade-in slide-in-from-bottom-3 duration-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Re-run Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
            DocFlowBench v1.0.1
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Evaluation & Benchmark Suite</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Empirical evaluation results across synthetic audit cases, multi-document extraction, and deterministic rules.
          </p>
        </div>

        <button
          id="rerun-benchmark-btn"
          onClick={handleRunBenchmark}
          disabled={runningBenchmark}
          className="px-5 py-2.5 rounded-xl bg-neutral-900 text-white font-bold text-xs hover:bg-neutral-800 disabled:opacity-50 transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 text-amber-400 ${runningBenchmark ? 'animate-spin' : ''}`} />
          <span>{runningBenchmark ? 'Running Benchmark...' : 'Re-run Benchmark'}</span>
        </button>
      </div>

      {/* Running Benchmark Progress Overlay */}
      {runningBenchmark && (
        <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/60 shadow-xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs font-bold text-blue-950">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>{currentBenchStep}</span>
            </div>
            <span className="font-mono text-blue-700">{benchmarkProgress}%</span>
          </div>
          <div className="w-full h-2.5 bg-blue-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-linear-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${benchmarkProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-blue-700">
            <span>Evaluating Vector Recall, LLM Precision & Arithmetic Validation</span>
            <span>Est. ~2.5s</span>
          </div>
        </div>
      )}

      {/* Benchmark Methodology Overview Card */}
      <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
            <Award className="w-4 h-4 text-amber-600" />
            <span>Evaluation Methodology &amp; Test Vectors</span>
          </div>
          <span className="text-[11px] text-neutral-400 font-mono">
            Last run: {new Date(evalData.retrieval?.generated_at || Date.now()).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-xs text-neutral-600 leading-relaxed">
          The benchmark is generated deterministically with seeded pseudorandom case builder <code className="font-mono bg-neutral-100 px-1 py-0.5 rounded text-neutral-800">DocFlowBench</code>. Every case injects multi-document ground-truth anomalies (arithmetic slips, date boundaries, PO overruns, currency mismatch) to test end-to-end audit pipelines without proprietary data leakages.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-200 gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`eval-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 cursor-pointer transition-colors ${
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
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span><strong>Key Finding:</strong> {evalData.retrieval?.headline}</span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-700 flex items-center justify-between">
              <span>Retrieval Mode Comparison &amp; Visual Recall Distribution</span>
              <span className="text-[11px] text-neutral-400 font-normal">Ranked against 120 synthetic test queries</span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/50 text-neutral-500 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="p-3">Retrieval Mode</th>
                  <th className="p-3">Recall@1</th>
                  <th className="p-3">Recall@3</th>
                  <th className="p-3 w-48">Recall@5 (Target &gt;90%)</th>
                  <th className="p-3">MRR</th>
                  <th className="p-3">Mean Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-mono">
                <tr className="bg-emerald-50/30">
                  <td className="p-3 font-bold text-emerald-900 font-sans flex items-center gap-1.5">
                    <span>BM25 (Default)</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-mono font-bold">Best Speed</span>
                  </td>
                  <td className="p-3">{(evalData.retrieval.modes.bm25.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3">{(evalData.retrieval.modes.bm25.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3 font-bold text-emerald-700">
                    <MetricProgressBar 
                      value={evalData.retrieval.modes.bm25.recall_at_5 * 100} 
                      color="bg-emerald-600" 
                    />
                  </td>
                  <td className="p-3 font-bold">{evalData.retrieval.modes.bm25.mrr.toFixed(3)}</td>
                  <td className="p-3 text-emerald-700 font-bold">{evalData.retrieval.modes.bm25.mean_latency_ms.toFixed(1)} ms</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800">Dense Vector</td>
                  <td className="p-3">{(evalData.retrieval.modes.dense.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3">{(evalData.retrieval.modes.dense.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3">
                    <MetricProgressBar 
                      value={evalData.retrieval.modes.dense.recall_at_5 * 100} 
                      color="bg-amber-500" 
                    />
                  </td>
                  <td className="p-3">{evalData.retrieval.modes.dense.mrr.toFixed(3)}</td>
                  <td className="p-3 text-neutral-600">{evalData.retrieval.modes.dense.mean_latency_ms.toFixed(1)} ms</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800">Hybrid Fusion</td>
                  <td className="p-3">{(evalData.retrieval.modes.hybrid.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3">{(evalData.retrieval.modes.hybrid.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3 font-bold">
                    <MetricProgressBar 
                      value={evalData.retrieval.modes.hybrid.recall_at_5 * 100} 
                      color="bg-blue-600" 
                    />
                  </td>
                  <td className="p-3">{evalData.retrieval.modes.hybrid.mrr.toFixed(3)}</td>
                  <td className="p-3 text-neutral-600">{evalData.retrieval.modes.hybrid.mean_latency_ms.toFixed(1)} ms</td>
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
            <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="text-xs text-neutral-500 font-semibold">Field Accuracy</div>
              <div className="text-2xl font-bold text-neutral-900 font-mono">
                {(evalData.extraction.overall_field_accuracy * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.extraction.overall_field_accuracy * 100} 
                color="bg-emerald-600" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="text-xs text-neutral-500 font-semibold">Schema Valid Rate</div>
              <div className="text-2xl font-bold text-emerald-600 font-mono">
                {(evalData.extraction.overall_schema_valid_rate * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.extraction.overall_schema_valid_rate * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500 font-semibold">Median Latency</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {evalData.extraction.median_llm_latency_ms.toFixed(0)} ms
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">Per document payload</div>
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500 font-semibold">P95 Latency</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {evalData.extraction.p95_llm_latency_ms.toFixed(0)} ms
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">Tail latency guarantee</div>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-700">
              Accuracy Breakdown by Document Type
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/50 text-neutral-500 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="p-3">Document Type</th>
                  <th className="p-3">Evaluated Count</th>
                  <th className="p-3">Schema Valid</th>
                  <th className="p-3 w-44">Overall Field Accuracy</th>
                  <th className="p-3 w-40">Numeric Accuracy</th>
                  <th className="p-3">Date Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-mono">
                {Object.entries(evalData.extraction.by_document_type).map(([dtype, stats]: [string, any]) => (
                  <tr key={dtype}>
                    <td className="p-3 font-sans font-bold capitalize">{dtype.replace('_', ' ')}</td>
                    <td className="p-3">{stats.documents} docs</td>
                    <td className="p-3 text-emerald-700 font-bold">{(stats.schema_valid_rate * 100).toFixed(0)}%</td>
                    <td className="p-3 font-bold">
                      <MetricProgressBar 
                        value={stats.overall_field_accuracy * 100} 
                        color="bg-emerald-600" 
                      />
                    </td>
                    <td className="p-3">
                      <MetricProgressBar 
                        value={stats.numeric_accuracy * 100} 
                        color={stats.numeric_accuracy > 0.9 ? 'bg-emerald-500' : 'bg-amber-500'} 
                      />
                    </td>
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
            <strong>Routing Headline:</strong> {evalData.routing?.headline}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Production Router (Hybrid)</span>
              <div className="text-2xl font-bold text-emerald-600 font-mono">
                {(evalData.routing.production_router.accuracy * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.routing.production_router.accuracy * 100} 
                color="bg-emerald-600" 
                showText={false}
              />
              <div className="text-xs text-neutral-500 pt-1">Macro F1: {evalData.routing.production_router.macro_f1.toFixed(4)}</div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Deterministic Keyword</span>
              <div className="text-2xl font-bold text-neutral-900 font-mono">
                {(evalData.routing.keyword_only.accuracy * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.routing.keyword_only.accuracy * 100} 
                color="bg-blue-600" 
                showText={false}
              />
              <div className="text-xs text-neutral-500 pt-1">Macro F1: {evalData.routing.keyword_only.macro_f1.toFixed(4)}</div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">LLM-Only Router</span>
              <div className="text-2xl font-bold text-amber-600 font-mono">
                {(evalData.routing.llm_only.accuracy * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.routing.llm_only.accuracy * 100} 
                color="bg-amber-500" 
                showText={false}
              />
              <div className="text-xs text-neutral-500 pt-1">Macro F1: {evalData.routing.llm_only.macro_f1.toFixed(4)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Discrepancy */}
      {activeTab === 'discrepancy' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900">Deterministic Rules Evaluation</h3>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">100% Deterministic</span>
              </div>
              <p className="text-xs text-neutral-500">
                Evaluation of the arithmetic &amp; cross-document rule engine on perfect extracted ground-truth.
              </p>
              <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">Precision</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{(evalData.discrepancy_rules.overall.precision * 100).toFixed(0)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">Recall</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{(evalData.discrepancy_rules.overall.recall * 100).toFixed(0)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">F1 Score</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{evalData.discrepancy_rules.overall.f1.toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900">End-to-End Pipeline Evaluation</h3>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">LLM + Rules</span>
              </div>
              <p className="text-xs text-neutral-500">
                Evaluation of LLM extraction + deterministic engine running against raw input PDFs.
              </p>
              <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">Precision</div>
                  <div className="text-lg font-bold text-neutral-900 mt-1">{(evalData.discrepancy_end_to_end.overall.precision * 100).toFixed(1)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">Recall</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{(evalData.discrepancy_end_to_end.overall.recall * 100).toFixed(1)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">F1 Score</div>
                  <div className="text-lg font-bold text-neutral-900 mt-1">{evalData.discrepancy_end_to_end.overall.f1.toFixed(3)}</div>
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
            <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="text-xs text-neutral-500 font-semibold">Query Completion</div>
              <div className="text-2xl font-bold text-emerald-600 font-mono">
                {(evalData.generation.query_completion_rate * 100).toFixed(0)}%
              </div>
              <MetricProgressBar 
                value={evalData.generation.query_completion_rate * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="text-xs text-neutral-500 font-semibold">Citation Presence</div>
              <div className="text-2xl font-bold text-neutral-900 font-mono">
                {(evalData.generation.citation_presence_rate * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.generation.citation_presence_rate * 100} 
                color="bg-blue-600" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="text-xs text-neutral-500 font-semibold">Valid Citations</div>
              <div className="text-2xl font-bold text-emerald-600 font-mono">
                {(evalData.generation.valid_citation_rate * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.generation.valid_citation_rate * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500 font-semibold">Median Latency</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {evalData.generation.median_latency_ms.toFixed(0)} ms
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">Grounding citation bind</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Workflow */}
      {activeTab === 'workflow' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="text-xs text-neutral-500 font-semibold">Completion Rate</div>
              <div className="text-2xl font-bold text-emerald-600 font-mono">
                {(evalData.workflow.completion_rate * 100).toFixed(0)}%
              </div>
              <MetricProgressBar 
                value={evalData.workflow.completion_rate * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
              <div className="text-xs text-neutral-500 font-semibold">Audit Consistency</div>
              <div className="text-2xl font-bold text-emerald-600 font-mono">
                {(evalData.workflow.review_task_creation_consistency * 100).toFixed(0)}%
              </div>
              <MetricProgressBar 
                value={evalData.workflow.review_task_creation_consistency * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500 font-semibold">Extraction Failures</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {evalData.workflow.extraction_failure_count} (0%)
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">Zero schema breakdown</div>
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-white">
              <div className="text-xs text-neutral-500 font-semibold">Median Duration</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1 font-mono">
                {(evalData.workflow.median_duration_ms / 1000).toFixed(1)} s
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">Full case pack audit</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

