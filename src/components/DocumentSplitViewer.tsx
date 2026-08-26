import React, { useState, useEffect, useRef } from 'react';
import { CaseDocument, Discrepancy, DocumentType, ReviewFinding } from '../types';
import { errorMessage } from '../api';
import { LoadedDocument, loadDocument } from '../utils/documentText';
import { SeverityBadge } from './StatusBadges';
import {
  X,
  Columns,
  Rows,
  ArrowLeftRight,
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  Copy,
  Maximize2,
  Minimize2,
  Table,
  FileCode,
  Sparkles,
  Check,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface DocumentSplitViewerProps {
  documents: CaseDocument[];
  initialLeftDocId?: string;
  initialRightDocId?: string;
  finding?: Discrepancy | null;
  caseId?: string;
  onClose: () => void;
  onApproveFinding?: (finding: Discrepancy) => void;
  onRejectFinding?: (finding: Discrepancy) => void;
  onPreviousFinding?: () => void;
  onNextFinding?: () => void;
  currentFindingIndex?: number;
  totalFindingsCount?: number;
}

const DOCUMENT_LABELS: Record<string, string> = {
  contract: 'Contract',
  invoice: 'Invoice',
  purchase_order: 'Purchase Order',
  policy: 'Payment Policy',
  other: 'Other Document',
};

const DOCUMENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  contract: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  invoice: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  purchase_order: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  policy: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  other: { bg: 'bg-neutral-50', text: 'text-neutral-700', border: 'border-neutral-200' },
};

export function DocumentSplitViewer({
  documents,
  initialLeftDocId,
  initialRightDocId,
  finding,
  caseId,
  onClose,
  onApproveFinding,
  onRejectFinding,
  onPreviousFinding,
  onNextFinding,
  currentFindingIndex,
  totalFindingsCount,
}: DocumentSplitViewerProps) {
  // Document selection
  const [leftDocId, setLeftDocId] = useState<string>(() => {
    if (initialLeftDocId) return initialLeftDocId;
    if (finding?.evidence && finding.evidence.length > 0) {
      const match = documents.find(d => d.filename === finding.evidence![0].filename);
      if (match) return match.document_id;
    }
    return documents[0]?.document_id || '';
  });

  const [rightDocId, setRightDocId] = useState<string>(() => {
    if (initialRightDocId) return initialRightDocId;
    if (finding?.evidence && finding.evidence.length > 1) {
      const match = documents.find(d => d.filename === finding.evidence![1].filename);
      if (match) return match.document_id;
    }
    return documents[1]?.document_id || documents[0]?.document_id || '';
  });

  // Automatically update active documents when finding changes via Next/Prev navigation
  useEffect(() => {
    if (finding?.evidence && finding.evidence.length > 0) {
      const matchLeft = documents.find(d => d.filename === finding.evidence![0].filename);
      if (matchLeft) setLeftDocId(matchLeft.document_id);

      if (finding.evidence.length > 1) {
        const matchRight = documents.find(d => d.filename === finding.evidence![1].filename);
        if (matchRight) setRightDocId(matchRight.document_id);
      }
    }
  }, [finding, documents]);

  // Loaded document metadata + parsed text (reassembled from indexed chunks)
  const [leftDoc, setLeftDoc] = useState<LoadedDocument | null>(null);
  const [rightDoc, setRightDoc] = useState<LoadedDocument | null>(null);
  const [leftError, setLeftError] = useState<string | null>(null);
  const [rightError, setRightError] = useState<string | null>(null);
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);
  const leftDocData = leftDoc?.detail ?? null;
  const rightDocData = rightDoc?.detail ?? null;

  // Layout & Viewing Mode
  const [layoutRatio, setLayoutRatio] = useState<'50-50' | '65-35' | '35-65' | 'stacked'>('50-50');
  const [viewMode, setViewMode] = useState<'text' | 'schema' | 'comparison'>('comparison');
  const [syncScroll, setSyncScroll] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Search in document
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [copiedLeft, setCopiedLeft] = useState(false);
  const [copiedRight, setCopiedRight] = useState(false);

  // Scroll containers for sync
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  // Fetch left document metadata + parsed text
  useEffect(() => {
    if (!leftDocId) return;
    let cancelled = false;
    setLoadingLeft(true);
    setLeftError(null);
    loadDocument(leftDocId)
      .then(data => {
        if (!cancelled) setLeftDoc(data);
      })
      .catch(err => {
        if (!cancelled) {
          setLeftDoc(null);
          setLeftError(errorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLeft(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leftDocId]);

  // Fetch right document metadata + parsed text
  useEffect(() => {
    if (!rightDocId) return;
    let cancelled = false;
    setLoadingRight(true);
    setRightError(null);
    loadDocument(rightDocId)
      .then(data => {
        if (!cancelled) setRightDoc(data);
      })
      .catch(err => {
        if (!cancelled) {
          setRightDoc(null);
          setRightError(errorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRight(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rightDocId]);

  // Handle Sync Scroll
  const handleScrollLeft = () => {
    if (!syncScroll || isSyncingRef.current || !leftScrollRef.current || !rightScrollRef.current) return;
    isSyncingRef.current = true;
    const percentage = leftScrollRef.current.scrollTop / (leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight || 1);
    rightScrollRef.current.scrollTop = percentage * (rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight);
    setTimeout(() => { isSyncingRef.current = false; }, 50);
  };

  const handleScrollRight = () => {
    if (!syncScroll || isSyncingRef.current || !leftScrollRef.current || !rightScrollRef.current) return;
    isSyncingRef.current = true;
    const percentage = rightScrollRef.current.scrollTop / (rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight || 1);
    leftScrollRef.current.scrollTop = percentage * (leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight);
    setTimeout(() => { isSyncingRef.current = false; }, 50);
  };

  // Keyboard shortcut: Esc to close, Arrow keys for fast continuous audit review
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onPreviousFinding) {
        onPreviousFinding();
      } else if (e.key === 'ArrowRight' && onNextFinding) {
        onNextFinding();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPreviousFinding, onNextFinding]);

  // Swap Left & Right
  const handleSwap = () => {
    const tempId = leftDocId;
    setLeftDocId(rightDocId);
    setRightDocId(tempId);
  };

  // Check evidence snippets for highlighting
  const leftEvidenceSnippet = finding?.evidence?.find(e => e.filename === leftDocData?.filename)?.snippet || '';
  const rightEvidenceSnippet = finding?.evidence?.find(e => e.filename === rightDocData?.filename)?.snippet || '';

  // Highlight renderer helper
  const renderHighlightedText = (content: string, searchTerm: string, evidenceSnippet: string) => {
    if (!content) return <span className="text-neutral-400 italic">No document text available.</span>;

    // If there's an evidence snippet to highlight prominently
    if (evidenceSnippet && content.includes(evidenceSnippet)) {
      const parts = content.split(evidenceSnippet);
      return (
        <span>
          {parts.map((part, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <mark className="bg-amber-200 text-amber-950 font-bold px-1.5 py-0.5 rounded border border-amber-300 shadow-2xs inline-block my-0.5">
                  <span className="text-[10px] uppercase font-bold text-amber-800 block">⚡ Audit Evidence Match</span>
                  {evidenceSnippet}
                </mark>
              )}
              {searchTerm ? renderSearchHighlights(part, searchTerm) : part}
            </React.Fragment>
          ))}
        </span>
      );
    }

    if (searchTerm) {
      return renderSearchHighlights(content, searchTerm);
    }

    return <span>{content}</span>;
  };

  const renderSearchHighlights = (text: string, term: string) => {
    if (!term.trim()) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((p, i) =>
          regex.test(p) ? (
            <mark key={i} className="bg-yellow-300 text-yellow-950 font-semibold px-0.5 rounded">
              {p}
            </mark>
          ) : (
            p
          )
        )}
      </span>
    );
  };

  // Reconciliation rows.
  //
  // The API exposes no per-document extracted-field endpoint, so the only real
  // field-level comparison available is the one the discrepancy engine already
  // computed and attached to the finding. When a finding is open, show its
  // actual expected/observed values and per-document evidence snippets;
  // otherwise fall back to comparing the document metadata the API does return.
  const comparisonRows: Array<{ label: string; left: string; right: string; mismatch: boolean }> = [];

  if (finding) {
    const leftEv = finding.evidence?.find(e => e.filename === leftDocData?.filename);
    const rightEv = finding.evidence?.find(e => e.filename === rightDocData?.filename);
    const asText = (value: unknown) =>
      value === null || value === undefined
        ? '—'
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);

    if (finding.field) {
      comparisonRows.push({
        label: 'field',
        left: finding.field,
        right: finding.field,
        mismatch: false,
      });
    }
    comparisonRows.push({
      label: 'expected vs observed',
      left: asText(finding.expected_value),
      right: asText(finding.observed_value),
      mismatch: asText(finding.expected_value) !== asText(finding.observed_value),
    });
    if (finding.difference !== null && finding.difference !== undefined) {
      comparisonRows.push({
        label: 'difference',
        left: asText(finding.difference),
        right: '',
        mismatch: true,
      });
    }
    if (leftEv?.snippet || rightEv?.snippet) {
      comparisonRows.push({
        label: 'evidence snippet',
        left: leftEv?.snippet || '—',
        right: rightEv?.snippet || '—',
        mismatch: false,
      });
    }
  } else if (leftDocData && rightDocData) {
    const rows: Array<[string, unknown, unknown]> = [
      ['document type', leftDocData.document_type, rightDocData.document_type],
      ['status', leftDocData.status, rightDocData.status],
      ['pages', leftDocData.page_count ?? '—', rightDocData.page_count ?? '—'],
      ['chunks indexed', leftDocData.chunk_count, rightDocData.chunk_count],
      ['size (KB)', (leftDocData.size_bytes / 1024).toFixed(1), (rightDocData.size_bytes / 1024).toFixed(1)],
      ['parser version', leftDocData.parser_version, rightDocData.parser_version],
    ];
    for (const [label, l, r] of rows) {
      comparisonRows.push({
        label,
        left: String(l),
        right: String(r),
        mismatch: String(l) !== String(r),
      });
    }
  }

  return (
    <div className={`fixed inset-0 bg-neutral-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150`}>
      <div className={`bg-white rounded-2xl border border-neutral-200 shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
        isFullScreen ? 'w-full h-full max-w-none rounded-none' : 'w-full max-w-7xl h-[92vh]'
      }`}>

        {/* Top Control Bar */}
        <div className="p-3 bg-neutral-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
              <Columns className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">Side-by-Side Split Document Viewer</h2>
                <span className="text-[10px] bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full font-mono">
                  Audit Cross-Verification Mode
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Compare terms, prices, signatures, and evidence across documents with synchronized viewing.
              </p>
            </div>
          </div>

          {/* View & Layout Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Buttons */}
            <div className="flex items-center bg-neutral-800 p-0.5 rounded-lg border border-neutral-700 text-xs">
              <button
                onClick={() => setViewMode('comparison')}
                className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'comparison' ? 'bg-neutral-700 text-white shadow-2xs' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Reconciliation table plus document text"
              >
                <Table className="w-3.5 h-3.5 text-emerald-400" />
                <span>Matrix &amp; Text</span>
              </button>
              <button
                onClick={() => setViewMode('text')}
                className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'text' ? 'bg-neutral-700 text-white shadow-2xs' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Full Raw Document Text"
              >
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>Text Only</span>
              </button>
              <button
                onClick={() => setViewMode('schema')}
                className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'schema' ? 'bg-neutral-700 text-white shadow-2xs' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Reconciliation table only (discrepancy values, or document metadata when no finding is open)"
              >
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>Table Only</span>
              </button>
            </div>

            {/* Layout Proportion */}
            <div className="flex items-center bg-neutral-800 p-0.5 rounded-lg border border-neutral-700 text-xs">
              <button
                onClick={() => setLayoutRatio('50-50')}
                className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                  layoutRatio === '50-50' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Equal 50/50 Split"
              >
                50:50
              </button>
              <button
                onClick={() => setLayoutRatio('65-35')}
                className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                  layoutRatio === '65-35' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Left Dominant 65/35"
              >
                65:35
              </button>
              <button
                onClick={() => setLayoutRatio('35-65')}
                className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                  layoutRatio === '35-65' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Right Dominant 35/65"
              >
                35:65
              </button>
              <button
                onClick={() => setLayoutRatio('stacked')}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  layoutRatio === 'stacked' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Stacked Vertically"
              >
                <Rows className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sync Scroll Toggle */}
            <button
              onClick={() => setSyncScroll(!syncScroll)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                syncScroll
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200'
              }`}
              title="Synchronize vertical scroll between left and right document"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sync Scroll</span>
            </button>

            {/* Swap Left & Right */}
            <button
              onClick={handleSwap}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-colors cursor-pointer"
              title="Swap Left & Right Documents"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-colors cursor-pointer"
              title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-rose-900/50 hover:text-rose-300 text-neutral-400 border border-neutral-700 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Discrepancy & Audit Finding Context Strip (if opened from a finding) */}
        {finding && (
          <div className="bg-amber-50/90 border-b border-amber-200 p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shrink-0">
            <div className="flex items-start gap-2.5 min-w-0">
              <SeverityBadge severity={finding.severity} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-900">
                    {finding.type.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  {finding.expected_value !== undefined && (
                    <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-amber-200 text-neutral-800">
                      Expected: <strong>{finding.expected_value}</strong> vs Observed: <strong>{finding.observed_value}</strong>
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-700 mt-0.5 truncate">{finding.description}</p>
                {finding.calculation?.formula && (
                  <div className="text-[11px] font-mono text-amber-900 mt-0.5">
                    Formula: {finding.calculation.formula}
                  </div>
                )}
              </div>
            </div>

            {/* Continuous Navigation Controls + Direct Quick Decisions */}
            <div className="flex items-center gap-3 shrink-0 self-end md:self-auto flex-wrap">
              {/* Finding Index & Next/Previous Navigator */}
              {(onPreviousFinding || onNextFinding) && (
                <div className="flex items-center bg-white px-2 py-1 rounded-lg border border-amber-300 shadow-2xs gap-1.5">
                  <button
                    onClick={onPreviousFinding}
                    disabled={!onPreviousFinding || currentFindingIndex === 0}
                    className="p-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer"
                    title="Previous Discrepancy (← Arrow Left)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-mono font-bold text-neutral-700">
                    Finding {(currentFindingIndex !== undefined ? currentFindingIndex + 1 : 1)} / {totalFindingsCount || 1}
                  </span>
                  <button
                    onClick={onNextFinding}
                    disabled={!onNextFinding || (totalFindingsCount !== undefined && currentFindingIndex !== undefined && currentFindingIndex >= totalFindingsCount - 1)}
                    className="p-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer"
                    title="Next Discrepancy (→ Arrow Right)"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {(onApproveFinding || onRejectFinding) && (
                <div className="flex items-center gap-2">
                  {onApproveFinding && (
                    <button
                      onClick={() => onApproveFinding(finding)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                  )}
                  {onRejectFinding && (
                    <button
                      onClick={() => onRejectFinding(finding)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reconciliation table (shown in 'comparison' and 'schema' viewModes) */}
        {(viewMode === 'comparison' || viewMode === 'schema') && comparisonRows.length > 0 && (
          <div className="bg-neutral-50 border-b border-neutral-200 p-3 max-h-48 overflow-y-auto shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 flex items-center gap-1">
                <Table className="w-3 h-3 text-neutral-600" />
                {finding ? 'Discrepancy Reconciliation' : 'Document Metadata Comparison'}
              </span>
              <span className="text-[10px] text-neutral-400">
                {leftDocData?.filename || 'Left document'} vs {rightDocData?.filename || 'Right document'}
              </span>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-700 font-bold">
                    <th className="py-1.5 px-3 w-1/3">{finding ? 'Attribute' : 'Field'}</th>
                    <th className="py-1.5 px-3 w-1/3 border-l border-neutral-200 truncate">
                      {leftDocData?.filename || 'Left Document'}
                    </th>
                    <th className="py-1.5 px-3 w-1/3 border-l border-neutral-200 truncate">
                      {rightDocData?.filename || 'Right Document'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-mono text-[11px]">
                  {comparisonRows.map(row => (
                    <tr
                      key={row.label}
                      className={row.mismatch ? 'bg-amber-50/60 font-semibold' : 'hover:bg-neutral-50'}
                    >
                      <td className="py-1.5 px-3 font-sans font-medium text-neutral-700 flex items-center gap-1.5">
                        {row.mismatch && <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />}
                        <span className="capitalize">{row.label}</span>
                      </td>
                      <td className="py-1.5 px-3 border-l border-neutral-100 text-neutral-900 truncate" title={row.left}>
                        {row.left}
                      </td>
                      <td className="py-1.5 px-3 border-l border-neutral-100 text-neutral-900 truncate" title={row.right}>
                        {row.right}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Dual Split Content Panes */}
        <div className={`flex-1 overflow-hidden flex ${
          layoutRatio === 'stacked' ? 'flex-col' : 'flex-row'
        } divide-x divide-neutral-200`}>

          {/* ================= LEFT PANE ================= */}
          <div
            className={`flex flex-col h-full overflow-hidden ${
              layoutRatio === '50-50' ? 'w-1/2' :
              layoutRatio === '65-35' ? 'w-[65%]' :
              layoutRatio === '35-65' ? 'w-[35%]' : 'w-full h-1/2'
            }`}
          >
            {/* Left Header & Selector */}
            <div className="p-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 shrink-0">LEFT</span>
                <select
                  value={leftDocId}
                  onChange={e => setLeftDocId(e.target.value)}
                  className="px-2 py-1 text-xs font-semibold bg-white border border-neutral-300 rounded-lg text-neutral-800 truncate focus:outline-hidden focus:ring-1 focus:ring-neutral-900 flex-1 max-w-[240px]"
                >
                  {documents.map(d => (
                    <option key={d.document_id} value={d.document_id}>
                      [{DOCUMENT_LABELS[d.document_type] || d.document_type}] {d.filename}
                    </option>
                  ))}
                </select>
                {leftDocData && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                    DOCUMENT_COLORS[leftDocData.document_type]?.bg || 'bg-neutral-100'
                  } ${DOCUMENT_COLORS[leftDocData.document_type]?.text || 'text-neutral-700'} ${
                    DOCUMENT_COLORS[leftDocData.document_type]?.border || 'border-neutral-200'
                  }`}>
                    {DOCUMENT_LABELS[leftDocData.document_type] || leftDocData.document_type}
                  </span>
                )}
              </div>

              {/* Left Search input */}
              <div className="relative w-36 sm:w-44 shrink-0">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Find in doc..."
                  value={leftSearch}
                  onChange={e => setLeftSearch(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-xs border border-neutral-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            {/* Left Document Content */}
            <div
              ref={leftScrollRef}
              onScroll={handleScrollLeft}
              className="flex-1 p-4 overflow-y-auto bg-white font-mono text-xs leading-relaxed text-neutral-800 whitespace-pre-wrap select-text selection:bg-yellow-200"
            >
              {loadingLeft ? (
                <div className="p-8 text-center text-neutral-400 font-sans">Loading left document...</div>
              ) : leftError ? (
                <div className="p-8 text-center text-rose-600 font-sans break-words">{leftError}</div>
              ) : (
                renderHighlightedText(leftDoc?.text || '', leftSearch, leftEvidenceSnippet)
              )}
            </div>

            {/* Left Footer Info */}
            {leftDocData && (
              <div className="p-2 bg-neutral-50 border-t border-neutral-200 text-[10px] text-neutral-500 font-mono flex items-center justify-between shrink-0">
                <span>SHA: {leftDocData.sha256?.slice(0, 12)}... · {(leftDocData.size_bytes / 1024).toFixed(1)} KB</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(leftDoc?.text || '');
                    setCopiedLeft(true);
                    setTimeout(() => setCopiedLeft(false), 2000);
                  }}
                  className="text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-sans cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedLeft ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>
            )}
          </div>

          {/* ================= RIGHT PANE ================= */}
          <div
            className={`flex flex-col h-full overflow-hidden ${
              layoutRatio === '50-50' ? 'w-1/2' :
              layoutRatio === '65-35' ? 'w-[35%]' :
              layoutRatio === '35-65' ? 'w-[65%]' : 'w-full h-1/2'
            }`}
          >
            {/* Right Header & Selector */}
            <div className="p-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 shrink-0">RIGHT</span>
                <select
                  value={rightDocId}
                  onChange={e => setRightDocId(e.target.value)}
                  className="px-2 py-1 text-xs font-semibold bg-white border border-neutral-300 rounded-lg text-neutral-800 truncate focus:outline-hidden focus:ring-1 focus:ring-neutral-900 flex-1 max-w-[240px]"
                >
                  {documents.map(d => (
                    <option key={d.document_id} value={d.document_id}>
                      [{DOCUMENT_LABELS[d.document_type] || d.document_type}] {d.filename}
                    </option>
                  ))}
                </select>
                {rightDocData && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                    DOCUMENT_COLORS[rightDocData.document_type]?.bg || 'bg-neutral-100'
                  } ${DOCUMENT_COLORS[rightDocData.document_type]?.text || 'text-neutral-700'} ${
                    DOCUMENT_COLORS[rightDocData.document_type]?.border || 'border-neutral-200'
                  }`}>
                    {DOCUMENT_LABELS[rightDocData.document_type] || rightDocData.document_type}
                  </span>
                )}
              </div>

              {/* Right Search input */}
              <div className="relative w-36 sm:w-44 shrink-0">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Find in doc..."
                  value={rightSearch}
                  onChange={e => setRightSearch(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-xs border border-neutral-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            {/* Right Document Content */}
            <div
              ref={rightScrollRef}
              onScroll={handleScrollRight}
              className="flex-1 p-4 overflow-y-auto bg-white font-mono text-xs leading-relaxed text-neutral-800 whitespace-pre-wrap select-text selection:bg-yellow-200"
            >
              {loadingRight ? (
                <div className="p-8 text-center text-neutral-400 font-sans">Loading right document...</div>
              ) : rightError ? (
                <div className="p-8 text-center text-rose-600 font-sans break-words">{rightError}</div>
              ) : (
                renderHighlightedText(rightDoc?.text || '', rightSearch, rightEvidenceSnippet)
              )}
            </div>

            {/* Right Footer Info */}
            {rightDocData && (
              <div className="p-2 bg-neutral-50 border-t border-neutral-200 text-[10px] text-neutral-500 font-mono flex items-center justify-between shrink-0">
                <span>SHA: {rightDocData.sha256?.slice(0, 12)}... · {(rightDocData.size_bytes / 1024).toFixed(1)} KB</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(rightDoc?.text || '');
                    setCopiedRight(true);
                    setTimeout(() => setCopiedRight(false), 2000);
                  }}
                  className="text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-sans cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedRight ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
