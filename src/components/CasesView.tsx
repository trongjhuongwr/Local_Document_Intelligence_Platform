import React, { useState, useEffect, useRef } from 'react';
import {
  AnalysisAccepted,
  AuditTrailResponse,
  CaseItem,
  DocumentType,
  WorkflowRun,
  Discrepancy,
  CaseReadiness,
  ReviewFinding,
} from '../types';
import { apiDelete, apiGet, apiPost, apiPostForm, errorMessage, isNotImplemented } from '../api';
import { LoadedDocument, loadDocument } from '../utils/documentText';
import { SeverityBadge, ReadinessChip } from './StatusBadges';
import { DocumentSplitViewer } from './DocumentSplitViewer';
import { printOrExportAuditDossier } from '../utils/exportUtils';
import {
  ArrowLeft,
  UploadCloud,
  CheckCircle2,
  Circle,
  AlertTriangle,
  FileText,
  Download,
  Trash2,
  Play,
  Check,
  ChevronDown,
  ChevronRight,
  Calculator,
  Search,
  Filter,
  Eye,
  X,
  Copy,
  Hash,
  FileSpreadsheet,
  Columns,
  ArrowLeftRight,
  Printer,
  Sparkles,
  Tag,
  FileCheck
} from 'lucide-react';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface CasesViewProps {
  cases: CaseItem[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onRefreshCases: () => void;
  onNavigateToReviews: (caseId: string) => void;
}

function inferDocTypeWithConfidence(filename: string, lang: 'en' | 'vi'): { type: DocumentType; confidence: number; reason: string } {
  const f = filename.toLowerCase();
  const isVi = lang === 'vi';
  if (f.includes('contract') || f.includes('msa') || f.includes('agreement') || f.includes('hop_dong') || f.includes('hopdong')) {
    return { type: 'contract', confidence: 95, reason: isVi ? 'Nhận diện theo tên Hợp đồng/Thỏa thuận' : 'Matched agreement/contract naming' };
  }
  if (f.includes('invoice') || f.includes('inv') || f.includes('bill') || f.includes('hoa_don') || f.includes('hoadon')) {
    return { type: 'invoice', confidence: 96, reason: isVi ? 'Nhận diện theo tên Hóa đơn/Chứng từ' : 'Matched invoice/bill naming' };
  }
  if (f.includes('po') || f.includes('purchase') || f.includes('order') || f.includes('don_dat_hang')) {
    return { type: 'purchase_order', confidence: 92, reason: isVi ? 'Nhận diện theo tên Đơn đặt hàng PO' : 'Matched purchase order naming' };
  }
  if (f.includes('policy') || f.includes('terms') || f.includes('guideline') || f.includes('chinh_sach') || f.includes('quy_dinh')) {
    return { type: 'policy', confidence: 90, reason: isVi ? 'Nhận diện theo tên Chính sách thanh toán' : 'Matched policy/terms naming' };
  }
  return { type: 'other', confidence: 50, reason: isVi ? 'Tài liệu nghiệp vụ bổ trợ' : 'General business document' };
}

function inferDocType(filename: string): DocumentType {
  return inferDocTypeWithConfidence(filename, 'en').type;
}

export function CasesView({ cases, activeCaseId, onSelectCase, onRefreshCases, onNavigateToReviews }: CasesViewProps) {
  const { lang, t } = useThemeLanguage();

  const docLabels: Record<string, string> = {
    contract: t.cases.docTypeContract,
    invoice: t.cases.docTypeInvoice,
    purchase_order: t.cases.docTypePO,
    policy: t.cases.docTypePolicy,
    other: t.cases.docTypeOther,
  };

  // Search & Filter state for Cases list
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CaseReadiness>('ALL');

  // Create case state
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [creating, setCreating] = useState(false);

  // Active case state
  const [caseDetail, setCaseDetail] = useState<CaseItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Upload & Drag-and-Drop state
  const [selectedFiles, setSelectedFiles] = useState<Array<{ file: File; type: DocumentType }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Quick Peek Modal state
  const [peekDoc, setPeekDoc] = useState<LoadedDocument | null>(null);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [loadingPeek, setLoadingPeek] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Analysis / Workflow state
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowRun | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Side-by-Side Split Viewer state
  const [splitViewerConfig, setSplitViewerConfig] = useState<{
    open: boolean;
    leftDocId?: string;
    rightDocId?: string;
    finding?: Discrepancy | null;
  }>({ open: false });

  // Load detailed case data when activeCaseId changes.
  // GET /api/cases/{id} embeds only a *summary* of latest_workflow (id/status/
  // timings), so the full run - steps, result, report - is fetched separately
  // from GET /api/workflows/{id}.
  useEffect(() => {
    if (!activeCaseId) {
      setCaseDetail(null);
      setActiveWorkflow(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    apiGet<CaseItem>(`/api/cases/${activeCaseId}`)
      .then(async data => {
        if (cancelled) return;
        setCaseDetail(data);
        if (data.latest_workflow?.workflow_id) {
          try {
            const run = await apiGet<WorkflowRun>(`/api/workflows/${data.latest_workflow.workflow_id}`);
            if (!cancelled) setActiveWorkflow(run);
          } catch (err) {
            if (!cancelled) {
              setActiveWorkflow(null);
              setDetailError(errorMessage(err));
            }
          }
        } else if (!cancelled) {
          setActiveWorkflow(null);
        }
      })
      .catch(err => {
        if (cancelled) return;
        setCaseDetail(null);
        setDetailError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCaseId]);

  // Poll the asynchronous analysis workflow while it is queued or running.
  useEffect(() => {
    if (!activeWorkflow || (activeWorkflow.status !== 'running' && activeWorkflow.status !== 'queued')) {
      return;
    }
    const workflowId = activeWorkflow.workflow_id;
    let stopped = false;
    const interval = setInterval(async () => {
      try {
        const wf = await apiGet<WorkflowRun>(`/api/workflows/${workflowId}`);
        if (stopped) return;
        setActiveWorkflow(wf);
        if (wf.status === 'completed' || wf.status === 'failed') {
          clearInterval(interval);
          onRefreshCases();
          if (activeCaseId) {
            try {
              setCaseDetail(await apiGet<CaseItem>(`/api/cases/${activeCaseId}`));
            } catch (err) {
              setDetailError(errorMessage(err));
            }
          }
        }
      } catch (err) {
        if (stopped) return;
        clearInterval(interval);
        setActionError(errorMessage(err));
      }
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [activeWorkflow?.status, activeWorkflow?.workflow_id]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseName.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await apiPost<CaseItem>('/api/cases', { name: newCaseName.trim() });
      setNewCaseName('');
      setCreateFormOpen(false);
      onRefreshCases();
      onSelectCase(created.case_id);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const processFiles = (files: File[]) => {
    if (files.length === 0) return;
    const mapped = files.map(file => ({
      file,
      type: inferDocType(file.name),
    }));
    setSelectedFiles(prev => [...prev, ...mapped]);
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    processFiles(Array.from(e.target.files));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUploadPack = async () => {
    if (!caseDetail || selectedFiles.length === 0) return;
    setUploading(true);
    setUploadMessage(null);
    setActionError(null);
    try {
      const formData = new FormData();
      selectedFiles.forEach(item => {
        formData.append('files', item.file);
        formData.append('document_types', item.type);
      });

      const data = await apiPostForm<{
        success_count: number;
        failure_count: number;
        results: Array<{ filename: string; success: boolean; message?: string }>;
      }>(`/api/cases/${caseDetail.case_id}/documents`, formData);

      // Report per-file failures instead of a blanket success message.
      const failures = (data.results || []).filter(r => !r.success);
      setUploadMessage(
        lang === 'vi'
          ? `Đã nạp ${data.success_count} tài liệu.`
          : `Ingested ${data.success_count} document(s).`
      );
      if (failures.length > 0) {
        setActionError(
          failures.map(f => `${f.filename}: ${f.message || 'upload failed'}`).join(' · ')
        );
      }
      setSelectedFiles([]);
      setCaseDetail(await apiGet<CaseItem>(`/api/cases/${caseDetail.case_id}`));
      onRefreshCases();
    } catch (err) {
      setUploadMessage(null);
      setActionError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleOpenPeek = async (docId: string) => {
    setLoadingPeek(true);
    setPeekError(null);
    setPeekDoc(null);
    try {
      setPeekDoc(await loadDocument(docId));
    } catch (err) {
      setPeekError(errorMessage(err));
    } finally {
      setLoadingPeek(false);
    }
  };

  const handleCopySha256 = () => {
    if (!peekDoc?.detail.sha256) return;
    navigator.clipboard.writeText(peekDoc.detail.sha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // POST /api/cases/{id}/analyses answers 202 with a workflow id; the run itself
  // happens in the background and is observed through GET /api/workflows/{id}.
  const handleRunAnalysis = async () => {
    if (!caseDetail) return;
    setAnalyzing(true);
    setActionError(null);
    try {
      const accepted = await apiPost<AnalysisAccepted>(`/api/cases/${caseDetail.case_id}/analyses`);
      // Seed from the real accepted payload, then let polling fill in the
      // actual steps/progress reported by the backend.
      setActiveWorkflow({
        workflow_id: accepted.workflow_id,
        case_id: accepted.case_id,
        status: accepted.status || 'queued',
        progress_percent: 0,
        current_step: null,
        steps: [],
      });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteCase = async () => {
    if (!caseDetail || !deleteConfirm) return;
    setActionError(null);
    try {
      await apiDelete(`/api/cases/${caseDetail.case_id}`);
      onSelectCase(null);
      onRefreshCases();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const handleExportAuditDossier = async () => {
    if (!caseDetail) return;
    setActionError(null);

    let reviews: ReviewFinding[] = [];
    let auditLogs: AuditTrailResponse['entries'] = [];
    const problems: string[] = [];

    try {
      const res = await apiGet<{ reviews: ReviewFinding[] }>(
        `/api/reviews?case_id=${encodeURIComponent(caseDetail.case_id)}&limit=500`
      );
      reviews = res.reviews || [];
    } catch (err) {
      problems.push(`reviews: ${errorMessage(err)}`);
    }

    try {
      const res = await apiGet<AuditTrailResponse>(
        `/api/audit-trail?case_id=${encodeURIComponent(caseDetail.case_id)}&limit=100`
      );
      auditLogs = res.entries || [];
    } catch (err) {
      // The audit-trail endpoint may not exist yet; the dossier is still
      // exportable, but say so rather than silently omitting the section.
      problems.push(
        isNotImplemented(err) ? `audit trail: ${t.common.endpointMissing}` : `audit trail: ${errorMessage(err)}`
      );
    }

    if (problems.length > 0) setActionError(problems.join(' · '));

    printOrExportAuditDossier({
      caseDetail,
      analysisResult: activeWorkflow?.result ?? undefined,
      reviews,
      auditLogs,
    });
  };

  const downloadMarkdownReport = () => {
    if (!activeWorkflow?.report_markdown) return;
    const blob = new Blob([activeWorkflow.report_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${caseDetail?.case_id || 'case'}-exception-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered cases list based on search and status
  const filteredCases = cases.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.case_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.readiness === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // -------------------------------------------------------------------------
  // Render: List View
  // -------------------------------------------------------------------------
  if (!activeCaseId || !caseDetail) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">{t.cases.title}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              {t.cases.subtitle}
            </p>
          </div>
          <button
            id="create-case-toggle-btn"
            onClick={() => setCreateFormOpen(!createFormOpen)}
            className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-sm hover:bg-neutral-800 dark:hover:bg-white transition-colors shadow-xs cursor-pointer"
          >
            {createFormOpen ? t.common.cancel : `+ ${t.cases.newCaseBtn}`}
          </button>
        </div>

        {(detailError || actionError) && (
          <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 break-words">{detailError || actionError}</div>
            <button
              onClick={() => {
                setDetailError(null);
                setActionError(null);
              }}
              className="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-neutral-400 dark:text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t.cases.searchPlaceholder}
              className="w-full pl-9 pr-3.5 py-1.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">{lang === 'vi' ? 'Trạng thái' : 'Status'}:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800 focus:bg-white dark:focus:bg-neutral-700 focus:outline-hidden font-medium text-neutral-800 dark:text-neutral-200 w-full sm:w-auto"
            >
              <option value="ALL">{t.cases.filterAll} ({cases.length})</option>
              <option value="complete">{t.cases.filterReady} ({cases.filter(c => c.readiness === 'complete').length})</option>
              <option value="limited">{lang === 'vi' ? 'Thiếu tài liệu' : 'Limited (Partial Pack)'} ({cases.filter(c => c.readiness === 'limited').length})</option>
              <option value="blocked">{lang === 'vi' ? 'Bị khóa (Chưa đủ điều kiện)' : 'Blocked (Missing Docs)'} ({cases.filter(c => c.readiness === 'blocked').length})</option>
            </select>
          </div>
        </div>

        {/* Create Case Form Expander */}
        {createFormOpen && (
          <form
            onSubmit={handleCreateCase}
            className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-4"
          >
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{t.cases.newCaseModalTitle}</h3>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                {lang === 'vi' ? 'Tên hồ sơ đối soát' : 'Case Name'}
              </label>
              <input
                type="text"
                value={newCaseName}
                onChange={e => setNewCaseName(e.target.value)}
                placeholder={t.cases.caseNameInputPlaceholder}
                className="w-full px-3.5 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateFormOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={creating || !newCaseName.trim()}
                className="px-4 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-white disabled:opacity-50 cursor-pointer"
              >
                {creating ? t.common.loading : t.cases.createAndUploadBtn}
              </button>
            </div>
          </form>
        )}

        {/* Cases List */}
        {filteredCases.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            <h4 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              {cases.length === 0 ? t.cases.noCasesFound : (lang === 'vi' ? 'Không tìm thấy hồ sơ phù hợp' : 'No matching audit cases found')}
            </h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {cases.length === 0
                ? t.cases.createFirstCase
                : (lang === 'vi' ? 'Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái.' : 'Try adjusting your search query or status filter.')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCases.map(c => (
              <div
                key={c.case_id}
                className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs hover:border-neutral-300 dark:hover:border-neutral-700 transition-all flex items-center justify-between"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">{c.name}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                    {c.document_count} {lang === 'vi' ? 'tài liệu' : 'documents'} · {lang === 'vi' ? 'cập nhật' : 'updated'} {c.updated_at ? c.updated_at.slice(0, 10) : 'recent'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <ReadinessChip readiness={c.readiness} />
                    <span className="text-xs text-neutral-600 dark:text-neutral-400 font-medium">
                      {c.open_review_count} {lang === 'vi' ? 'sai lệch' : 'open finding(s)'}
                    </span>
                  </div>
                  <button
                    id={`open-case-btn-${c.case_id}`}
                    onClick={() => onSelectCase(c.case_id)}
                    className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-white transition-colors cursor-pointer shadow-xs"
                  >
                    {lang === 'vi' ? 'Mở hồ sơ' : 'Open Case'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Focused Case Detail Workspace
  // -------------------------------------------------------------------------
  const typesPresent = new Set(caseDetail.document_types || []);
  const checklist = ['contract', 'invoice', 'purchase_order', 'policy'] as const;

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-8">
      {/* Top Header */}
      <div>
        <button
          onClick={() => onSelectCase(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white mb-3 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'vi' ? 'Quay lại danh sách hồ sơ' : 'Back to Cases'}</span>
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">{caseDetail.name}</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">{lang === 'vi' ? 'Mã hồ sơ' : 'Case ID'}: {caseDetail.case_id}</p>
          </div>
          <ReadinessChip readiness={caseDetail.readiness} />
        </div>
      </div>

      {/* Real API errors, never swallowed */}
      {(detailError || actionError) && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 break-words">{detailError || actionError}</div>
          <button
            onClick={() => {
              setDetailError(null);
              setActionError(null);
            }}
            className="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4-Document Pack Checklist */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {checklist.map(docType => {
          const complete = typesPresent.has(docType);
          return (
            <div
              key={docType}
              className={`p-3.5 rounded-lg border flex items-center gap-2.5 text-sm font-semibold transition-colors ${
                complete
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-neutral-50 dark:bg-neutral-850 border-neutral-200 dark:border-neutral-800 text-neutral-400 dark:text-neutral-500'
              }`}
            >
              {complete ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-neutral-300 dark:text-neutral-600 shrink-0" />
              )}
              <span>{docLabels[docType]}</span>
            </div>
          );
        })}
      </div>

      {/* Readiness Banner */}
      {caseDetail.readiness === 'blocked' ? (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>
            {lang === 'vi'
              ? 'Hồ sơ chưa đủ điều kiện đối soát: Cần tải lên tối thiểu 1 Hợp đồng và 1 Hóa đơn hoặc Đơn đặt hàng để kích hoạt.'
              : 'Blocked: Pack requires at least Contract + Invoice or PO to perform cross-reconciliation.'}
          </span>
        </div>
      ) : caseDetail.readiness === 'limited' ? (
        <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            {lang === 'vi'
              ? `Hồ sơ có thể đối soát một phần. Còn thiếu các loại chứng từ: ${caseDetail.missing_document_types.map(t => docLabels[t]).join(', ')}`
              : `Partial pack ready. Missing recommended documents: ${caseDetail.missing_document_types.map(t => docLabels[t]).join(', ')}`}
          </span>
        </div>
      ) : (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            {lang === 'vi'
              ? 'Bộ 4 chứng từ hoàn chỉnh, đủ điều kiện để đối soát chéo toàn bộ.'
              : 'Complete 4-document pack ready for full cross-document reconciliation.'}
          </span>
        </div>
      )}

      {/* STEP 1: Add Document Pack with Drag & Drop Dropzone */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-neutral-900 dark:text-white">
          {lang === 'vi' ? 'Bước 1: Tải lên hồ sơ chứng từ' : 'Step 1: Ingest Document Pack'}
        </h2>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`p-8 rounded-xl border-2 border-dashed text-center space-y-3 transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 scale-[1.01] shadow-md'
              : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-400 dark:hover:border-neutral-600'
          }`}
        >
          <UploadCloud className={`w-10 h-10 mx-auto transition-colors ${isDragging ? 'text-blue-600 scale-110' : 'text-neutral-400 dark:text-neutral-500'}`} />
          <div>
            <p className="text-sm font-bold text-neutral-900 dark:text-white">
              {isDragging
                ? (lang === 'vi' ? 'Thả tệp vào đây để tải lên...' : 'Drop files here to upload...')
                : (lang === 'vi' ? 'Kéo thả tệp chứng từ vào đây hoặc duyệt tệp từ máy tính' : 'Drag & drop audit documents here, or click to browse')}
            </p>
            <div className="mt-2">
              <label className="cursor-pointer inline-block px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-white text-white dark:text-neutral-900 font-semibold text-xs transition-colors shadow-xs">
                {t.cases.browseFilesBtn}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv"
                  onChange={handleFileSelection}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-2">
              {lang === 'vi' ? 'Hỗ trợ định dạng PDF, DOCX, TXT, Markdown, CSV (Tự động bóc tách & phân loại chứng từ)' : 'Supported: PDF, DOCX, TXT, Markdown, CSV (with auto-classification)'}
            </p>
          </div>
        </div>

        {/* Selected files preview table */}
        {selectedFiles.length > 0 && (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{lang === 'vi' ? `Tệp đã chọn & Tự động gán nhãn (${selectedFiles.length})` : `Selected Files & Smart Type Ingestion (${selectedFiles.length})`}</span>
              </span>
              <button
                onClick={() => setSelectedFiles([])}
                className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
              >
                {t.cases.clearSelectedFiles}
              </button>
            </div>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {selectedFiles.map((item, idx) => {
                const inferred = inferDocTypeWithConfidence(item.file.name, lang);
                return (
                  <div key={idx} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900 dark:text-white truncate">{item.file.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                            {inferred.confidence}% {lang === 'vi' ? 'Tự động' : 'Auto-Detected'}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
                          {(item.file.size / 1024).toFixed(1)} KB · {inferred.reason}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <div className="flex items-center gap-1">
                        {(['contract', 'invoice', 'purchase_order', 'policy'] as DocumentType[]).map(tType => (
                          <button
                            key={tType}
                            type="button"
                            onClick={() => {
                              const next = [...selectedFiles];
                              next[idx].type = tType;
                              setSelectedFiles(next);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                              item.type === tType
                                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                            }`}
                          >
                            {docLabels[tType]}
                          </button>
                        ))}
                      </div>

                      <select
                        value={item.type}
                        onChange={e => {
                          const next = [...selectedFiles];
                          next[idx].type = e.target.value as DocumentType;
                          setSelectedFiles(next);
                        }}
                        className="text-xs border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium"
                      >
                        <option value="contract">{docLabels.contract}</option>
                        <option value="invoice">{docLabels.invoice}</option>
                        <option value="purchase_order">{docLabels.purchase_order}</option>
                        <option value="policy">{docLabels.policy}</option>
                        <option value="other">{docLabels.other}</option>
                      </select>
                      <button
                        onClick={() => {
                          setSelectedFiles(selectedFiles.filter((_, i) => i !== idx));
                        }}
                        className="p-1 text-neutral-400 hover:text-red-600 rounded cursor-pointer"
                        title={lang === 'vi' ? 'Xóa tệp' : 'Remove file'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 bg-neutral-50 dark:bg-neutral-850 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
              <button
                id="upload-pack-btn"
                onClick={handleUploadPack}
                disabled={uploading}
                className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-white disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {uploading ? t.cases.runningAuditBtn : (lang === 'vi' ? `Tải lên ${selectedFiles.length} tài liệu` : `Upload ${selectedFiles.length} File(s)`)}
              </button>
            </div>
          </div>
        )}

        {uploadMessage && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{uploadMessage}</span>
          </div>
        )}

        {/* Existing documents with Quick Peek */}
        {caseDetail.documents && caseDetail.documents.length > 0 && (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {lang === 'vi' ? `Tài liệu trong hồ sơ (${caseDetail.documents.length})` : `Documents in Pack (${caseDetail.documents.length})`}
                </h3>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  {lang === 'vi' ? 'Bấm vào tài liệu để xem nhanh chi tiết hoặc mở chế độ so khớp đối chiếu' : 'Click any document to inspect details or launch split reconciliation'}
                </span>
              </div>
              {caseDetail.documents.length >= 2 && (
                <button
                  id="open-split-viewer-btn"
                  onClick={() => setSplitViewerConfig({
                    open: true,
                    leftDocId: caseDetail.documents![0]?.document_id,
                    rightDocId: caseDetail.documents![1]?.document_id,
                  })}
                  className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-white text-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Columns className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
                  <span>{lang === 'vi' ? 'So khớp song song' : 'Side-by-Side Split'}</span>
                </button>
              )}
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {caseDetail.documents.map(d => (
                <div
                  key={d.document_id}
                  className="py-2.5 px-2 -mx-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors flex items-center justify-between text-xs group"
                >
                  <div
                    onClick={() => handleOpenPeek(d.document_id)}
                    className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
                  >
                    <div className="w-7 h-7 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-950 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors truncate">{d.filename}</span>
                        <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-mono text-[10px] shrink-0 border border-neutral-200 dark:border-neutral-700">
                          {docLabels[d.document_type] || d.document_type}
                        </span>
                      </div>
                      <div className="text-neutral-400 dark:text-neutral-500 font-mono text-[10px] mt-0.5">
                        SHA-256: {d.sha256.slice(0, 10)}... · {(d.size_bytes / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-400 shrink-0">
                    {caseDetail.documents && caseDetail.documents.length >= 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const otherDoc = caseDetail.documents!.find(other => other.document_id !== d.document_id);
                          setSplitViewerConfig({
                            open: true,
                            leftDocId: d.document_id,
                            rightDocId: otherDoc?.document_id,
                          });
                        }}
                        className="px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                        title="Compare this document side-by-side"
                      >
                        <Columns className="w-3 h-3 text-neutral-500" />
                        <span className="hidden sm:inline">{lang === 'vi' ? 'So sánh' : 'Compare'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenPeek(d.document_id)}
                      className="px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{lang === 'vi' ? 'Xem nhanh' : 'Inspect'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick Peek: loading / failure states */}
      {(loadingPeek || peekError) && !peekDoc && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-md w-full p-6 space-y-3">
            {loadingPeek ? (
              <div className="text-xs text-neutral-600 dark:text-neutral-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-neutral-900 dark:bg-neutral-100 animate-ping" />
                <span>{t.common.loading}</span>
              </div>
            ) : (
              <>
                <div className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{t.common.loadFailed}</span>
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-300 break-words">{peekError}</div>
              </>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setPeekError(null);
                  setLoadingPeek(false);
                }}
                className="px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Peek Modal */}
      {peekDoc && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate">{peekDoc.detail.filename}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="capitalize font-semibold text-neutral-700 dark:text-neutral-300">
                      {docLabels[peekDoc.detail.document_type] || peekDoc.detail.document_type}
                    </span>
                    <span>·</span>
                    <span>{(peekDoc.detail.size_bytes / 1024).toFixed(1)} KB</span>
                    <span>·</span>
                    <span className="font-mono">{peekDoc.detail.status}</span>
                    <span>·</span>
                    <span>{peekDoc.detail.chunk_count} {lang === 'vi' ? 'đoạn' : 'chunks'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPeekDoc(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Metadata Bar */}
              <div className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                  <Hash className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">SHA-256:</span>
                  <span className="select-all">{peekDoc.detail.sha256}</span>
                </div>
                <button
                  onClick={handleCopySha256}
                  className="px-2.5 py-1 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-md font-semibold text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedHash ? (lang === 'vi' ? 'Đã sao chép!' : 'Copied!') : (lang === 'vi' ? 'Sao chép mã băm' : 'Copy Hash')}</span>
                </button>
              </div>

              {/* Parser metadata reported by GET /api/documents/{id} */}
              <div>
                <h4 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                  {lang === 'vi' ? 'Siêu dữ liệu bóc tách' : 'Parser Metadata'}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  {[
                    ['mime_type', peekDoc.detail.mime_type],
                    ['parser_version', peekDoc.detail.parser_version],
                    ['page_count', peekDoc.detail.page_count ?? '—'],
                    ['element_count', peekDoc.detail.element_count],
                    ['chunk_count', peekDoc.detail.chunk_count],
                    ['status', peekDoc.detail.status],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800">
                      <span className="text-[10px] uppercase font-bold text-neutral-400 dark:text-neutral-500 block">
                        {String(k).replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono font-semibold text-neutral-900 dark:text-white mt-0.5 block truncate">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
                {peekDoc.detail.error_message && (
                  <div className="mt-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-[11px]">
                    {peekDoc.detail.error_message}
                  </div>
                )}
              </div>

              {/* Parsed text, reassembled from the indexed chunks */}
              <div>
                <h4 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                  {lang === 'vi' ? 'Toàn văn đã bóc tách (từ các đoạn đã lập chỉ mục)' : 'Parsed Text (reassembled from indexed chunks)'}
                </h4>
                <div className="p-4 rounded-xl bg-neutral-900 dark:bg-neutral-950 text-neutral-100 border border-neutral-800 font-mono text-xs leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap select-text">
                  {peekDoc.text || (lang === 'vi' ? 'Tài liệu này chưa có đoạn văn bản nào được lập chỉ mục.' : 'No indexed chunks for this document.')}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 flex items-center justify-between gap-3">
              {caseDetail.documents && caseDetail.documents.length >= 2 ? (
                <button
                  onClick={() => {
                    const otherDoc = caseDetail.documents!.find(d => d.document_id !== peekDoc.detail.document_id);
                    setSplitViewerConfig({
                      open: true,
                      leftDocId: peekDoc.detail.document_id,
                      rightDocId: otherDoc?.document_id,
                    });
                    setPeekDoc(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Columns className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{lang === 'vi' ? 'Mở cửa sổ so khớp đối chiếu' : 'Open in Split Reconciliation Viewer'}</span>
                </button>
              ) : <div />}
              <button
                onClick={() => setPeekDoc(null)}
                className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs hover:bg-neutral-800 dark:hover:bg-white transition-colors cursor-pointer"
              >
                {lang === 'vi' ? 'Đóng xem nhanh' : 'Close Preview'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Analyze Case */}
      <div className="space-y-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <h2 className="text-base font-bold text-neutral-900 dark:text-white">
          {lang === 'vi' ? 'Bước 2: Thẩm tra tự động & Phát hiện sai lệch' : 'Step 2: Automated Multi-Doc Cross-Audit'}
        </h2>

        <div className="flex items-center gap-3">
          <button
            id="analyze-case-btn"
            onClick={handleRunAnalysis}
            disabled={
              analyzing ||
              caseDetail.readiness === 'blocked' ||
              activeWorkflow?.status === 'running' ||
              activeWorkflow?.status === 'queued'
            }
            className="px-6 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-sm hover:bg-neutral-800 dark:hover:bg-white disabled:opacity-50 transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{t.cases.runDeepAuditBtn}</span>
          </button>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {lang === 'vi' ? 'Quy trình đối soát liên tài liệu: bóc tách số liệu, đối chiếu bảng giá, kiểm tra thuế VAT và băm chứng cứ.' : 'Deterministic multi-doc pipeline: extraction, rate-card reconciliation, VAT validation, and SHA-256 integrity.'}
          </span>
        </div>

        {/* Active Analysis Progress: progress_percent, current_step and steps
            all come from GET /api/workflows/{id} while the run is in flight. */}
        {activeWorkflow && (activeWorkflow.status === 'running' || activeWorkflow.status === 'queued') && (
          <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-800 dark:text-neutral-200">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-neutral-900 dark:bg-neutral-100 animate-ping" />
                <span>
                  {activeWorkflow.current_step ||
                    (activeWorkflow.status === 'queued'
                      ? lang === 'vi'
                        ? 'Đang chờ trong hàng đợi...'
                        : 'Queued...'
                      : lang === 'vi'
                        ? 'Đang thực thi...'
                        : 'Running...')}
                </span>
              </span>
              <span className="font-mono">{activeWorkflow.progress_percent ?? 0}%</span>
            </div>
            <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-900 dark:bg-neutral-100 transition-all duration-300"
                style={{ width: `${activeWorkflow.progress_percent ?? 0}%` }}
              />
            </div>
            {activeWorkflow.steps && activeWorkflow.steps.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {activeWorkflow.steps.map(s => (
                  <div key={s.step} className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                    {s.status === 'completed' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : s.status === 'failed' ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : s.status === 'running' ? (
                      <span className="w-2 h-2 rounded-full bg-neutral-900 dark:bg-neutral-100 animate-ping" />
                    ) : (
                      <Circle className="w-3 h-3 text-neutral-300 dark:text-neutral-600" />
                    )}
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Failed run: surface the backend's own error strings. */}
        {activeWorkflow && activeWorkflow.status === 'failed' && (
          <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>{lang === 'vi' ? 'Quy trình thẩm định thất bại' : 'Analysis workflow failed'}</span>
            </div>
            {(activeWorkflow.errors || []).map((e, i) => (
              <div key={i} className="font-mono break-words">{e}</div>
            ))}
          </div>
        )}

        {/* Completed Analysis Report */}
        {activeWorkflow && activeWorkflow.status === 'completed' && activeWorkflow.result && (
          <div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-6 shadow-xs">
            {/* 4 Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">{lang === 'vi' ? 'Tài liệu đã thẩm tra' : 'Docs Analyzed'}</div>
                <div className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
                  {activeWorkflow.result.documents_analyzed?.length || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">{lang === 'vi' ? 'Sai lệch nghiêm trọng' : 'High Severity'}</div>
                <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {activeWorkflow.result.issues?.filter((i: any) => i.severity === 'high').length || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">{lang === 'vi' ? 'Lỗi trích xuất' : 'Extraction Failures'}</div>
                <div className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
                  {activeWorkflow.result.extraction_failures?.length || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">{lang === 'vi' ? 'Kiểm toán viên duyệt' : 'Human Review'}</div>
                <div className={`text-xl font-bold mt-1 ${activeWorkflow.requires_review ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {activeWorkflow.requires_review ? (lang === 'vi' ? 'Yêu cầu duyệt' : 'Required') : (lang === 'vi' ? 'Tự động duyệt' : 'Passed')}
                </div>
              </div>
            </div>

            {/* Summary narrative */}
            <div className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed">
              {activeWorkflow.result.summary}
            </div>

            {/* Discrepancy Findings by Severity */}
            {activeWorkflow.result.issues && activeWorkflow.result.issues.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  {lang === 'vi' ? 'Phát hiện sai lệch & Chứng cứ đối chiếu' : 'Discrepancy Findings & Evidence'}
                </h3>
                <div className="space-y-3">
                  {activeWorkflow.result.issues.map((issue: Discrepancy, index: number) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={issue.severity} />
                        <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                          {issue.type.replace(/_/g, ' ').toUpperCase()}
                        </h4>
                      </div>
                      <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">{issue.description}</p>

                      {/* Calculation Box if present */}
                      {issue.calculation && (
                        <div className="p-2.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-mono flex items-start gap-2 border border-neutral-200 dark:border-neutral-700">
                          <Calculator className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                          <div>
                            <div>{lang === 'vi' ? 'Công thức' : 'Formula'}: {issue.calculation.formula}</div>
                            <div className="text-neutral-500 dark:text-neutral-400">{lang === 'vi' ? 'Chênh lệch' : 'Difference'}: {issue.calculation.result}</div>
                          </div>
                        </div>
                      )}

                      {/* Evidence snippets */}
                      {issue.evidence && issue.evidence.length > 0 && (
                        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                              {lang === 'vi' ? 'Chứng cứ trích dẫn' : 'Evidence Sources'} ({issue.evidence.length})
                            </div>
                            <button
                              onClick={() => {
                                const doc1 = caseDetail.documents?.find(d => d.filename === issue.evidence![0]?.filename);
                                const doc2 = caseDetail.documents?.find(d => d.filename === issue.evidence![1]?.filename) ||
                                             caseDetail.documents?.find(d => d.document_id !== doc1?.document_id);
                                setSplitViewerConfig({
                                  open: true,
                                  leftDocId: doc1?.document_id || caseDetail.documents![0]?.document_id,
                                  rightDocId: doc2?.document_id || caseDetail.documents![1]?.document_id,
                                  finding: issue,
                                });
                              }}
                              className="px-2.5 py-1 rounded-md bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-white text-white dark:text-neutral-900 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                            >
                              <Columns className="w-3 h-3 text-emerald-400 dark:text-emerald-600" />
                              <span>{lang === 'vi' ? 'Mở so khớp chứng cứ' : 'Compare in Split Viewer'}</span>
                            </button>
                          </div>
                          {issue.evidence.map((ev, ei) => (
                            <div key={ei} className="text-xs bg-neutral-50 dark:bg-neutral-850 p-2 rounded border border-neutral-100 dark:border-neutral-800">
                              <span className="font-semibold text-neutral-800 dark:text-neutral-200">{ev.filename}</span>
                              {ev.page_number && <span className="text-neutral-500 dark:text-neutral-400"> · {lang === 'vi' ? 'trang' : 'p.'} {ev.page_number}</span>}
                              {ev.snippet && <p className="text-neutral-600 dark:text-neutral-400 mt-0.5 italic">"{ev.snippet}"</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <button
                  id="review-findings-btn"
                  onClick={() => onNavigateToReviews(caseDetail.case_id)}
                  className="px-5 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs hover:bg-neutral-800 dark:hover:bg-white transition-colors cursor-pointer shadow-xs"
                >
                  {lang === 'vi' ? `Xem & Xử lý ${activeWorkflow.result.issues?.length || 0} sai lệch` : `Review ${activeWorkflow.result.issues?.length || 0} Finding(s)`}
                </button>

                <button
                  id="export-dossier-btn"
                  onClick={handleExportAuditDossier}
                  title={lang === 'vi' ? 'In hoặc xuất hồ sơ kiểm toán' : 'Print or export the audit dossier'}
                  className="px-4 py-2 rounded-lg bg-emerald-700 dark:bg-emerald-800 text-white font-semibold text-xs hover:bg-emerald-800 dark:hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-200" />
                  <span>{t.cases.exportDossierBtn}</span>
                </button>
              </div>

              <button
                id="download-report-btn"
                onClick={downloadMarkdownReport}
                className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t.cases.downloadMarkdownBtn}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Case Settings / Delete */}
      <div className="pt-6 border-t border-neutral-200 dark:border-neutral-800">
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {lang === 'vi' ? 'Quản lý & Thiết lập Hồ sơ' : 'Case Settings & Danger Zone'}
          </h3>
          <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-700"
            />
            <span>{t.cases.confirmDeletePrompt}</span>
          </label>
          <button
            onClick={handleDeleteCase}
            disabled={!deleteConfirm}
            className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t.cases.deleteCaseBtn}</span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Split Document Viewer Modal */}
      {splitViewerConfig.open && caseDetail.documents && (
        <DocumentSplitViewer
          documents={caseDetail.documents}
          initialLeftDocId={splitViewerConfig.leftDocId}
          initialRightDocId={splitViewerConfig.rightDocId}
          finding={splitViewerConfig.finding}
          caseId={caseDetail.case_id}
          onClose={() => setSplitViewerConfig({ open: false })}
          onApproveFinding={async (finding) => {
            onNavigateToReviews(caseDetail.case_id);
          }}
        />
      )}
    </div>
  );
}
