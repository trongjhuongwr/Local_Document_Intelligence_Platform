import React, { useState, useEffect } from 'react';
import { Award, CheckCircle2, RefreshCw, Zap, Check, AlertTriangle, FlaskConical } from 'lucide-react';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import {
  EvalReport,
  EvalResults,
  EvalRunAccepted,
  EvalRunStatus,
  RetrievalMode,
} from '../types';
import { apiGet, apiPost, errorMessage, isNotImplemented, poll } from '../api';

type TabId = 'retrieval' | 'extraction' | 'routing' | 'discrepancy' | 'qa' | 'workflow';

/**
 * Evaluation dashboard.
 *
 * Everything rendered here comes from GET /api/evals, which serves the real
 * generated reports under evals/reports/. Sections the backend has not
 * produced are rendered as "not yet generated" - this view never falls back
 * to placeholder metrics.
 */
export function EvaluationView() {
  const { lang, t } = useThemeLanguage();
  const [report, setReport] = useState<EvalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('retrieval');
  const [runningBenchmark, setRunningBenchmark] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runElapsedMs, setRunElapsedMs] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const evalData: EvalResults = report?.results ?? {};

  const fetchEvalData = () => {
    setLoading(true);
    setLoadError(null);
    apiGet<EvalReport>('/api/evals')
      .then(data => setReport(data))
      .catch(err => {
        setReport(null);
        setLoadError(isNotImplemented(err) ? t.common.endpointMissing : errorMessage(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEvalData();
  }, []);

  /**
   * POST /api/evals/run answers 202 with a run id and no metrics. Poll the run
   * until it finishes, then refetch /api/evals for the freshly written report.
   */
  const handleRunBenchmark = async () => {
    if (runningBenchmark) return;
    setRunningBenchmark(true);
    setRunError(null);
    setRunStatus('queued');
    setRunElapsedMs(0);
    const startedAt = Date.now();
    const ticker = setInterval(() => setRunElapsedMs(Date.now() - startedAt), 250);

    try {
      const accepted = await apiPost<EvalRunAccepted>('/api/evals/run', { mode: 'full' });
      const final = await poll<EvalRunStatus>(
        `/api/evals/runs/${accepted.run_id}`,
        run => run.status === 'completed' || run.status === 'failed',
        run => setRunStatus(run.status),
        { intervalMs: 2000 }
      );

      if (final.status === 'failed') {
        // Show the suite's own stderr rather than a generic failure line.
        setRunError(
          [(final.errors || []).join('; '), final.stderr_tail]
            .filter(Boolean)
            .join('\n') || 'Evaluation run failed.'
        );
      } else {
        setToastMessage(
          lang === 'vi' ? 'Đã chạy xong bộ đo kiểm.' : 'Benchmark suite finished.'
        );
        setTimeout(() => setToastMessage(null), 3000);
      }
      fetchEvalData();
    } catch (err) {
      setRunError(isNotImplemented(err) ? t.common.endpointMissing : errorMessage(err));
    } finally {
      clearInterval(ticker);
      setRunningBenchmark(false);
      setRunStatus(null);
    }
  };

  const tabs: Array<{ id: TabId; label: string; present: boolean }> = [
    {
      id: 'retrieval',
      label: lang === 'vi' ? 'Đo kiểm Truy hồi' : 'Retrieval Benchmark',
      present: !!evalData.retrieval,
    },
    {
      id: 'extraction',
      label: lang === 'vi' ? 'Bóc tách Trường' : 'Field Extraction',
      present: !!evalData.extraction,
    },
    {
      id: 'routing',
      label: lang === 'vi' ? 'Phân luồng Chứng từ' : 'Document Routing',
      present: !!evalData.routing,
    },
    {
      id: 'discrepancy',
      label: lang === 'vi' ? 'Thẩm định Sai lệch' : 'Discrepancy Rules',
      present: !!(evalData.discrepancy_rules || evalData.discrepancy_end_to_end),
    },
    {
      id: 'qa',
      label: lang === 'vi' ? 'Hỏi đáp Minh chứng' : 'Grounded Q&A',
      present: !!evalData.generation,
    },
    {
      id: 'workflow',
      label: lang === 'vi' ? 'Hiệu suất Quy trình' : 'Workflow Latency',
      present: !!evalData.workflow,
    },
  ];

  const pct = (value: number | undefined, digits = 1) =>
    typeof value === 'number' ? `${(value * 100).toFixed(digits)}%` : '—';
  const num = (value: number | null | undefined, digits = 0, suffix = '') =>
    typeof value === 'number' ? `${value.toFixed(digits)}${suffix}` : '—';

  const MetricProgressBar = ({
    value,
    color = 'bg-emerald-500',
    showText = true,
  }: {
    value: number | undefined;
    color?: string;
    showText?: boolean;
  }) => {
    if (typeof value !== 'number') {
      return <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>;
    }
    const width = Math.min(100, Math.max(0, value * 100));
    return (
      <div className="flex items-center gap-2 w-full min-w-[100px]">
        <div className="h-2 flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${width}%` }} />
        </div>
        {showText && (
          <span className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200 shrink-0 w-12 text-right">
            {width.toFixed(1)}%
          </span>
        )}
      </div>
    );
  };

  /** Placeholder shown for any report section the backend has not produced. */
  const NotGenerated = ({ section }: { section: string }) => (
    <div className="p-8 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-center space-y-2">
      <FlaskConical className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto" />
      <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{t.common.notGenerated}</h3>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {lang === 'vi'
          ? `Máy chủ chưa có báo cáo cho phần "${section}".`
          : `The backend has no report for the "${section}" section yet.`}
      </p>
      {[...(report?.skipped || []), ...(report?.consolidated_skipped || [])]
        .filter(item => item.toLowerCase().startsWith(section.toLowerCase()))
        .map(item => (
          <p key={item} className="text-[11px] font-mono text-amber-700 dark:text-amber-400">
            {item}
          </p>
        ))}
    </div>
  );

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
        {t.common.loading}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <div className="p-8 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold text-rose-800 dark:text-rose-300">{t.common.loadFailed}</h3>
          <p className="text-xs text-rose-700 dark:text-rose-400 break-words">{loadError}</p>
          <button
            onClick={fetchEvalData}
            className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold cursor-pointer"
          >
            {t.common.retry}
          </button>
        </div>
      </div>
    );
  }

  const generatedTimestamps = Object.entries(report?.source_generated_at || {}).filter(
    ([, value]) => !!value
  );
  const newestTimestamp = generatedTimestamps
    .map(([, value]) => value as string)
    .sort()
    .at(-1);

  const skippedItems = Array.from(
    new Set([...(report?.skipped || []), ...(report?.consolidated_skipped || [])])
  );

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-neutral-900/95 dark:bg-neutral-100/95 text-white dark:text-neutral-900 text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-neutral-700 dark:border-neutral-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & re-run action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
            DocFlowBench
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">{t.evaluation.title}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{t.evaluation.subtitle}</p>
        </div>

        <button
          id="rerun-benchmark-btn"
          onClick={handleRunBenchmark}
          disabled={runningBenchmark}
          className="px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold text-xs hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 text-amber-400 dark:text-amber-600 ${runningBenchmark ? 'animate-spin' : ''}`} />
          <span>
            {runningBenchmark
              ? lang === 'vi'
                ? 'Đang chạy kiểm thử...'
                : 'Running benchmark...'
              : t.evaluation.runSuiteBtn}
          </span>
        </button>
      </div>

      {/* Real run progress: status from the backend + a wall-clock timer.
          The suite has no reported percentage, so none is invented. */}
      {runningBenchmark && (
        <div className="p-5 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-blue-950 dark:text-blue-200">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>
                {lang === 'vi' ? 'Trạng thái máy chủ' : 'Backend run status'}:{' '}
                <span className="font-mono">{runStatus ?? 'starting'}</span>
              </span>
            </div>
            <span className="font-mono text-blue-700 dark:text-blue-400">
              {(runElapsedMs / 1000).toFixed(1)}s
            </span>
          </div>
          <div className="w-full h-1.5 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full animate-pulse" />
          </div>
          <p className="text-[11px] text-blue-700 dark:text-blue-400">
            {lang === 'vi'
              ? 'Bộ đo kiểm chạy trên mô hình cục bộ và có thể mất nhiều phút. Kết quả chỉ hiện ra khi máy chủ ghi xong báo cáo.'
              : 'The suite runs against the local model and can take several minutes. Results appear only once the backend has written the report.'}
          </p>
        </div>
      )}

      {runError && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-words">{runError}</span>
        </div>
      )}

      {/* Provenance: which reports exist and when they were generated */}
      <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-white">
            <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>{lang === 'vi' ? 'Nguồn gốc Báo cáo' : 'Report Provenance'}</span>
          </div>
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
            {newestTimestamp
              ? `${lang === 'vi' ? 'Lần chạy gần nhất' : 'Newest report'}: ${new Date(newestTimestamp).toLocaleString()}`
              : lang === 'vi'
                ? 'Không có dấu thời gian'
                : 'No timestamps reported'}
          </span>
        </div>
        {generatedTimestamps.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
            {generatedTimestamps.map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-neutral-500 dark:text-neutral-500">{key}</span>
                <span>{new Date(value as string).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {skippedItems.length > 0 && (
          <div className="pt-1 space-y-0.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {lang === 'vi' ? 'Phần bị bỏ qua' : 'Skipped'}
            </div>
            {skippedItems.map(item => (
              <div key={item} className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
                {item}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`eval-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            <span>{tab.label}</span>
            {!tab.present && <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />}
          </button>
        ))}
      </div>

      {/* Tab 1: Retrieval */}
      {activeTab === 'retrieval' &&
        (!evalData.retrieval ? (
          <NotGenerated section="retrieval" />
        ) : (
          <div className="space-y-6">
            {evalData.retrieval.headline && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>{lang === 'vi' ? 'Kết quả then chốt' : 'Key Finding'}:</strong>{' '}
                  {evalData.retrieval.headline}
                </span>
              </div>
            )}

            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between flex-wrap gap-2">
                <span>{lang === 'vi' ? 'So sánh Chế độ Truy hồi' : 'Retrieval Mode Comparison'}</span>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal font-mono">
                  {typeof evalData.retrieval.query_count === 'number'
                    ? `${evalData.retrieval.query_count} ${lang === 'vi' ? 'truy vấn' : 'queries'}`
                    : ''}
                  {typeof evalData.retrieval.corpus_documents === 'number'
                    ? ` · ${evalData.retrieval.corpus_documents} ${lang === 'vi' ? 'tài liệu' : 'docs'}`
                    : ''}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-neutral-50/50 dark:bg-neutral-850/50 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="p-3">{lang === 'vi' ? 'Chế độ' : 'Retrieval Mode'}</th>
                      <th className="p-3">Recall@1</th>
                      <th className="p-3">Recall@3</th>
                      <th className="p-3 w-48">Recall@5</th>
                      <th className="p-3">MRR</th>
                      <th className="p-3">nDCG@5</th>
                      <th className="p-3">{lang === 'vi' ? 'Độ trễ TB' : 'Mean Latency'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-mono">
                    {(['bm25', 'dense', 'hybrid'] as RetrievalMode[]).map(mode => {
                      const m = evalData.retrieval!.modes?.[mode];
                      const isDefault = evalData.retrieval!.recommended_default === mode;
                      if (!m) {
                        return (
                          <tr key={mode}>
                            <td className="p-3 font-sans font-medium text-neutral-800 dark:text-neutral-200 capitalize">
                              {mode}
                            </td>
                            <td className="p-3 text-neutral-400 dark:text-neutral-500 font-sans italic" colSpan={6}>
                              {t.common.notGenerated}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={mode} className={isDefault ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''}>
                          <td className="p-3 font-sans font-bold text-neutral-900 dark:text-white capitalize">
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <span>{mode}</span>
                              {isDefault && (
                                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.5 rounded font-mono font-bold">
                                  {lang === 'vi' ? 'Mặc định' : 'Recommended'}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="p-3 text-neutral-800 dark:text-neutral-200">{pct(m.recall_at_1)}</td>
                          <td className="p-3 text-neutral-800 dark:text-neutral-200">{pct(m.recall_at_3)}</td>
                          <td className="p-3">
                            <MetricProgressBar value={m.recall_at_5} color="bg-emerald-600" />
                          </td>
                          <td className="p-3 font-bold text-neutral-800 dark:text-neutral-200">{num(m.mrr, 3)}</td>
                          <td className="p-3 text-neutral-800 dark:text-neutral-200">{num(m.ndcg_at_5, 3)}</td>
                          <td className="p-3 text-neutral-600 dark:text-neutral-400">{num(m.mean_latency_ms, 1, ' ms')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {evalData.retrieval.recommendation_basis && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {evalData.retrieval.recommendation_basis}
              </p>
            )}
          </div>
        ))}

      {/* Tab 2: Extraction */}
      {activeTab === 'extraction' &&
        (!evalData.extraction ? (
          <NotGenerated section="extraction" />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: lang === 'vi' ? 'Độ chính xác trường' : 'Field Accuracy',
                  value: pct(evalData.extraction.overall_field_accuracy),
                  bar: evalData.extraction.overall_field_accuracy,
                },
                {
                  label: lang === 'vi' ? 'Tỉ lệ Hợp lệ Schema' : 'Schema Valid Rate',
                  value: pct(evalData.extraction.overall_schema_valid_rate),
                  bar: evalData.extraction.overall_schema_valid_rate,
                },
                {
                  label: lang === 'vi' ? 'Độ trễ trung vị' : 'Median Latency',
                  value: num(evalData.extraction.median_llm_latency_ms, 0, ' ms'),
                },
                {
                  label: lang === 'vi' ? 'Độ trễ P95' : 'P95 Latency',
                  value: num(evalData.extraction.p95_llm_latency_ms, 0, ' ms'),
                },
              ].map(card => (
                <div
                  key={card.label}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2"
                >
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{card.label}</div>
                  <div className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">{card.value}</div>
                  {card.bar !== undefined && <MetricProgressBar value={card.bar} color="bg-emerald-600" showText={false} />}
                </div>
              ))}
            </div>

            {evalData.extraction.model && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {lang === 'vi' ? 'Mô hình' : 'Model'}:{' '}
                <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                  {evalData.extraction.model}
                </span>
                {typeof evalData.extraction.cases_evaluated === 'number' &&
                  ` · ${evalData.extraction.cases_evaluated} ${lang === 'vi' ? 'hồ sơ' : 'cases'}`}
              </p>
            )}

            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300">
                {lang === 'vi' ? 'Phân tích theo Loại Tài liệu' : 'Accuracy Breakdown by Document Type'}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-neutral-50/50 dark:bg-neutral-850/50 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="p-3">{lang === 'vi' ? 'Loại Tài liệu' : 'Document Type'}</th>
                      <th className="p-3">{lang === 'vi' ? 'Số lượng' : 'Evaluated'}</th>
                      <th className="p-3">{lang === 'vi' ? 'Hợp lệ Schema' : 'Schema Valid'}</th>
                      <th className="p-3 w-44">{lang === 'vi' ? 'Độ chính xác' : 'Field Accuracy'}</th>
                      <th className="p-3 w-40">{lang === 'vi' ? 'Số học' : 'Numeric'}</th>
                      <th className="p-3">{lang === 'vi' ? 'Ngày tháng' : 'Date'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-mono">
                    {Object.entries(evalData.extraction.by_document_type || {}).map(([dtype, stats]) => (
                      <tr key={dtype}>
                        <td className="p-3 font-sans font-bold capitalize text-neutral-900 dark:text-white">
                          {dtype.replace(/_/g, ' ')}
                        </td>
                        <td className="p-3 text-neutral-700 dark:text-neutral-300">
                          {stats.documents} {lang === 'vi' ? 'tài liệu' : 'docs'}
                        </td>
                        <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">
                          {pct(stats.schema_valid_rate, 0)}
                        </td>
                        <td className="p-3">
                          <MetricProgressBar value={stats.overall_field_accuracy} color="bg-emerald-600" />
                        </td>
                        <td className="p-3">
                          <MetricProgressBar
                            value={stats.numeric_accuracy}
                            color={(stats.numeric_accuracy ?? 0) > 0.9 ? 'bg-emerald-500' : 'bg-amber-500'}
                          />
                        </td>
                        <td className="p-3 text-neutral-800 dark:text-neutral-200">{pct(stats.date_accuracy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}

      {/* Tab 3: Routing */}
      {activeTab === 'routing' &&
        (!evalData.routing ? (
          <NotGenerated section="routing" />
        ) : (
          <div className="space-y-6">
            {evalData.routing.headline && (
              <div className="p-4 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-800 dark:text-neutral-200 font-medium">
                <strong>{lang === 'vi' ? 'Điểm tin Điều hướng' : 'Routing Headline'}:</strong>{' '}
                {evalData.routing.headline}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  label: lang === 'vi' ? 'Bộ điều hướng Production' : 'Production Router',
                  data: evalData.routing.production_router,
                  color: 'bg-emerald-600',
                  text: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  label: lang === 'vi' ? 'Từ khóa Xác định' : 'Deterministic Keyword',
                  data: evalData.routing.keyword_only,
                  color: 'bg-blue-600',
                  text: 'text-neutral-900 dark:text-white',
                },
                {
                  label: lang === 'vi' ? 'Thuần mô hình LLM' : 'LLM-Only Router',
                  data: evalData.routing.llm_only,
                  color: 'bg-amber-500',
                  text: 'text-amber-600 dark:text-amber-400',
                },
              ].map(card => (
                <div
                  key={card.label}
                  className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs"
                >
                  <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                    {card.label}
                  </span>
                  {card.data ? (
                    <>
                      <div className={`text-2xl font-bold font-mono ${card.text}`}>{pct(card.data.accuracy)}</div>
                      <MetricProgressBar value={card.data.accuracy} color={card.color} showText={false} />
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                        Macro F1: {num(card.data.macro_f1, 4)}
                        {typeof card.data.total === 'number' ? ` · n=${card.data.total}` : ''}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 italic">{t.common.notGenerated}</div>
                  )}
                </div>
              ))}
            </div>

            {evalData.routing.production_router_method_counts && (
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-1.5">
                <div className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                  {lang === 'vi' ? 'Phương thức điều hướng đã dùng' : 'Routing methods used'}
                </div>
                {Object.entries(evalData.routing.production_router_method_counts).map(([method, count]) => (
                  <div key={method} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-neutral-500 dark:text-neutral-400">{method}</span>
                    <span className="font-bold text-neutral-800 dark:text-neutral-200">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

      {/* Tab 4: Discrepancy */}
      {activeTab === 'discrepancy' &&
        (!evalData.discrepancy_rules && !evalData.discrepancy_end_to_end ? (
          <NotGenerated section="discrepancy" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: lang === 'vi' ? 'Quy tắc Xác định' : 'Deterministic Rules',
                subtitle:
                  lang === 'vi'
                    ? 'Chạy trên dữ liệu bóc tách chuẩn (ground truth).'
                    : 'Rule engine evaluated on ground-truth extracted fields.',
                badge: lang === 'vi' ? 'Chỉ quy tắc' : 'Rules only',
                data: evalData.discrepancy_rules,
                section: 'discrepancy_rules',
              },
              {
                title: lang === 'vi' ? 'Toàn diện (E2E)' : 'End-to-End Pipeline',
                subtitle:
                  lang === 'vi'
                    ? 'Bóc tách bằng LLM cộng bộ quy tắc, chạy trên tệp gốc.'
                    : 'LLM extraction plus the rule engine, run over the raw documents.',
                badge: 'LLM + Rules',
                data: evalData.discrepancy_end_to_end,
                section: 'discrepancy_end_to_end',
              },
            ].map(card => (
              <div
                key={card.section}
                className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{card.title}</h3>
                  <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[10px] font-bold">
                    {card.badge}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{card.subtitle}</p>
                {card.data ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                      {[
                        [lang === 'vi' ? 'Precision' : 'Precision', pct(card.data.overall?.precision, 1)],
                        [lang === 'vi' ? 'Recall' : 'Recall', pct(card.data.overall?.recall, 1)],
                        ['F1', num(card.data.overall?.f1, 3)],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-100 dark:border-neutral-700"
                        >
                          <div className="text-[10px] text-neutral-400 dark:text-neutral-400 font-bold uppercase">
                            {label}
                          </div>
                          <div className="text-lg font-bold text-neutral-900 dark:text-white mt-1">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                      tp {card.data.overall?.tp ?? '—'} · fp {card.data.overall?.fp ?? '—'} · fn{' '}
                      {card.data.overall?.fn ?? '—'}
                      {typeof card.data.cases_evaluated === 'number' &&
                        ` · ${card.data.cases_evaluated} ${lang === 'vi' ? 'hồ sơ' : 'cases'}`}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-neutral-400 dark:text-neutral-500 italic py-4">
                    {t.common.notGenerated}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

      {/* Tab 5: Grounded Q&A */}
      {activeTab === 'qa' &&
        (!evalData.generation ? (
          <NotGenerated section="generation" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: lang === 'vi' ? 'Tỉ lệ Hoàn tất' : 'Query Completion',
                  value: pct(evalData.generation.query_completion_rate, 0),
                  bar: evalData.generation.query_completion_rate,
                },
                {
                  label: lang === 'vi' ? 'Hiện diện Trích dẫn' : 'Citation Presence',
                  value: pct(evalData.generation.citation_presence_rate),
                  bar: evalData.generation.citation_presence_rate,
                },
                {
                  label: lang === 'vi' ? 'Trích dẫn Hợp lệ' : 'Valid Citations',
                  value: pct(evalData.generation.valid_citation_rate),
                  bar: evalData.generation.valid_citation_rate,
                },
                {
                  label: lang === 'vi' ? 'Độ trễ trung vị' : 'Median Latency',
                  value: num(evalData.generation.median_latency_ms, 0, ' ms'),
                },
              ].map(card => (
                <div
                  key={card.label}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2"
                >
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{card.label}</div>
                  <div className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">{card.value}</div>
                  {card.bar !== undefined && <MetricProgressBar value={card.bar} color="bg-emerald-500" showText={false} />}
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
              {typeof evalData.generation.correct_document_rate === 'number' && (
                <div>
                  {lang === 'vi' ? 'Trích dẫn đúng tài liệu' : 'Correct source document'}:{' '}
                  <span className="font-mono font-bold">{pct(evalData.generation.correct_document_rate)}</span>
                </div>
              )}
              {typeof evalData.generation.queries === 'number' && (
                <div>
                  {lang === 'vi' ? 'Số truy vấn' : 'Queries'}:{' '}
                  <span className="font-mono font-bold">{evalData.generation.queries}</span>
                </div>
              )}
              {evalData.generation.note && <p className="pt-1 leading-relaxed">{evalData.generation.note}</p>}
            </div>
          </div>
        ))}

      {/* Tab 6: Workflow */}
      {activeTab === 'workflow' &&
        (!evalData.workflow ? (
          <NotGenerated section="workflow" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: lang === 'vi' ? 'Tỉ lệ Hoàn tất' : 'Completion Rate',
                  value: pct(evalData.workflow.completion_rate, 0),
                  bar: evalData.workflow.completion_rate,
                },
                {
                  label: lang === 'vi' ? 'Nhất quán tạo hạng mục' : 'Review Task Consistency',
                  value: pct(evalData.workflow.review_task_creation_consistency, 0),
                  bar: evalData.workflow.review_task_creation_consistency,
                },
                {
                  label: lang === 'vi' ? 'Số lỗi trích xuất' : 'Extraction Failures',
                  value:
                    `${evalData.workflow.extraction_failure_count}` +
                    (typeof evalData.workflow.extraction_failure_rate === 'number'
                      ? ` (${pct(evalData.workflow.extraction_failure_rate, 1)})`
                      : ''),
                },
                {
                  label: lang === 'vi' ? 'Thời lượng trung vị' : 'Median Duration',
                  value:
                    typeof evalData.workflow.median_duration_ms === 'number'
                      ? `${(evalData.workflow.median_duration_ms / 1000).toFixed(1)} s`
                      : '—',
                },
              ].map(card => (
                <div
                  key={card.label}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2"
                >
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 font-semibold">{card.label}</div>
                  <div className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">{card.value}</div>
                  {card.bar !== undefined && <MetricProgressBar value={card.bar} color="bg-emerald-500" showText={false} />}
                </div>
              ))}
            </div>

            {evalData.workflow.headline && (
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-700 dark:text-neutral-300">
                {evalData.workflow.headline}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
