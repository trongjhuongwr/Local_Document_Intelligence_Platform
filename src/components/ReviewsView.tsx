import React, { useState, useEffect } from 'react';
import { CaseItem, ReviewFinding, Severity, ReviewStatus } from '../types';
import { SeverityBadge, StatusChip } from './StatusBadges';
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
  Clock
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
  const [reviewerName, setReviewerName] = useState<string>('Auditor');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [helpOpen, setHelpOpen] = useState(false);

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
  }, [selectedCaseId, statusFilter, severityFilter, page]);

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
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalReviews / pageSize));

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Review Findings</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Audit human queue: review, approve or reject automatically generated discrepancy exceptions.
          </p>
        </div>
        <button
          onClick={() => setHelpOpen(!helpOpen)}
          className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-medium cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>What do these actions mean?</span>
        </button>
      </div>

      {/* Guide dialog / expander */}
      {helpOpen && (
        <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 text-xs text-neutral-700 space-y-2">
          <div className="font-bold text-neutral-900">Audit Action Guidelines</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-white p-3 rounded border border-neutral-200">
              <span className="font-bold text-emerald-700">Approve</span>
              <p className="mt-1 text-neutral-600">Confirms this discrepancy is a real business issue and blocks payment or triggers an inquiry.</p>
            </div>
            <div className="bg-white p-3 rounded border border-neutral-200">
              <span className="font-bold text-rose-700">Reject</span>
              <p className="mt-1 text-neutral-600">Dismisses the finding as an acceptable business exception or parsing false alarm.</p>
            </div>
            <div className="bg-white p-3 rounded border border-neutral-200">
              <span className="font-bold text-neutral-700">Resolve</span>
              <p className="mt-1 text-neutral-600">Marks a previously approved finding as resolved following corrective invoice submission.</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
            return (
              <div
                key={item.review_id}
                className="p-5 rounded-xl border border-neutral-200 bg-white shadow-xs space-y-4"
              >
                {/* Finding Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
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
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                      Audit Evidence
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {disc.evidence.map((ev: any, ei: number) => (
                        <div key={ei} className="p-2 rounded bg-neutral-50 border border-neutral-100 text-[11px]">
                          <span className="font-semibold text-neutral-800">{ev.filename}</span>
                          {ev.snippet && <p className="text-neutral-600 mt-0.5 italic">"{ev.snippet}"</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audit trail / note if decided */}
                {item.reviewer && (
                  <div className="p-2.5 rounded bg-neutral-50 text-xs text-neutral-600 flex items-center justify-between">
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
    </div>
  );
}
