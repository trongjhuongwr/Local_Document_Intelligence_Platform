import React, { useState, useEffect } from 'react';
import { CaseItem, ReviewFinding, Severity, ReviewStatus } from '../types';
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
  Columns
} from 'lucide-react';

interface ReviewsViewProps {
  cases: CaseItem[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onRefreshCases: () => void;
}

export function ReviewsView({ cases, selectedCaseId, onSelectCase, onRefreshCases }: ReviewsViewProps) {
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [reviewerName, setReviewerName] = useState<string>('Lead Auditor (Huong Nguyen)');
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
  }>({ open: false });

  const handleOpenSplitForFinding = async (finding: ReviewFinding) => {
    try {
      const res = await fetch(`/api/cases/${finding.case_id}`);
      if (res.ok) {
        const caseData = await res.json();
        setSplitViewerConfig({
          open: true,
          caseId: finding.case_id,
          documents: caseData.documents || [],
          finding: finding.discrepancy,
        });
      }
    } catch (err) {
      console.error('Failed to load case documents for split viewer', err);
    }
  };

  const [reviews, setReviews] = useState<ReviewFinding[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(false);

  const fetchReviews = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCaseId) params.append('case_id', selectedCaseId);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (severityFilter !== 'all') params.append('severity', severityFilter);
    params.append('limit', pageSize.toString());
    params.append('offset', ((page - 1) * pageSize).toString());

    fetch(`/api/reviews?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setReviews(data.reviews || []);
        setTotalReviews(data.total || 0);
      })
      .catch(console.error)
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

  const handleAction = async (reviewId: string, action: 'approve' | 'reject' | 'resolve') => {
    const note = notes[reviewId] || '';
    try {
      await fetch(`/api/reviews/${reviewId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: reviewerName, note }),
      });
      fetchReviews();
      onRefreshCases();
      showToast(`Finding ${action.toUpperCase()} completed.`);
    } catch (err) {
      console.error(err);
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

  // Batch action handler
  const handleBatchAction = async (action: 'approve' | 'reject' | 'resolve') => {
    if (selectedReviewIds.length === 0) return;
    setBatchActionLoading(true);
    try {
      const res = await fetch('/api/reviews/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_ids: selectedReviewIds,
          action,
          reviewer: reviewerName,
          note: batchNote || `Bulk ${action} applied by ${reviewerName}`,
        }),
      });
      const data = await res.json();
      fetchReviews();
      onRefreshCases();
      showToast(`Batch ${action.toUpperCase()} applied to ${data.updated_count || selectedReviewIds.length} findings.`);
      setSelectedReviewIds([]);
      setBatchNote('');
    } catch (err) {
      console.error('Batch action failed', err);
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Fetch all findings for comprehensive export
  const fetchAllFindingsForExport = async (): Promise<ReviewFinding[]> => {
    const params = new URLSearchParams();
    if (selectedCaseId) params.append('case_id', selectedCaseId);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (severityFilter !== 'all') params.append('severity', severityFilter);
    params.append('limit', '2000');
    params.append('offset', '0');

    try {
      const res = await fetch(`/api/reviews?${params.toString()}`);
      const data = await res.json();
      return data.reviews || reviews;
    } catch {
      return reviews;
    }
  };

  const handleExportCSV = async () => {
    const list = selectedReviewIds.length > 0
      ? reviews.filter(r => selectedReviewIds.includes(r.review_id))
      : await fetchAllFindingsForExport();
    exportReviewsToCSV(list, `audit_findings_${selectedCaseId || 'all'}_${Date.now()}.csv`);
    showToast(`Exported ${list.length} findings to CSV/Excel format.`);
  };

  const handleExportMarkdown = async () => {
    const list = selectedReviewIds.length > 0
      ? reviews.filter(r => selectedReviewIds.includes(r.review_id))
      : await fetchAllFindingsForExport();
    exportReviewsToMarkdown(list, `Audit Findings & Review Report (${selectedCaseId || 'All Cases'})`);
    showToast(`Exported ${list.length} findings to Markdown document.`);
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
        <div className="fixed bottom-6 right-6 z-60 bg-neutral-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-neutral-700 animate-in fade-in slide-in-from-bottom-3 duration-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Export Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">
            Audit Human Verification Queue
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Review Findings</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Audit human queue: review, batch approve or reject automatically generated discrepancy exceptions.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="export-csv-btn"
            onClick={handleExportCSV}
            title="Export full findings to CSV / Excel spreadsheet"
            className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>CSV / Excel</span>
          </button>

          <button
            id="export-md-btn"
            onClick={handleExportMarkdown}
            title="Export findings report as Markdown document"
            className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>Markdown</span>
          </button>

          <button
            id="export-pdf-btn"
            onClick={handlePrintPDF}
            title="Print or export official audit findings report as PDF"
            className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span>Print / PDF</span>
          </button>

          <button
            onClick={() => setHelpOpen(!helpOpen)}
            className="text-xs text-neutral-500 hover:text-neutral-900 p-2 rounded-lg hover:bg-neutral-100 cursor-pointer"
            title="Action Guidelines"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Guide dialog / expander */}
      {helpOpen && (
        <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 text-xs text-neutral-700 space-y-2 animate-in fade-in duration-150">
          <div className="font-bold text-neutral-900">Audit Action Guidelines &amp; Protocol</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-white p-3 rounded-lg border border-neutral-200 shadow-2xs">
              <span className="font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
              </span>
              <p className="mt-1 text-neutral-600">Confirms this discrepancy is a real business issue and blocks payment or triggers a vendor inquiry.</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-neutral-200 shadow-2xs">
              <span className="font-bold text-rose-700 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </span>
              <p className="mt-1 text-neutral-600">Dismisses the finding as an acceptable business exception or parsing false alarm.</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-neutral-200 shadow-2xs">
              <span className="font-bold text-neutral-700 flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> Resolve
              </span>
              <p className="mt-1 text-neutral-600">Marks a previously approved finding as resolved following corrective invoice submission.</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Filter case</label>
            <select
              value={selectedCaseId || 'all'}
              onChange={e => {
                onSelectCase(e.target.value === 'all' ? null : e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              <option value="all">All cases</option>
              {cases.map(c => (
                <option key={c.case_id} value={c.case_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              <option value="all">All statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Severity</label>
            <select
              value={severityFilter}
              onChange={e => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              <option value="all">All severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Reviewer identity</label>
            <div className="relative">
              <input
                type="text"
                value={reviewerName}
                onChange={e => setReviewerName(e.target.value)}
                placeholder="Auditor Name"
                className="w-full pl-7 pr-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
              />
              <User className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-2" />
            </div>
          </div>
        </div>
      </div>

      {/* Batch Actions Bar */}
      <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSelectAllVisible}
            disabled={reviews.length === 0}
            className="flex items-center gap-2 text-xs font-semibold text-neutral-800 hover:text-neutral-900 cursor-pointer disabled:opacity-50"
          >
            {allVisibleSelected ? (
              <CheckSquare className="w-4 h-4 text-emerald-600" />
            ) : selectedReviewIds.length > 0 ? (
              <div className="w-4 h-4 bg-emerald-600 text-white rounded flex items-center justify-center text-[10px] font-bold">
                -
              </div>
            ) : (
              <Square className="w-4 h-4 text-neutral-400" />
            )}
            <span>
              {selectedReviewIds.length > 0 
                ? `Selected ${selectedReviewIds.length} finding(s)` 
                : 'Select all visible'}
            </span>
          </button>

          {selectedReviewIds.length > 0 && (
            <button
              onClick={() => setSelectedReviewIds([])}
              className="text-[11px] text-neutral-500 hover:text-neutral-800 underline cursor-pointer"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* Batch Decision Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {selectedReviewIds.length > 0 && (
            <input
              type="text"
              placeholder="Bulk note (optional)..."
              value={batchNote}
              onChange={e => setBatchNote(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white min-w-[170px]"
            />
          )}

          <button
            id="batch-approve-btn"
            disabled={selectedReviewIds.length === 0 || batchActionLoading}
            onClick={() => handleBatchAction('approve')}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Approve Selected ({selectedReviewIds.length})</span>
          </button>

          <button
            id="batch-reject-btn"
            disabled={selectedReviewIds.length === 0 || batchActionLoading}
            onClick={() => handleBatchAction('reject')}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Reject Selected ({selectedReviewIds.length})</span>
          </button>

          <button
            id="batch-resolve-btn"
            disabled={selectedReviewIds.length === 0 || batchActionLoading}
            onClick={() => handleBatchAction('resolve')}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-900 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resolve</span>
          </button>
        </div>
      </div>

      {/* Findings List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-neutral-500">Loading audit findings...</div>
      ) : reviews.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-neutral-300 bg-white">
          <h4 className="text-sm font-semibold text-neutral-800">No findings match this filter</h4>
          <p className="text-xs text-neutral-500 mt-1">
            Run an analysis on a case to populate this human verification queue.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map(item => {
            const disc = item.discrepancy || {};
            const isSelected = selectedReviewIds.includes(item.review_id);

            return (
              <div
                key={item.review_id}
                className={`p-5 rounded-xl border transition-all shadow-xs space-y-4 ${
                  isSelected ? 'border-emerald-500 bg-emerald-50/20' : 'border-neutral-200 bg-white'
                }`}
              >
                {/* Finding Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {/* Checkbox for batch action */}
                    <button
                      onClick={() => toggleSelectOne(item.review_id)}
                      className="cursor-pointer text-neutral-400 hover:text-neutral-700"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-300 hover:text-neutral-400" />
                      )}
                    </button>

                    <SeverityBadge severity={item.severity} />
                    <StatusChip status={item.status} />
                    <span className="text-xs text-neutral-400 font-mono">Case: {item.case_id}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 font-mono">
                    {item.created_at ? item.created_at.slice(0, 16).replace('T', ' ') : ''}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    {disc.type ? disc.type.replace(/_/g, ' ').toUpperCase() : 'DISCREPANCY'}
                  </h3>
                  <p className="text-xs text-neutral-700 mt-1 leading-relaxed">{disc.description}</p>
                </div>

                {/* Calculation / Comparison values */}
                {(disc.expected_value !== undefined || disc.calculation) && (
                  <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs font-mono space-y-1">
                    {disc.expected_value !== undefined && (
                      <div className="flex items-center gap-4 text-neutral-700">
                        <span>Expected: <strong>{disc.expected_value}</strong></span>
                        <span>Observed: <strong>{disc.observed_value}</strong></span>
                        {disc.difference !== undefined && <span>Diff: <strong>{disc.difference}</strong></span>}
                      </div>
                    )}
                    {disc.calculation && (
                      <div className="text-neutral-500 text-[11px]">
                        Formula: {disc.calculation.formula}
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence citations */}
                {disc.evidence && disc.evidence.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                        Audit Evidence ({disc.evidence.length})
                      </span>
                      <button
                        onClick={() => handleOpenSplitForFinding(item)}
                        className="px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      >
                        <Columns className="w-3 h-3 text-emerald-400" />
                        <span>Split Compare Documents</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {disc.evidence.map((ev: any, ei: number) => (
                        <div key={ei} className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100 text-[11px]">
                          <span className="font-semibold text-neutral-800">{ev.filename}</span>
                          {ev.snippet && <p className="text-neutral-600 mt-0.5 italic">"{ev.snippet}"</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audit trail / note if decided */}
                {item.reviewer && (
                  <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 flex items-center justify-between">
                    <div>
                      Decided by: <strong>{item.reviewer}</strong>
                      {item.note && <span className="italic ml-2">"{item.note}"</span>}
                    </div>
                    {item.decided_at && (
                      <span className="text-[10px] font-mono text-neutral-400">
                        {item.decided_at.slice(0, 16).replace('T', ' ')}
                      </span>
                    )}
                  </div>
                )}

                {/* Action controls */}
                <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3">
                  <input
                    type="text"
                    placeholder="Optional reviewer note / justification..."
                    value={notes[item.review_id] || ''}
                    onChange={e => setNotes({ ...notes, [item.review_id]: e.target.value })}
                    className="flex-1 min-w-[200px] px-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-neutral-50 focus:bg-white"
                  />

                  <div className="flex items-center gap-2">
                    {item.status === 'OPEN' && (
                      <>
                        <button
                          onClick={() => handleAction(item.review_id, 'approve')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleAction(item.review_id, 'reject')}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}
                    {item.status === 'APPROVED' && (
                      <button
                        onClick={() => handleAction(item.review_id, 'resolve')}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-900 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Resolve follow-up</span>
                      </button>
                    )}
                    {item.status === 'REJECTED' && (
                      <span className="text-xs text-neutral-400 italic">Dismissed by auditor</span>
                    )}
                    {item.status === 'RESOLVED' && (
                      <span className="text-xs text-emerald-600 font-semibold">Resolved</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-neutral-500">
              Showing {reviews.length} of {totalReviews} finding(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 text-xs rounded border border-neutral-300 disabled:opacity-40 hover:bg-neutral-50 cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <span className="text-xs font-mono text-neutral-700">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 text-xs rounded border border-neutral-300 disabled:opacity-40 hover:bg-neutral-50 cursor-pointer flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Split Document Viewer Modal */}
      {splitViewerConfig.open && splitViewerConfig.documents && splitViewerConfig.documents.length > 0 && (
        <DocumentSplitViewer
          documents={splitViewerConfig.documents}
          finding={splitViewerConfig.finding}
          caseId={splitViewerConfig.caseId}
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

