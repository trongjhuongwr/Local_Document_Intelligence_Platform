import React, { useState, useEffect } from 'react';
import { 
  History, 
  ShieldCheck, 
  Search, 
  Filter, 
  Download, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Play, 
  FolderOpen, 
  KeyRound, 
  Calendar, 
  User, 
  ExternalLink, 
  RefreshCw, 
  Copy, 
  Check, 
  AlertCircle, 
  Hash, 
  ShieldAlert, 
  Layers,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { AuditTrailEntry, AuditTrailResponse, CaseItem, AuditAction } from '../types';
import { apiGet, apiPost, errorMessage, isNotImplemented } from '../api';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface AuditTrailViewProps {
  cases: CaseItem[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  onNavigateToCase: (caseId: string) => void;
}

export function AuditTrailView({
  cases,
  selectedCaseId,
  onSelectCase,
  onNavigateToCase
}: AuditTrailViewProps) {
  const { lang, t } = useThemeLanguage();
  const [entries, setEntries] = useState<AuditTrailEntry[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [chainValid, setChainValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chainNote, setChainNote] = useState<string | null>(null);
  const [chainAlgorithm, setChainAlgorithm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [activeCaseFilter, setActiveCaseFilter] = useState<string>(selectedCaseId || 'ALL');
  const [selectedEntry, setSelectedEntry] = useState<AuditTrailEntry | null>(null);
  
  // Attestation modal
  const [attestationModalOpen, setAttestationModalOpen] = useState(false);
  const [attestActor, setAttestActor] = useState(lang === 'vi' ? 'Kiểm toán viên phụ trách' : 'Lead Auditor');
  const [attestCaseId, setAttestCaseId] = useState(selectedCaseId || (cases[0]?.case_id || ''));
  const [attestDetails, setAttestDetails] = useState('');
  const [submittingAttest, setSubmittingAttest] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchAuditTrail = () => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (activeCaseFilter && activeCaseFilter !== 'ALL') {
      params.append('case_id', activeCaseFilter);
    }
    if (filterAction && filterAction !== 'ALL') {
      params.append('action', filterAction);
    }
    if (searchQuery.trim()) {
      params.append('search', searchQuery.trim());
    }
    params.append('limit', '200');

    apiGet<AuditTrailResponse>(`/api/audit-trail?${params.toString()}`)
      .then(data => {
        setEntries(data.entries || []);
        setTotalRecords(data.total || 0);
        // Only claim the hash chain is valid when the backend says so.
        setChainValid(data.chain_valid === true);
        setChainNote(data.chain_note ?? null);
        setChainAlgorithm(data.chain_algorithm ?? null);
      })
      .catch(err => {
        // Honest empty state: no synthesised ledger entries, ever.
        setEntries([]);
        setTotalRecords(0);
        setChainValid(false);
        setLoadError(isNotImplemented(err) ? t.common.endpointMissing : errorMessage(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAuditTrail();
  }, [activeCaseFilter, filterAction, searchQuery]);

  // Sync prop changes
  useEffect(() => {
    if (selectedCaseId) {
      setActiveCaseFilter(selectedCaseId);
      setAttestCaseId(selectedCaseId);
    }
  }, [selectedCaseId]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleCreateAttestation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attestDetails.trim()) return;

    setSubmittingAttest(true);
    try {
      await apiPost('/api/audit-trail', {
        case_id: attestCaseId || undefined,
        actor: attestActor.trim(),
        details: attestDetails.trim(),
        metadata: {
          attestation_scope: 'Financial & contractual discrepancy reconciliation',
        },
      });
      showToast(lang === 'vi' ? 'Đã ghi nhận chứng thực vào sổ cái' : 'Attestation recorded to the ledger');
      setAttestDetails('');
      setAttestationModalOpen(false);
      fetchAuditTrail();
    } catch (err) {
      showToast(isNotImplemented(err) ? t.common.endpointMissing : errorMessage(err));
    } finally {
      setSubmittingAttest(false);
    }
  };

  const handleExport = (format: 'json' | 'csv') => {
    const caseParam = activeCaseFilter !== 'ALL' ? `?case_id=${activeCaseFilter}&format=${format}` : `?format=${format}`;
    window.location.href = `/api/audit-trail/export${caseParam}`;
  };

  const getActionBadge = (action: AuditAction) => {
    switch (action) {
      case 'DOCUMENT_INGESTED':
        return { label: lang === 'vi' ? 'Nạp tài liệu' : 'Doc Ingested', bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800', icon: FileText };
      case 'WORKFLOW_STARTED':
        return { label: lang === 'vi' ? 'Bắt đầu kiểm toán' : 'Audit Started', bg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800', icon: Play };
      case 'WORKFLOW_COMPLETED':
        return { label: lang === 'vi' ? 'Hoàn tất kiểm toán' : 'Audit Completed', bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800', icon: CheckCircle2 };
      case 'FINDING_APPROVED':
        return { label: lang === 'vi' ? 'Đã phê duyệt' : 'Approved', bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', icon: CheckCircle2 };
      case 'FINDING_REJECTED':
        return { label: lang === 'vi' ? 'Bác bỏ / Ngoại lệ' : 'Rejected / Exception', bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800', icon: XCircle };
      case 'FINDING_RESOLVED':
        return { label: lang === 'vi' ? 'Đã giải quyết' : 'Resolved', bg: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800', icon: CheckCircle2 };
      case 'FINDING_BATCH_ACTION':
        return { label: lang === 'vi' ? 'Xử lý hàng loạt' : 'Batch Action', bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', icon: Layers };
      case 'CASE_CREATED':
        return { label: lang === 'vi' ? 'Tạo hồ sơ' : 'Case Created', bg: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700', icon: FolderOpen };
      case 'WORKFLOW_FAILED':
        return { label: lang === 'vi' ? 'Kiểm toán thất bại' : 'Audit Failed', bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800', icon: XCircle };
      case 'QUERY_EXECUTED':
        return { label: lang === 'vi' ? 'Truy vấn hỏi đáp' : 'Query Executed', bg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800', icon: Search };
      case 'FINDING_FLAGGED':
        return { label: lang === 'vi' ? 'Ghi nhận bất thường' : 'Finding Flagged', bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', icon: AlertCircle };
      case 'MANUAL_ATTESTATION':
        return { label: lang === 'vi' ? 'Xác nhận kiểm toán' : 'Auditor Sign-off', bg: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 font-bold', icon: ShieldCheck };
      default:
        return { label: action, bg: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700', icon: History };
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50/50 dark:bg-neutral-950">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-neutral-900/95 dark:bg-neutral-100/95 text-white dark:text-neutral-900 text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-neutral-700 dark:border-neutral-200 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-5 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  {t.audit.title}
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 font-mono">
                    <KeyRound className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                    SHA-256
                  </span>
                </h1>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {t.audit.subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setAttestationModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.audit.recordSignOff}</span>
            </button>

            <div className="flex items-center rounded-xl bg-neutral-100 dark:bg-neutral-800 p-0.5 border border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => handleExport('csv')}
                className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-white dark:hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                title="Export as CSV spreadsheet"
              >
                CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-white dark:hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                title="Export as JSON audit ledger"
              >
                JSON
              </button>
            </div>

            <button
              onClick={fetchAuditTrail}
              className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer"
              title="Refresh ledger records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-neutral-900 dark:text-white' : ''}`} />
            </button>
          </div>
        </div>

        {/* Cryptographic Ledger Summary Status */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${chainValid ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'}`}>
                {chainValid ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{t.audit.cryptoIntegrity}</p>
                <p className="text-xs font-bold text-neutral-900 dark:text-white">
                  {loadError ? '—' : chainValid ? t.audit.chainValid : t.audit.chainInvalid}
                </p>
              </div>
            </div>
            <span
              className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 cursor-help"
              title={chainNote ?? undefined}
            >
              SHA-256
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                <Hash className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{t.audit.totalEvents}</p>
                <p className="text-xs font-bold text-neutral-900 dark:text-white">
                  {totalRecords} {lang === 'vi' ? 'sự kiện' : 'events'}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {lang === 'vi' ? 'Theo bộ lọc' : 'Matching filters'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{t.audit.complianceStandard}</p>
                <p className="text-xs font-bold text-neutral-900 dark:text-white font-mono">
                  {chainAlgorithm ?? 'sha256'}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              {lang === 'vi' ? 'Tính khi đọc' : 'Computed on read'}
            </span>
          </div>
        </div>

        {/* The backend's own statement of what this digest does and does not
            guarantee. Shown verbatim so the UI never overstates it. */}
        {chainNote && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-300 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{chainNote}</span>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={lang === 'vi' ? 'Tìm kiếm chi tiết sự kiện, người thực hiện, mã băm SHA-256 hoặc hồ sơ...' : 'Search event details, actor, SHA-256 hash or case...'}
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 dark:focus:border-neutral-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Case filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{t.cases.case}:</span>
            <select
              value={activeCaseFilter}
              onChange={e => setActiveCaseFilter(e.target.value)}
              className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            >
              <option value="ALL">{lang === 'vi' ? `Tất cả hồ sơ (${cases.length})` : `All Cases (${cases.length})`}</option>
              {cases.map(c => (
                <option key={c.case_id} value={c.case_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Action filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{t.audit.action}:</span>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            >
              <option value="ALL">{t.audit.allActions}</option>
              <option value="DOCUMENT_INGESTED">{lang === 'vi' ? 'Nạp tài liệu' : 'Document Ingested'}</option>
              <option value="WORKFLOW_STARTED">{lang === 'vi' ? 'Bắt đầu kiểm toán' : 'Workflow Started'}</option>
              <option value="WORKFLOW_COMPLETED">{lang === 'vi' ? 'Hoàn tất kiểm toán' : 'Workflow Completed'}</option>
              <option value="WORKFLOW_FAILED">{lang === 'vi' ? 'Kiểm toán thất bại' : 'Workflow Failed'}</option>
              <option value="QUERY_EXECUTED">{lang === 'vi' ? 'Truy vấn hỏi đáp' : 'Query Executed'}</option>
              <option value="FINDING_FLAGGED">{lang === 'vi' ? 'Ghi nhận bất thường' : 'Finding Flagged'}</option>
              <option value="FINDING_APPROVED">{lang === 'vi' ? 'Phê duyệt bất thường' : 'Finding Approved'}</option>
              <option value="FINDING_REJECTED">{lang === 'vi' ? 'Bác bỏ bất thường' : 'Finding Rejected'}</option>
              <option value="MANUAL_ATTESTATION">{lang === 'vi' ? 'Xác nhận kiểm toán viên' : 'Auditor Sign-off'}</option>
              <option value="CASE_CREATED">{lang === 'vi' ? 'Tạo mới hồ sơ' : 'Case Created'}</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Content: Timeline & Entries Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-400 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-neutral-900 dark:text-white" />
            <p className="text-xs font-medium">{lang === 'vi' ? 'Đang xác minh chuỗi băm mã hóa & tải dữ liệu sổ cái...' : 'Verifying cryptographic hash chain & loading ledger...'}</p>
          </div>
        ) : loadError ? (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-rose-200 dark:border-rose-800 p-12 text-center max-w-lg mx-auto mt-8 space-y-3">
            <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
            <h3 className="text-sm font-bold text-rose-800 dark:text-rose-300">{t.common.apiUnavailable}</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 break-words">{loadError}</p>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {lang === 'vi'
                ? 'Không hiển thị dữ liệu sổ cái nào cho tới khi API trả về bản ghi thật.'
                : 'No ledger data is shown until the API returns real records.'}
            </p>
            <button
              onClick={fetchAuditTrail}
              className="px-3.5 py-2 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold cursor-pointer"
            >
              {t.common.retry}
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-12 text-center max-w-lg mx-auto mt-8">
            <History className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{t.audit.noEvents}</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {lang === 'vi' ? 'Không có sự kiện sổ cái nào khớp với tiêu chí lọc. Thử xóa bộ lọc hoặc tạo xác nhận kiểm toán mới.' : 'No ledger events matched your filter criteria. Try clearing filters or recording a new auditor sign-off.'}
            </p>
            <button
              onClick={() => {
                setActiveCaseFilter('ALL');
                setFilterAction('ALL');
                setSearchQuery('');
              }}
              className="mt-4 px-3.5 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              {lang === 'vi' ? 'Xóa tất cả bộ lọc' : 'Clear All Filters'}
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-6xl mx-auto">
            {entries.map((entry) => {
              const badge = getActionBadge(entry.action);
              const IconComp = badge.icon;
              const formattedTime = new Date(entry.timestamp).toLocaleString(lang === 'vi' ? 'vi-VN' : undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={entry.log_id}
                  onClick={() => setSelectedEntry(entry)}
                  className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-xs transition-all p-4 cursor-pointer"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Event Type & Description */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 border ${badge.bg}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.bg}`}>
                            {badge.label}
                          </span>

                          {entry.case_name && (
                            <span 
                              onClick={e => {
                                e.stopPropagation();
                                if (entry.case_id) onNavigateToCase(entry.case_id);
                              }}
                              className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                            >
                              <FolderOpen className="w-3 h-3 text-neutral-500" />
                              <span className="truncate max-w-[200px]">{entry.case_name}</span>
                            </span>
                          )}

                          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
                            {entry.log_id}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-neutral-900 dark:text-white mt-1.5 leading-snug">
                          {entry.details}
                        </p>

                        {/* Metadata Snippet */}
                        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-neutral-600 dark:text-neutral-400">
                            {entry.metadata.filename && (
                              <span className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 rounded font-mono text-[10px] text-neutral-700 dark:text-neutral-300">
                                📄 {entry.metadata.filename}
                              </span>
                            )}
                            {entry.metadata.findings_count !== undefined && (
                              <span className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                                ⚠️ {entry.metadata.findings_count} {lang === 'vi' ? 'phát hiện' : 'finding(s)'}
                              </span>
                            )}
                            {entry.metadata.sha256 && (
                              <span className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 rounded font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                                SHA: {entry.metadata.sha256.substring(0, 10)}...
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actor, Timestamp & Cryptographic Hash */}
                    <div className="flex flex-row lg:flex-col lg:items-end justify-between items-center shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-neutral-100 dark:border-neutral-800 text-right gap-1">
                      <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 text-xs font-medium">
                        <User className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="font-semibold">{entry.actor}</span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                        <Calendar className="w-3 h-3" />
                        <span>{formattedTime}</span>
                      </div>

                      <div 
                        onClick={e => {
                          e.stopPropagation();
                          handleCopy(entry.integrity_hash, entry.log_id);
                        }}
                        className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 transition-colors"
                        title="Click to copy full SHA-256 block hash"
                      >
                        <KeyRound className="w-3 h-3 text-neutral-400" />
                        <span>{entry.integrity_hash.substring(0, 12)}...</span>
                        {copiedHash === entry.log_id ? (
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Entry Details Inspection Modal */}
      {selectedEntry && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setSelectedEntry(null)}
        >
          <div 
            className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-850">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{lang === 'vi' ? 'Bằng chứng Mã hóa Bản ghi Kiểm toán' : 'Audit Record Cryptographic Proof'}</h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-neutral-50 dark:bg-neutral-850 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400 font-medium">Log Record ID:</span>
                  <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">{selectedEntry.log_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400 font-medium">Timestamp (ISO 8601):</span>
                  <span className="font-mono text-neutral-800 dark:text-neutral-200">{selectedEntry.timestamp}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400 font-medium">{t.audit.action}:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">{selectedEntry.action}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400 font-medium">{t.audit.actor}:</span>
                  <span className="font-bold text-neutral-900 dark:text-white">{selectedEntry.actor}</span>
                </div>
                {selectedEntry.case_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-neutral-400 font-medium">{t.cases.case}:</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">{selectedEntry.case_name}</span>
                  </div>
                )}
              </div>

              {/* Details text */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider mb-1">
                  {lang === 'vi' ? 'Bản tường trình Sự kiện & Dấu vết Kiểm toán' : 'Event Statement & Audit Trail'}
                </label>
                <div className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 font-medium leading-relaxed">
                  {selectedEntry.details}
                </div>
              </div>

              {/* SHA-256 digests computed over the projected event sequence */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider mb-1">
                  {lang === 'vi' ? 'Giá trị băm toàn vẹn (SHA-256)' : 'Integrity Digest (SHA-256)'}
                </label>
                <div className="p-3 bg-neutral-900 dark:bg-neutral-950 text-neutral-200 rounded-xl font-mono text-[11px] space-y-2 border border-neutral-800">
                  <div>
                    <span className="text-neutral-400 block text-[10px]">THIS EVENT'S DIGEST:</span>
                    <span className="text-emerald-400 break-all">{selectedEntry.integrity_hash}</span>
                  </div>
                  <div className="pt-2 border-t border-neutral-800">
                    <span className="text-neutral-400 block text-[10px]">PRECEDING EVENT'S DIGEST:</span>
                    <span className="text-amber-400 break-all">{selectedEntry.prev_hash}</span>
                  </div>
                </div>
              </div>

              {/* Raw JSON Payload */}
              {selectedEntry.metadata && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider mb-1">
                    {lang === 'vi' ? 'Metadata Bản ghi Đính kèm' : 'Attached Record Metadata'}
                  </label>
                  <pre className="p-3 bg-neutral-50 dark:bg-neutral-850 rounded-xl border border-neutral-200 dark:border-neutral-800 font-mono text-[10px] text-neutral-800 dark:text-neutral-200 overflow-x-auto max-h-36">
                    {JSON.stringify(selectedEntry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-neutral-50 dark:bg-neutral-850 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />{' '}
                {lang === 'vi'
                  ? 'Giá trị băm được tính lại ở mỗi lần đọc'
                  : 'Digest recomputed on every read'}
              </span>
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 cursor-pointer"
              >
                {lang === 'vi' ? 'Đóng' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Manual Attestation Modal */}
      {attestationModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setAttestationModalOpen(false)}
        >
          <div 
            className="w-full max-w-xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <form onSubmit={handleCreateAttestation}>
              {/* Header */}
              <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-850">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{lang === 'vi' ? 'Ghi nhận Ký duyệt & Chứng thực Kiểm toán' : 'Record Auditor Sign-Off & Attestation'}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAttestationModalOpen(false)}
                  className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-md cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    {lang === 'vi' ? 'Tên Kiểm toán viên / Chức danh Thẩm quyền' : 'Auditor Name / Authority Title'}
                  </label>
                  <input
                    type="text"
                    value={attestActor}
                    onChange={e => setAttestActor(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    {lang === 'vi' ? 'Hồ sơ Mục tiêu' : 'Target Case Reference'}
                  </label>
                  <select
                    value={attestCaseId}
                    onChange={e => setAttestCaseId(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900"
                  >
                    <option value="">{lang === 'vi' ? 'Chứng thực Chung / Đa hồ sơ' : 'Global / Multi-Case Attestation'}</option>
                    {cases.map(c => (
                      <option key={c.case_id} value={c.case_id}>
                        {c.name} ({c.case_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    {lang === 'vi' ? 'Ý kiến Chứng thực & Tuyên bố Phê duyệt Tuân thủ' : 'Attestation Finding & Compliance Sign-Off Statement'}
                  </label>
                  <textarea
                    value={attestDetails}
                    onChange={e => setAttestDetails(e.target.value)}
                    required
                    rows={4}
                    placeholder={lang === 'vi' ? 'VD: Mọi chênh lệch hóa đơn Q1 đã được đối chiếu so với phụ lục hợp đồng chính và được phê duyệt theo hạn mức ủy quyền.' : 'E.g., All Q1 invoice variances have been reconciled against the master service contract amendment and approved under policy authorization.'}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 resize-none"
                  />
                </div>

                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <p>
                    {lang === 'vi'
                      ? 'Sau khi gửi, chứng thực được lưu vào cơ sở dữ liệu và xuất hiện trong nhật ký kiểm toán dưới dạng sự kiện MANUAL_ATTESTATION, kèm giá trị băm SHA-256 tính trên chuỗi sự kiện.'
                      : 'Once submitted, the attestation is stored in the database and appears in the audit trail as a MANUAL_ATTESTATION event, covered by the SHA-256 digest computed over the event sequence.'}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 bg-neutral-50 dark:bg-neutral-850 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAttestationModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submittingAttest || !attestDetails.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white dark:text-neutral-900 bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 rounded-xl transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  {submittingAttest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>{lang === 'vi' ? 'Ký duyệt & Gắn vào Sổ cái' : 'Sign & Append to Ledger'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

