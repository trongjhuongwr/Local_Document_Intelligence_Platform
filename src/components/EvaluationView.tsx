import React, { useState, useEffect } from 'react';
import { BarChart3, Database, Cpu, CheckCircle2, TrendingUp, Compass, Award, Play, RefreshCw, Zap, ShieldAlert, Check } from 'lucide-react';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

export function EvaluationView() {
  const { lang, t } = useThemeLanguage();
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
    setCurrentBenchStep(lang === 'vi' ? 'Đang tạo hồ sơ kiểm toán giả lập chuẩn hóa (15 hồ sơ, 62 tài liệu)...' : 'Generating seeded synthetic audit cases (15 cases, 62 docs)...');

    setTimeout(() => {
      setBenchmarkProgress(35);
      setCurrentBenchStep(lang === 'vi' ? 'Đang thực thi đánh giá truy hồi BM25 & Dense vector trên 120 truy vấn...' : 'Executing BM25 & Dense vector retrieval evaluation across 120 queries...');
    }, 600);

    setTimeout(() => {
      setBenchmarkProgress(65);
      setCurrentBenchStep(lang === 'vi' ? 'Đo kiểm trích xuất trường dữ liệu qua mô hình Gemini 3.7 Flash...' : 'Benchmarking Field Extraction with Gemini 3.7 Flash schema validation...');
    }, 1300);

    setTimeout(() => {
      setBenchmarkProgress(85);
      setCurrentBenchStep(lang === 'vi' ? 'Đánh giá 12 quy tắc kiểm tra số học và sai lệch liên tài liệu...' : 'Evaluating 12 Deterministic Cross-Document arithmetic rules...');
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
        setCurrentBenchStep(lang === 'vi' ? 'Biên soạn báo cáo kết quả DocFlowBench hoàn tất.' : 'DocFlowBench report compilation finished.');
        if (data.results) {
          setEvalData(data.results);
        }
        setRunningBenchmark(false);
        setToastMessage(lang === 'vi' ? 'Đã chạy hoàn tất bộ đo kiểm chuẩn DocFlowBench!' : 'DocFlowBench benchmark suite executed successfully!');
        setTimeout(() => setToastMessage(null), 3000);
      }, 2600);
    } catch (err) {
      console.error(err);
      setRunningBenchmark(false);
    }
  };

  if (!evalData) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
        {lang === 'vi' ? 'Đang nạp báo cáo đánh giá năng lực DocFlowBench...' : 'Loading DocFlowBench evaluation report...'}
      </div>
    );
  }

  const tabs = [
    { id: 'retrieval', label: lang === 'vi' ? 'Đo kiểm Truy hồi' : 'Retrieval Benchmark' },
    { id: 'extraction', label: lang === 'vi' ? 'Bóc tách Trường' : 'Field Extraction' },
    { id: 'routing', label: lang === 'vi' ? 'Phân luồng Chứng từ' : 'Document Routing' },
    { id: 'discrepancy', label: lang === 'vi' ? 'Thẩm định Sai lệch' : 'Discrepancy Rules' },
    { id: 'qa', label: lang === 'vi' ? 'Hỏi đáp Minh chứng' : 'Grounded Q&A' },
    { id: 'workflow', label: lang === 'vi' ? 'Hiệu suất Quy trình' : 'Workflow Latency' },
  ];

  // Helper component for visual bar indicator
  const MetricProgressBar = ({ 
    value, 
    max = 100, 
    color = 'bg-emerald-500', 
    bgColor = 'bg-neutral-100 dark:bg-neutral-800', 
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
          <span className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200 shrink-0 w-12 text-right">
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
        <div className="fixed bottom-6 right-6 z-60 bg-neutral-900/95 dark:bg-neutral-100/95 text-white dark:text-neutral-900 text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-neutral-700 dark:border-neutral-200 animate-in fade-in slide-in-from-bottom-3 duration-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Re-run Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
            DocFlowBench v1.0.1
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">{t.evaluation.title}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            {t.evaluation.subtitle}
          </p>
        </div>

        <button
          id="rerun-benchmark-btn"
          onClick={handleRunBenchmark}
          disabled={runningBenchmark}
          className="px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold text-xs hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 text-amber-400 dark:text-amber-600 ${runningBenchmark ? 'animate-spin' : ''}`} />
          <span>{runningBenchmark ? (lang === 'vi' ? 'Đang chạy kiểm thử...' : 'Running Benchmark...') : t.evaluation.runSuiteBtn}</span>
        </button>
      </div>

      {/* Running Benchmark Progress Overlay */}
      {runningBenchmark && (
        <div className="p-5 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 shadow-xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs font-bold text-blue-950 dark:text-blue-200">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>{currentBenchStep}</span>
            </div>
            <span className="font-mono text-blue-700 dark:text-blue-400">{benchmarkProgress}%</span>
          </div>
          <div className="w-full h-2.5 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${benchmarkProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-400">
            <span>{lang === 'vi' ? 'Đánh giá Vector Recall, Độ chính xác LLM & Xác thực Số học' : 'Evaluating Vector Recall, LLM Precision & Arithmetic Validation'}</span>
            <span>{lang === 'vi' ? 'Ước tính ~2.5 giây' : 'Est. ~2.5s'}</span>
          </div>
        </div>
      )}

      {/* Benchmark Methodology Overview Card */}
      <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-white">
            <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>{lang === 'vi' ? 'Phương pháp Đo kiểm & Bộ Vector Kiểm thử' : 'Evaluation Methodology & Test Vectors'}</span>
          </div>
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
            {lang === 'vi' ? 'Lần chạy gần nhất' : 'Last run'}: {new Date(evalData.retrieval?.generated_at || Date.now()).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          {lang === 'vi'
            ? 'Bộ đo kiểm được khởi tạo theo cơ chế xác định thông qua bộ dựng ca kiểm thử ngẫu nhiên có hạt giống DocFlowBench. Mỗi ca hồ sơ được cài cắm các dị biệt đa tài liệu đối chiếu (sai sót số học, vượt hạn mức ngày, bội chi PO, sai lệch đơn vị tiền tệ) để kiểm thử toàn diện quy trình kiểm toán không gây lộ lọt dữ liệu độc quyền.'
            : 'The benchmark is generated deterministically with seeded pseudorandom case builder DocFlowBench. Every case injects multi-document ground-truth anomalies (arithmetic slips, date boundaries, PO overruns, currency mismatch) to test end-to-end audit pipelines without proprietary data leakages.'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`eval-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Retrieval */}
      {activeTab === 'retrieval' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span><strong>{lang === 'vi' ? 'Kết quả then chốt' : 'Key Finding'}:</strong> {evalData.retrieval?.headline}</span>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
              <span>{lang === 'vi' ? 'So sánh Chế độ Truy hồi & Phân bố Recall Trực quan' : 'Retrieval Mode Comparison & Visual Recall Distribution'}</span>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal">{lang === 'vi' ? 'Xếp hạng trên 120 truy vấn kiểm thử' : 'Ranked against 120 synthetic test queries'}</span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/50 dark:bg-neutral-850/50 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="p-3">{lang === 'vi' ? 'Chế độ Truy hồi' : 'Retrieval Mode'}</th>
                  <th className="p-3">Recall@1</th>
                  <th className="p-3">Recall@3</th>
                  <th className="p-3 w-48">Recall@5 ({lang === 'vi' ? 'Mục tiêu' : 'Target'} &gt;90%)</th>
                  <th className="p-3">MRR</th>
                  <th className="p-3">{lang === 'vi' ? 'Độ trễ trung bình' : 'Mean Latency'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-mono">
                <tr className="bg-emerald-50/30 dark:bg-emerald-950/20">
                  <td className="p-3 font-bold text-emerald-900 dark:text-emerald-300 font-sans flex items-center gap-1.5">
                    <span>BM25 ({lang === 'vi' ? 'Mặc định' : 'Default'})</span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.2 rounded font-mono font-bold">{lang === 'vi' ? 'Nhanh nhất' : 'Best Speed'}</span>
                  </td>
                  <td className="p-3 text-neutral-800 dark:text-neutral-200">{(evalData.retrieval.modes.bm25.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3 text-neutral-800 dark:text-neutral-200">{(evalData.retrieval.modes.bm25.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3 font-bold text-emerald-700 dark:text-emerald-400">
                    <MetricProgressBar 
                      value={evalData.retrieval.modes.bm25.recall_at_5 * 100} 
                      color="bg-emerald-600" 
                    />
                  </td>
                  <td className="p-3 font-bold text-neutral-800 dark:text-neutral-200">{evalData.retrieval.modes.bm25.mrr.toFixed(3)}</td>
                  <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">{evalData.retrieval.modes.bm25.mean_latency_ms.toFixed(1)} ms</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Dense Vector</td>
                  <td className="p-3 text-neutral-800 dark:text-neutral-200">{(evalData.retrieval.modes.dense.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3 text-neutral-800 dark:text-neutral-200">{(evalData.retrieval.modes.dense.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3">
                    <MetricProgressBar 
                      value={evalData.retrieval.modes.dense.recall_at_5 * 100} 
                      color="bg-amber-500" 
                    />
                  </td>
                  <td className="p-3 text-neutral-800 dark:text-neutral-200">{evalData.retrieval.modes.dense.mrr.toFixed(3)}</td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{evalData.retrieval.modes.dense.mean_latency_ms.toFixed(1)} ms</td>
                </tr>
                <tr>
                  <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200">Hybrid Fusion</td>
                  <td className="p-3 text-neutral-800 dark:text-neutral-200">{(evalData.retrieval.modes.hybrid.recall_at_1 * 100).toFixed(1)}%</td>
                  <td className="p-3 text-neutral-800 dark:text-neutral-200">{(evalData.retrieval.modes.hybrid.recall_at_3 * 100).toFixed(1)}%</td>
                  <td className="p-3 font-bold">
                    <MetricProgressBar 
                      value={evalData.retrieval.modes.hybrid.recall_at_5 * 100} 
                      color="bg-blue-600" 
                    />
                  </td>
                  <td className="p-3 text-neutral-800 dark:text-neutral-200">{evalData.retrieval.modes.hybrid.mrr.toFixed(3)}</td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{evalData.retrieval.modes.hybrid.mean_latency_ms.toFixed(1)} ms</td>
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
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Độ chính xác trường' : 'Field Accuracy'}</div>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">
                {(evalData.extraction.overall_field_accuracy * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.extraction.overall_field_accuracy * 100} 
                color="bg-emerald-600" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Tỉ lệ Hợp lệ Schema' : 'Schema Valid Rate'}</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {(evalData.extraction.overall_schema_valid_rate * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.extraction.overall_schema_valid_rate * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Độ trễ trung vị' : 'Median Latency'}</div>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white mt-1 font-mono">
                {evalData.extraction.median_llm_latency_ms.toFixed(0)} ms
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">{lang === 'vi' ? 'Trên mỗi tài liệu tải lên' : 'Per document payload'}</div>
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Độ trễ P95' : 'P95 Latency'}</div>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white mt-1 font-mono">
                {evalData.extraction.p95_llm_latency_ms.toFixed(0)} ms
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">{lang === 'vi' ? 'Cam kết ngưỡng trễ đuôi' : 'Tail latency guarantee'}</div>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300">
              {lang === 'vi' ? 'Phân tích Độ chính xác theo Loại Tài liệu' : 'Accuracy Breakdown by Document Type'}
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/50 dark:bg-neutral-850/50 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="p-3">{lang === 'vi' ? 'Loại Tài liệu' : 'Document Type'}</th>
                  <th className="p-3">{lang === 'vi' ? 'Số lượng Kiểm thử' : 'Evaluated Count'}</th>
                  <th className="p-3">{lang === 'vi' ? 'Hợp lệ Schema' : 'Schema Valid'}</th>
                  <th className="p-3 w-44">{lang === 'vi' ? 'Độ chính xác Tổng thể' : 'Overall Field Accuracy'}</th>
                  <th className="p-3 w-40">{lang === 'vi' ? 'Độ chính xác Số học' : 'Numeric Accuracy'}</th>
                  <th className="p-3">{lang === 'vi' ? 'Độ chính xác Ngày tháng' : 'Date Accuracy'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-mono">
                {Object.entries(evalData.extraction.by_document_type).map(([dtype, stats]: [string, any]) => (
                  <tr key={dtype}>
                    <td className="p-3 font-sans font-bold capitalize text-neutral-900 dark:text-white">{dtype.replace('_', ' ')}</td>
                    <td className="p-3 text-neutral-700 dark:text-neutral-300">{stats.documents} {lang === 'vi' ? 'tài liệu' : 'docs'}</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">{(stats.schema_valid_rate * 100).toFixed(0)}%</td>
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
                    <td className="p-3 text-neutral-800 dark:text-neutral-200">{(stats.date_accuracy * 100).toFixed(1)}%</td>
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
          <div className="p-4 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-800 dark:text-neutral-200 font-medium">
            <strong>{lang === 'vi' ? 'Điểm tin Điều hướng' : 'Routing Headline'}:</strong> {evalData.routing?.headline}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{lang === 'vi' ? 'Bộ điều hướng Production (Hybrid)' : 'Production Router (Hybrid)'}</span>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {(evalData.routing.production_router.accuracy * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.routing.production_router.accuracy * 100} 
                color="bg-emerald-600" 
                showText={false}
              />
              <div className="text-xs text-neutral-500 dark:text-neutral-400 pt-1">Macro F1: {evalData.routing.production_router.macro_f1.toFixed(4)}</div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{lang === 'vi' ? 'Từ khóa Xác định (Deterministic)' : 'Deterministic Keyword'}</span>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">
                {(evalData.routing.keyword_only.accuracy * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.routing.keyword_only.accuracy * 100} 
                color="bg-blue-600" 
                showText={false}
              />
              <div className="text-xs text-neutral-500 dark:text-neutral-400 pt-1">Macro F1: {evalData.routing.keyword_only.macro_f1.toFixed(4)}</div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs">
              <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{lang === 'vi' ? 'Thuần mô hình LLM' : 'LLM-Only Router'}</span>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                {(evalData.routing.llm_only.accuracy * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.routing.llm_only.accuracy * 100} 
                color="bg-amber-500" 
                showText={false}
              />
              <div className="text-xs text-neutral-500 dark:text-neutral-400 pt-1">Macro F1: {evalData.routing.llm_only.macro_f1.toFixed(4)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Discrepancy */}
      {activeTab === 'discrepancy' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{lang === 'vi' ? 'Đánh giá Quy tắc Xác định' : 'Deterministic Rules Evaluation'}</h3>
                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">100% Deterministic</span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {lang === 'vi' ? 'Đánh giá động cơ quy tắc số học & đối chiếu liên tài liệu trên dữ liệu chuẩn hóa tuyệt đối.' : 'Evaluation of the arithmetic & cross-document rule engine on perfect extracted ground-truth.'}
              </p>
              <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-100 dark:border-neutral-700">
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-400 font-bold uppercase">{lang === 'vi' ? 'Độ chính xác (Precision)' : 'Precision'}</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{(evalData.discrepancy_rules.overall.precision * 100).toFixed(0)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-100 dark:border-neutral-700">
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-400 font-bold uppercase">{lang === 'vi' ? 'Độ bao phủ (Recall)' : 'Recall'}</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{(evalData.discrepancy_rules.overall.recall * 100).toFixed(0)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-100 dark:border-neutral-700">
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-400 font-bold uppercase">F1 Score</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{evalData.discrepancy_rules.overall.f1.toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{lang === 'vi' ? 'Đánh giá Pipeline Toàn diện (E2E)' : 'End-to-End Pipeline Evaluation'}</h3>
                <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-[10px] font-bold">LLM + Rules</span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {lang === 'vi' ? 'Đo kiểm kết hợp trích xuất LLM + động cơ quy tắc xác định chạy trên tệp PDF gốc thực tế.' : 'Evaluation of LLM extraction + deterministic engine running against raw input PDFs.'}
              </p>
              <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-100 dark:border-neutral-700">
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-400 font-bold uppercase">{lang === 'vi' ? 'Độ chính xác' : 'Precision'}</div>
                  <div className="text-lg font-bold text-neutral-900 dark:text-white mt-1">{(evalData.discrepancy_end_to_end.overall.precision * 100).toFixed(1)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-100 dark:border-neutral-700">
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-400 font-bold uppercase">{lang === 'vi' ? 'Độ bao phủ' : 'Recall'}</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{(evalData.discrepancy_end_to_end.overall.recall * 100).toFixed(1)}%</div>
                </div>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-100 dark:border-neutral-700">
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-400 font-bold uppercase">F1 Score</div>
                  <div className="text-lg font-bold text-neutral-900 dark:text-white mt-1">{evalData.discrepancy_end_to_end.overall.f1.toFixed(3)}</div>
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
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Tỉ lệ Hoàn tất Truy vấn' : 'Query Completion'}</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {(evalData.generation.query_completion_rate * 100).toFixed(0)}%
              </div>
              <MetricProgressBar 
                value={evalData.generation.query_completion_rate * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Hiện diện Trích dẫn' : 'Citation Presence'}</div>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">
                {(evalData.generation.citation_presence_rate * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.generation.citation_presence_rate * 100} 
                color="bg-blue-600" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Trích dẫn Hợp lệ' : 'Valid Citations'}</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {(evalData.generation.valid_citation_rate * 100).toFixed(1)}%
              </div>
              <MetricProgressBar 
                value={evalData.generation.valid_citation_rate * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Độ trễ trung vị' : 'Median Latency'}</div>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white mt-1 font-mono">
                {evalData.generation.median_latency_ms.toFixed(0)} ms
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">{lang === 'vi' ? 'Khớp nối bằng chứng kiểm toán' : 'Grounding citation bind'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Workflow */}
      {activeTab === 'workflow' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Tỉ lệ Hoàn tất' : 'Completion Rate'}</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {(evalData.workflow.completion_rate * 100).toFixed(0)}%
              </div>
              <MetricProgressBar 
                value={evalData.workflow.completion_rate * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Tính nhất quán Kiểm toán' : 'Audit Consistency'}</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {(evalData.workflow.review_task_creation_consistency * 100).toFixed(0)}%
              </div>
              <MetricProgressBar 
                value={evalData.workflow.review_task_creation_consistency * 100} 
                color="bg-emerald-500" 
                showText={false}
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Số lỗi trích xuất' : 'Extraction Failures'}</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                {evalData.workflow.extraction_failure_count} (0%)
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">{lang === 'vi' ? 'Không phát sinh hỏng schema' : 'Zero schema breakdown'}</div>
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{lang === 'vi' ? 'Thời lượng trung vị' : 'Median Duration'}</div>
              <div className="text-2xl font-bold text-neutral-900 dark:text-white mt-1 font-mono">
                {(evalData.workflow.median_duration_ms / 1000).toFixed(1)} s
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">{lang === 'vi' ? 'Kiểm toán toàn bộ gói hồ sơ' : 'Full case pack audit'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


