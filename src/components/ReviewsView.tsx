import React, { useState, useEffect } from 'react';
import { CaseItem, ReviewFinding, Severity, ReviewStatus } from '../types';
import { apiGet, apiPost, errorMessage } from '../api';
import { SeverityBadge, StatusChip } from './StatusBadges';
import { DocumentSplitViewer } from './DocumentSplitViewer';
import { exportReviewsToCSV, exportReviewsToMarkdown, printOrExportPDF } from '../utils/exportUtils';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  HelpCircle,
  Filter,
  User,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  Check,
  AlertCircle,
  Columns,
  Tag
} from 'lucide-react';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface ReviewsViewProps {
  cases: CaseItem[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onRefreshCases: () => void;
}

export function ReviewsView({ cases, selectedCaseId, onSelectCase, onRefreshCases }: ReviewsViewProps) {
  const { lang, t } = useThemeLanguage();

  const quickNotePresets = lang === 'vi' ? [
    'Đã xác minh qua hợp đồng bổ sung',
    'Chênh lệch làm tròn hợp lệ (Rounding Diff)',
    'Đã liên hệ bên bán đối soát lại hóa đơn',
    'Vi phạm điều khoản thanh toán Net-30',
    'Phạt chậm tiến độ theo phụ lục hợp đồng',
    'Chứng từ chưa đủ chữ ký thẩm quyền'
  ] : [
    'Verified via supplemental agreement',
    'Acceptable rounding discrepancy',
    'Contacted vendor for revised invoice',
    'Violation of Net-30 payment term',
    'Late penalty applied per contract appendix',
    'Missing required executive signature'
  ];

  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [reviewerName, setReviewerName] = useState<string>(lang === 'vi' ? 'Kiểm toán trưởng (Huong Nguyen)' : 'Lead Auditor (Huong Nguyen)');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Split Viewer state for evidence cross-inspection
  const [splitViewerConfig, setSplitViewerConfig] = useState<{
    open: boolean;
    caseId?: string;
    documents?: any[];
    finding?: any;
    findingIndex?: number;
  }>({ open: false });

  const handleOpenSplitForFinding = async (finding: ReviewFinding, index?: number) => {
    try {
      const caseData = await apiGet<CaseItem>(`/api/cases/${finding.case_id}`);
      const currentIndex = index !== undefined ? index : reviews.findIndex(r => r.review_id === finding.review_id);
      setSplitViewerConfig({
        open: true,
        caseId: finding.case_id,
        documents: caseData.documents || [],
        finding: finding.discrepancy,
        findingIndex: currentIndex >= 0 ? currentIndex : 0,
      });
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  };

  const handleNavigateFinding = async (newIndex: number) => {
    if (newIndex < 0 || newIndex >= reviews.length) return;
    const targetFinding = reviews[newIndex];
    if (!targetFinding) return;

    try {
      // If navigating across different case documents, load the new case docs
      if (targetFinding.case_id !== splitViewerConfig.caseId) {
        const caseData = await apiGet<CaseItem>(`/api/cases/${targetFinding.case_id}`);
        setSplitViewerConfig({
          open: true,
          caseId: targetFinding.case_id,
          documents: caseData.documents || [],
          finding: targetFinding.discrepancy,
          findingIndex: newIndex,
        });
        return;
      }

      setSplitViewerConfig(prev => ({
        ...prev,
        finding: targetFinding.discrepancy,
        findingIndex: newIndex,
      }));
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  };

  const [reviews, setReviews] = useState<ReviewFinding[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const buildReviewQuery = (limit: number, offset: number) => {
    const params = new URLSearchParams();
    if (selectedCaseId) params.append('case_id', selectedCaseId);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (severityFilter !== 'all') params.append('severity', severityFilter);
    params.append('limit', String(limit));
    params.append('offset', String(offset));
    return params.toString();
  };

  const fetchReviews = () => {
    setLoading(true);
    setLoadError(null);
    apiGet<{ reviews: ReviewFinding[]; count: number; total: number }>(
      `/api/reviews?${buildReviewQuery(pageSize, (page - 1) * pageSize)}`
    )
      .then(data => {
        setReviews(data.reviews || []);
        setTotalReviews(data.total || 0);
      })
      .catch(err => {
        // No stale/mock rows: clear the table and say why it is empty.
        setReviews([]);
        setTotalReviews(0);
        setLoadError(errorMessage(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReviews();
    setSelectedReviewIds([]); // reset selection when filter changes
  }, [selectedCaseId, statusFilter, severityFilter, page]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // POST /api/reviews/{id}/approve|reject take {reviewer, note};
  // /resolve takes no body.
  const decideReview = (reviewId: string, action: 'approve' | 'reject' | 'resolve', note: string) =>
    action === 'resolve'
      ? apiPost<ReviewFinding>(`/api/reviews/${reviewId}/resolve`)
      : apiPost<ReviewFinding>(`/api/reviews/${reviewId}/${action}`, {
          reviewer: reviewerName,
          note: note || null,
        });

  const handleAction = async (reviewId: string, action: 'approve' | 'reject' | 'resolve') => {
    try {
      await decideReview(reviewId, action, notes[reviewId] || '');
      fetchReviews();
      onRefreshCases();
      const actionLabel = action === 'approve' ? (lang === 'vi' ? 'CHẤP THUẬN' : 'APPROVED') : action === 'reject' ? (lang === 'vi' ? 'BÁC BỎ' : 'REJECTED') : (lang === 'vi' ? 'ĐÃ XỬ LÝ' : 'RESOLVED');
      showToast(lang === 'vi' ? `Đã ghi nhận quyết định: ${actionLabel}` : `Finding ${action.toUpperCase()} recorded.`);
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  // Toggle single item selection
  const toggleSelectOne = (id: string) => {
    setSelectedReviewIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Toggle select all currently visible reviews
  const toggleSelectAllVisible = () => {
    const visibleIds = reviews.map(r => r.review_id);
    const allSelected = visibleIds.every(id => selectedReviewIds.includes(id));
    if (allSelected) {
      setSelectedReviewIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedReviewIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Batch action handler.
  //
  // POST /api/reviews/batch applies one decision across many findings and
  // reports each outcome separately; the toast repeats the backend's real
  // updated/failed counts rather than assuming every selection succeeded.
  const handleBatchAction = async (action: 'approve' | 'reject' | 'resolve') => {
    if (selectedReviewIds.length === 0) return;
    setBatchActionLoading(true);
    const note =
      batchNote ||
      (lang === 'vi'
        ? `Xử lý hàng loạt (${action}) bởi ${reviewerName}`
        : `Bulk ${action} applied by ${reviewerName}`);

    try {
      const data = await apiPost<{
        updated_count: number;
        failed_count: number;
        requested_count: number;
        failed: Array<{ review_id: string; error: string; message: string }>;
      }>('/api/reviews/batch', {
        review_ids: selectedReviewIds,
        action,
        reviewer: reviewerName,
        note,
      });

      fetchReviews();
      onRefreshCases();

      if (data.failed_count > 0) {
        showToast(
          (lang === 'vi'
            ? `Đã áp dụng ${data.updated_count}/${data.requested_count}; ${data.failed_count} lỗi: `
            : `Applied ${data.updated_count}/${data.requested_count}; ${data.failed_count} failed: `) +
            (data.failed[0]?.message ?? '')
        );
      } else {
        showToast(
          lang === 'vi'
            ? `Đã áp dụng quyết định hàng loạt cho ${data.updated_count} hạng mục.`
            : `Batch ${action.toUpperCase()} applied to ${data.updated_count} finding(s).`
        );
      }
      setSelectedReviewIds([]);
      setBatchNote('');
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Quick note preset insertion
  const applyQuickNote = (reviewId: string, text: string) => {
    setNotes(prev => ({
      ...prev,
      [reviewId]: prev[reviewId] ? `${prev[reviewId]} - ${text}` : text
    }));
  };

  // Fetch every finding matching the current filters for export.
  // The API caps `limit` at 500, so page through until the reported total is
  // covered rather than silently truncating the export.
  const fetchAllFindingsForExport = async (): Promise<ReviewFinding[]> => {
    const pageLimit = 500;
    const all: ReviewFinding[] = [];
    try {
      let offset = 0;
      for (;;) {
        const data = await apiGet<{ reviews: ReviewFinding[]; total: number }>(
          `/api/reviews?${buildReviewQuery(pageLimit, offset)}`
        );
        const batch = data.reviews || [];
        all.push(...batch);
        offset += batch.length;
        if (batch.length < pageLimit || offset >= (data.total ?? all.length)) break;
      }
      return all;
    } catch (err) {
      setLoadError(errorMessage(err));
      // Export whatever was already fetched rather than inventing rows.
      return all.length > 0 ? all : reviews;
    }
  };

  const handleExportCSV = async () => {
    const list = selectedReviewIds.length > 0
      ? reviews.filter(r => selectedReviewIds.includes(r.review_id))
      : await fetchAllFindingsForExport();
    exportReviewsToCSV(list, `audit_findings_${selectedCaseId || 'all'}_${Date.now()}.csv`);
    showToast(lang === 'vi' ? `Đã xuất ${list.length} phát hiện ra tệp CSV/Excel.` : `Exported ${list.length} findings to CSV/Excel format.`);
  };

  const handleExportMarkdown = async () => {
    const list = selectedReviewIds.length > 0
      ? reviews.filter(r => selectedReviewIds.includes(r.review_id))
      : await fetchAllFindingsForExport();
    exportReviewsToMarkdown(list, `Audit Findings & Review Report (${selectedCaseId || 'All Cases'})`);
    showToast(lang === 'vi' ? `Đã xuất ${list.length} phát hiện ra định dạng Markdown.` : `Exported ${list.length} findings to Markdown document.`);
  };

  const handlePrintPDF = async () => {
    const list = selectedReviewIds.length > 0
      ? reviews.filter(r => selectedReviewIds.includes(r.review_id))
      : await fetchAllFindingsForExport();
    printOrExportPDF(list, `Audit Findings Official Executive Report`);
  };

  const totalPages = Math.max(1, Math.ceil(totalReviews / pageSize));
  const allVisibleSelected = reviews.length > 0 && reviews.every(r => selectedReviewIds.includes(r.review_id));

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-neutral-700 dark:border-neutral-200 animate-in fade-in slide-in-from-bottom-3 duration-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Export Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-0.5">
            {lang === 'vi' ? 'Hàng đợi thẩm định & Bất thường' : 'Review & Discrepancy Queue'}
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">{t.reviews.title}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            {t.reviews.subtitle}
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="export-csv-btn"
            onClick={handleExportCSV}
            title={lang === 'vi' ? 'Xuất toàn bộ phát hiện ra bảng tính CSV / Excel' : 'Export full findings to CSV / Excel spreadsheet'}
            className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>CSV / Excel</span>
          </button>

          <button
            id="export-md-btn"
            onClick={handleExportMarkdown}
            title={lang === 'vi' ? 'Xuất báo cáo phát hiện ra tệp Markdown' : 'Export findings report as Markdown document'}
            className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Markdown</span>
          </button>

          <button
            id="export-pdf-btn"
            onClick={handlePrintPDF}
            title={lang === 'vi' ? 'In hoặc xuất báo cáo chính thức ra PDF' : 'Print or export official audit findings report as PDF'}
            className="px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-white text-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600" />
            <span>Print / PDF</span>
          </button>

          <button
            onClick={() => setHelpOpen(!helpOpen)}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            title={lang === 'vi' ? 'Hướng dẫn thẩm định' : 'Auditor Guidelines'}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Guide dialog / expander */}
      {helpOpen && (
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 text-xs text-neutral-700 dark:text-neutral-300 space-y-2 animate-in fade-in duration-150">
          <div className="font-bold text-neutral-900 dark:text-white">{lang === 'vi' ? 'Hướng dẫn thẩm định' : 'Auditor Guidelines'}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-white dark:bg-neutral-900 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-2xs">
              <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t.reviews.approveBtn}
              </span>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">{lang === 'vi' ? 'Xác nhận sai lệch hợp lệ với lý do lưu hồ sơ' : 'Confirms variance is acceptable with documented rationale'}</p>
            </div>
            <div className="bg-white dark:bg-neutral-900 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-2xs">
              <span className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> {t.reviews.rejectBtn}
              </span>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">{lang === 'vi' ? 'Bác bỏ mục sai lệch / yêu cầu xuất lại hóa đơn' : 'Flags finding as non-compliant or billing error'}</p>
            </div>
            <div className="bg-white dark:bg-neutral-900 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-2xs">
              <span className="font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> {lang === 'vi' ? 'Giải quyết' : 'Resolve'}
              </span>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">{lang === 'vi' ? 'Đóng bất thường sau khi đã giải quyết remediate' : 'Closes finding after vendor re-bill or remediation'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">{t.reviews.filterCaseLabel}</label>
            <select
              value={selectedCaseId || 'all'}
              onChange={e => {
                onSelectCase(e.target.value === 'all' ? null : e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
            >
              <option value="all">{t.reviews.allCasesOption}</option>
              {cases.map(c => (
                <option key={c.case_id} value={c.case_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">{t.reviews.filterStatusLabel}</label>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
            >
              <option value="all">{t.reviews.allStatuses}</option>
              <option value="OPEN">{lang === 'vi' ? 'Chưa duyệt (Mở)' : 'Open'}</option>
              <option value="APPROVED">{lang === 'vi' ? 'Đã duyệt' : 'Approved'}</option>
              <option value="REJECTED">{lang === 'vi' ? 'Đã bác bỏ' : 'Rejected'}</option>
              <option value="RESOLVED">{lang === 'vi' ? 'Đã giải quyết' : 'Resolved'}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">{t.reviews.filterSeverityLabel}</label>
            <select
              value={severityFilter}
              onChange={e => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
            >
              <option value="all">{t.reviews.allSeverities}</option>
              <option value="high">{lang === 'vi' ? 'Nghiêm trọng (High)' : 'High'}</option>
              <option value="medium">{lang === 'vi' ? 'Trung bình (Medium)' : 'Medium'}</option>
              <option value="low">{lang === 'vi' ? 'Thấp (Low)' : 'Low'}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">{lang === 'vi' ? 'Tên Kiểm toán viên:' : 'Auditor Identity:'}</label>
            <div className="relative">
              <input
                type="text"
                value={reviewerName}
                onChange={e => setReviewerName(e.target.value)}
                placeholder="Auditor Name"
                className="w-full pl-7 pr-2.5 py-1.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              />
              <User className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-2" />
            </div>
          </div>
        </div>
      </div>

      {/* Batch Actions Bar */}
      <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSelectAllVisible}
            disabled={reviews.length === 0}
            className="flex items-center gap-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white cursor-pointer disabled:opacity-50"
          >
            {allVisibleSelected ? (
              <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : selectedReviewIds.length > 0 ? (
              <div className="w-4 h-4 bg-emerald-600 text-white rounded flex items-center justify-center text-[10px] font-bold">
                -
              </div>
            ) : (
              <Square className="w-4 h-4 text-neutral-400" />
            )}
            <span>
              {selectedReviewIds.length > 0
                ? (lang === 'vi' ? `Đã chọn ${selectedReviewIds.length} phát hiện` : `${selectedReviewIds.length} findings selected`)
                : (lang === 'vi' ? 'Chọn tất cả hiển thị' : 'Select all visible')}
            </span>
          </button>

          {selectedReviewIds.length > 0 && (
            <button
              onClick={() => setSelectedReviewIds([])}
              className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white underline cursor-pointer"
            >
              {t.reviews.batchClearSelection}
            </button>
          )}
        </div>

        {/* Batch Decision Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {selectedReviewIds.length > 0 && (
            <input
              type="text"
              placeholder={t.reviews.batchNotePlaceholder}
              value={batchNote}
              onChange={e => setBatchNote(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white min-w-[170px]"
            />
          )}

          <button
            id="batch-approve-btn"
            disabled={selectedReviewIds.length === 0 || batchActionLoading}
            onClick={() => handleBatchAction('approve')}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{lang === 'vi' ? `Duyệt hàng loạt (${selectedReviewIds.length})` : `Batch Approve (${selectedReviewIds.length})`}</span>
          </button>

          <button
            id="batch-reject-btn"
            disabled={selectedReviewIds.length === 0 || batchActionLoading}
            onClick={() => handleBatchAction('reject')}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>{lang === 'vi' ? `Bác bỏ hàng loạt (${selectedReviewIds.length})` : `Batch Reject (${selectedReviewIds.length})`}</span>
          </button>

          <button
            id="batch-resolve-btn"
            disabled={selectedReviewIds.length === 0 || batchActionLoading}
            onClick={() => handleBatchAction('resolve')}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-900 dark:bg-neutral-700 dark:hover:bg-neutral-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{lang === 'vi' ? 'Giải quyết' : 'Resolve'}</span>
          </button>
        </div>
      </div>

      {/* Findings List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-neutral-500 dark:text-neutral-400">
          {lang === 'vi' ? 'Đang tải danh sách bất thường...' : 'Loading discrepancy findings...'}
        </div>
      ) : loadError ? (
        <div className="p-8 text-center rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 space-y-2">
          <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-300 flex items-center justify-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            <span>{t.common.loadFailed}</span>
          </h4>
          <p className="text-xs text-rose-700 dark:text-rose-400 break-words">{loadError}</p>
          <button
            onClick={fetchReviews}
            className="px-3.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold cursor-pointer"
          >
            {t.common.retry}
          </button>
        </div>
      ) : reviews.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{t.reviews.noFindingsTitle}</h4>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {t.reviews.noFindingsDesc}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((item, idx) => {
            const disc = item.discrepancy || {};
            const isSelected = selectedReviewIds.includes(item.review_id);

            return (
              <div
                key={item.review_id}
                className={`p-5 rounded-xl border transition-all shadow-xs space-y-4 ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/30'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'
                }`}
              >
                {/* Finding Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {/* Checkbox for batch action */}
                    <button
                      onClick={() => toggleSelectOne(item.review_id)}
                      className="cursor-pointer text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-300 dark:text-neutral-600 hover:text-neutral-400" />
                      )}
                    </button>

                    <SeverityBadge severity={item.severity} />
                    <StatusChip status={item.status} />
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">{lang === 'vi' ? 'Hồ sơ' : 'Case'}: {item.case_id}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
                    {item.created_at ? item.created_at.slice(0, 16).replace('T', ' ') : ''}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    {disc.type ? disc.type.replace(/_/g, ' ').toUpperCase() : 'DISCREPANCY'}
                  </h3>
                  <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1 leading-relaxed">{disc.description}</p>
                </div>

                {/* Calculation / Comparison values */}
                {(disc.expected_value !== undefined || disc.calculation) && (
                  <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 text-xs font-mono space-y-1">
                    {disc.expected_value !== undefined && (
                      <div className="flex items-center gap-4 text-neutral-700 dark:text-neutral-300">
                        <span>{lang === 'vi' ? 'Kỳ vọng' : 'Expected'}: <strong>{disc.expected_value}</strong></span>
                        <span>{lang === 'vi' ? 'Thực tế' : 'Observed'}: <strong>{disc.observed_value}</strong></span>
                        {disc.difference !== undefined && <span>{lang === 'vi' ? 'Chênh lệch' : 'Diff'}: <strong>{disc.difference}</strong></span>}
                      </div>
                    )}
                    {disc.calculation && (
                      <div className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                        {lang === 'vi' ? 'Công thức' : 'Formula'}: {disc.calculation.formula}
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence citations */}
                {disc.evidence && disc.evidence.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                        {t.reviews.evidenceSection} ({disc.evidence.length})
                      </span>
                      <button
                        onClick={() => handleOpenSplitForFinding(item, idx)}
                        className="px-2.5 py-1 rounded-md bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-white text-white dark:text-neutral-900 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      >
                        <Columns className="w-3 h-3 text-emerald-400 dark:text-emerald-600" />
                        <span>{t.reviews.splitViewerBtn}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {disc.evidence.map((ev: any, ei: number) => (
                        <div key={ei} className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-100 dark:border-neutral-800 text-[11px]">
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">{ev.filename}</span>
                          {ev.snippet && <p className="text-neutral-600 dark:text-neutral-400 mt-0.5 italic">"{ev.snippet}"</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audit trail / note if decided */}
                {item.reviewer && (
                  <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 flex items-center justify-between">
                    <div>
                      {lang === 'vi' ? 'Quyết định bởi:' : 'Decided by:'} <strong>{item.reviewer}</strong>
                      {item.note && <span className="italic ml-2">"{item.note}"</span>}
                    </div>
                    {item.decided_at && (
                      <span className="text-[10px] font-mono text-neutral-400">
                        {item.decided_at.slice(0, 16).replace('T', ' ')}
                      </span>
                    )}
                  </div>
                )}

                {/* Quick Note Preset Chips */}
                {item.status === 'OPEN' && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-semibold flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5" /> {t.reviews.quickPresetsTitle}:
                    </span>
                    {quickNotePresets.map((preset, pIdx) => (
                      <button
                        key={pIdx}
                        onClick={() => applyQuickNote(item.review_id, preset)}
                        className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white text-[10px] font-medium transition-colors cursor-pointer border border-neutral-200/60 dark:border-neutral-700"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}

                {/* Action controls */}
                <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                  <input
                    type="text"
                    placeholder={t.reviews.auditorNotesPlaceholder}
                    value={notes[item.review_id] || ''}
                    onChange={e => setNotes({ ...notes, [item.review_id]: e.target.value })}
                    className="flex-1 min-w-[200px] px-3 py-1.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-750"
                  />

                  <div className="flex items-center gap-2">
                    {item.status === 'OPEN' && (
                      <>
                        <button
                          onClick={() => handleAction(item.review_id, 'approve')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.reviews.approveBtn}</span>
                        </button>
                        <button
                          onClick={() => handleAction(item.review_id, 'reject')}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{t.reviews.rejectBtn}</span>
                        </button>
                      </>
                    )}
                    {item.status === 'APPROVED' && (
                      <button
                        onClick={() => handleAction(item.review_id, 'resolve')}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-900 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{lang === 'vi' ? 'Giải quyết tiếp' : 'Resolve Follow-Up'}</span>
                      </button>
                    )}
                    {item.status === 'REJECTED' && (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500 italic">{lang === 'vi' ? 'Bị bác bỏ bởi Kiểm toán viên' : 'Dismissed by Auditor'}</span>
                    )}
                    {item.status === 'RESOLVED' && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{lang === 'vi' ? 'Đã giải quyết hoàn tất' : 'Resolved'}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {lang === 'vi' ? `Hiển thị ${reviews.length} trên ${totalReviews} phát hiện` : `Showing ${reviews.length} of ${totalReviews} findings`}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{lang === 'vi' ? 'Trước' : 'Previous'}</span>
              </button>
              <span className="text-xs font-mono text-neutral-700 dark:text-neutral-300">
                {lang === 'vi' ? `Trang ${page} / ${totalPages || 1}` : `Page ${page} of ${totalPages || 1}`}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 cursor-pointer flex items-center gap-1"
              >
                <span>{lang === 'vi' ? 'Sau' : 'Next'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Split Document Viewer Modal with Continuous Finding Navigation */}
      {splitViewerConfig.open && splitViewerConfig.documents && splitViewerConfig.documents.length > 0 && (
        <DocumentSplitViewer
          documents={splitViewerConfig.documents}
          finding={splitViewerConfig.finding}
          caseId={splitViewerConfig.caseId}
          currentFindingIndex={splitViewerConfig.findingIndex}
          totalFindingsCount={reviews.length}
          onPreviousFinding={() => {
            if (splitViewerConfig.findingIndex !== undefined && splitViewerConfig.findingIndex > 0) {
              handleNavigateFinding(splitViewerConfig.findingIndex - 1);
            }
          }}
          onNextFinding={() => {
            if (splitViewerConfig.findingIndex !== undefined && splitViewerConfig.findingIndex < reviews.length - 1) {
              handleNavigateFinding(splitViewerConfig.findingIndex + 1);
            }
          }}
          onClose={() => setSplitViewerConfig({ open: false })}
          onApproveFinding={async (finding) => {
            const reviewItem = reviews.find(r => r.discrepancy?.description === finding.description);
            if (reviewItem) {
              await handleAction(reviewItem.review_id, 'approve');
            }
          }}
          onRejectFinding={async (finding) => {
            const reviewItem = reviews.find(r => r.discrepancy?.description === finding.description);
            if (reviewItem) {
              await handleAction(reviewItem.review_id, 'reject');
            }
          }}
        />
      )}
    </div>
  );
}
