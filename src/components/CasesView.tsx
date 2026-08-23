import React, { useState, useEffect, useRef } from 'react';
import { CaseItem, DocumentType, WorkflowRun, Discrepancy, CaseReadiness } from '../types';
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

interface CasesViewProps {
  cases: CaseItem[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onRefreshCases: () => void;
  onNavigateToReviews: (caseId: string) => void;
}

const DOCUMENT_LABELS: Record<string, string> = {
  contract: 'Contract',
  invoice: 'Invoice',
  purchase_order: 'Purchase Order',
  policy: 'Payment Policy',
  other: 'Other Document',
};

function inferDocTypeWithConfidence(filename: string): { type: DocumentType; confidence: number; reason: string } {
  const f = filename.toLowerCase();
  if (f.includes('contract') || f.includes('msa') || f.includes('agreement')) {
    return { type: 'contract', confidence: 95, reason: 'Matched agreement/contract naming' };
  }
  if (f.includes('invoice') || f.includes('inv') || f.includes('bill')) {
    return { type: 'invoice', confidence: 96, reason: 'Matched invoice/bill naming' };
  }
  if (f.includes('po') || f.includes('purchase') || f.includes('order')) {
    return { type: 'purchase_order', confidence: 92, reason: 'Matched purchase order naming' };
  }
  if (f.includes('policy') || f.includes('terms') || f.includes('guideline')) {
    return { type: 'policy', confidence: 90, reason: 'Matched policy/terms naming' };
  }
  return { type: 'other', confidence: 50, reason: 'General business document' };
}

function inferDocType(filename: string): DocumentType {
  return inferDocTypeWithConfidence(filename).type;
}

export function CasesView({ cases, activeCaseId, onSelectCase, onRefreshCases, onNavigateToReviews }: CasesViewProps) {
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
  const [peekDoc, setPeekDoc] = useState<{
    document_id: string;
    filename: string;
    document_type: string;
    status: string;
    size_bytes: number;
    sha256: string;
    text_content?: string;
    extracted_data?: Record<string, any>;
  } | null>(null);
  const [loadingPeek, setLoadingPeek] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Analysis / Workflow state
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowRun | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Side-by-Side Split Viewer state
  const [splitViewerConfig, setSplitViewerConfig] = useState<{
    open: boolean;
    leftDocId?: string;
    rightDocId?: string;
    finding?: Discrepancy | null;
  }>({ open: false });

  // Load detailed case data when activeCaseId changes
  useEffect(() => {
    if (!activeCaseId) {
      setCaseDetail(null);
      setActiveWorkflow(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/cases/${activeCaseId}`)
      .then(res => res.json())
      .then(data => {
        setCaseDetail(data);
        if (data.latest_workflow) {
          setActiveWorkflow(data.latest_workflow);
        }
      })
      .finally(() => setLoadingDetail(false));
  }, [activeCaseId]);

  // Poll workflow if running
  useEffect(() => {
    if (!activeWorkflow || (activeWorkflow.status !== 'running' && activeWorkflow.status !== 'queued')) {
      return;
    }
    const interval = setInterval(() => {
      fetch(`/api/workflows/${activeWorkflow.workflow_id}`)
        .then(res => res.json())
        .then(wf => {
          setActiveWorkflow(wf);
          if (wf.status === 'completed' || wf.status === 'failed') {
            clearInterval(interval);
            onRefreshCases();
            if (activeCaseId) {
              fetch(`/api/cases/${activeCaseId}`).then(r => r.json()).then(setCaseDetail);
            }
          }
        })
        .catch(console.error);
    }, 600);
    return () => clearInterval(interval);
  }, [activeWorkflow?.status, activeWorkflow?.workflow_id]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCaseName.trim() }),
      });
      const created = await res.json();
      setNewCaseName('');
      setCreateFormOpen(false);
      onRefreshCases();
      onSelectCase(created.case_id);
    } catch (err) {
      console.error(err);
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
    try {
      const formData = new FormData();
      selectedFiles.forEach(item => {
        formData.append('files', item.file);
        formData.append('document_types', item.type);
      });

      const res = await fetch(`/api/cases/${caseDetail.case_id}/documents`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setUploadMessage(`Successfully ingested ${data.success_count} document(s).`);
      setSelectedFiles([]);
      // Refresh case details
      const refreshed = await fetch(`/api/cases/${caseDetail.case_id}`).then(r => r.json());
      setCaseDetail(refreshed);
      onRefreshCases();
    } catch (err) {
      console.error(err);
      setUploadMessage('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenPeek = async (docId: string) => {
    setLoadingPeek(true);
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (res.ok) {
        const data = await res.json();
        setPeekDoc(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPeek(false);
    }
  };

  const handleCopySha256 = () => {
    if (!peekDoc?.sha256) return;
    navigator.clipboard.writeText(peekDoc.sha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleRunAnalysis = async () => {
    if (!caseDetail) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/cases/${caseDetail.case_id}/analyses`, {
        method: 'POST',
      });
      const data = await res.json();
      setActiveWorkflow({
        workflow_id: data.workflow_id,
        case_id: caseDetail.case_id,
        status: 'running',
        progress_percent: 15,
        current_step: 'Starting analysis...',
        steps: [
          { step: 'extract', label: 'Extract document schema fields', status: 'running' },
          { step: 'rules', label: 'Run deterministic cross-document rules', status: 'pending' },
          { step: 'review_tasks', label: 'Generate human audit tasks', status: 'pending' },
        ],
        requires_review: false,
        started_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteCase = async () => {
    if (!caseDetail || !deleteConfirm) return;
    try {
      await fetch(`/api/cases/${caseDetail.case_id}`, { method: 'DELETE' });
      onSelectCase(null);
      onRefreshCases();
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportAuditDossier = async () => {
    if (!caseDetail) return;
    try {
      const [reviewsRes, auditRes] = await Promise.all([
        fetch(`/api/reviews?case_id=${caseDetail.case_id}&limit=500`).then(r => r.json()),
        fetch(`/api/audit-trail?case_id=${caseDetail.case_id}&limit=100`).then(r => r.json())
      ]);

      printOrExportAuditDossier({
        caseDetail,
        analysisResult: activeWorkflow?.result,
        reviews: reviewsRes.reviews || [],
        auditLogs: auditRes.entries || [],
      });
    } catch (err) {
      console.error('Failed to export audit dossier', err);
      // Fallback
      printOrExportAuditDossier({
        caseDetail,
        analysisResult: activeWorkflow?.result,
      });
    }
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
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Cases</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Each case keeps its document pack, analysis history, and human decisions together.
            </p>
          </div>
          <button
            id="create-case-toggle-btn"
            onClick={() => setCreateFormOpen(!createFormOpen)}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer"
          >
            {createFormOpen ? 'Cancel' : '+ New case'}
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search cases by name or ID..."
              className="w-full pl-9 pr-3.5 py-1.5 text-xs border border-neutral-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-xs font-semibold text-neutral-600 shrink-0">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-neutral-50 focus:bg-white focus:outline-hidden font-medium text-neutral-800 w-full sm:w-auto"
            >
              <option value="ALL">All Statuses ({cases.length})</option>
              <option value="ready">Ready for Audit ({cases.filter(c => c.readiness === 'ready').length})</option>
              <option value="limited">Limited ({cases.filter(c => c.readiness === 'limited').length})</option>
              <option value="blocked">Blocked ({cases.filter(c => c.readiness === 'blocked').length})</option>
            </select>
          </div>
        </div>

        {/* Create Case Form Expander */}
        {createFormOpen && (
          <form
            onSubmit={handleCreateCase}
            className="p-5 rounded-xl border border-neutral-200 bg-white shadow-xs space-y-4"
          >
            <h3 className="text-sm font-bold text-neutral-900">Create a new case</h3>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Case name</label>
              <input
                type="text"
                value={newCaseName}
                onChange={e => setNewCaseName(e.target.value)}
                placeholder="e.g. Acme March 2026 invoice review"
                className="w-full px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50 focus:bg-white"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateFormOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-neutral-300 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newCaseName.trim()}
                className="px-4 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
              >
                {creating ? 'Creating...' : 'Create case'}
              </button>
            </div>
          </form>
        )}

        {/* Cases List */}
        {filteredCases.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-dashed border-neutral-300 bg-white">
            <h4 className="text-base font-semibold text-neutral-800">
              {cases.length === 0 ? 'Your workspace is empty' : 'No matching cases found'}
            </h4>
            <p className="text-xs text-neutral-500 mt-1">
              {cases.length === 0
                ? 'Create a case above or try the sample pack on the Home page.'
                : 'Try adjusting your search query or status filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCases.map(c => (
              <div
                key={c.case_id}
                className="p-5 rounded-xl border border-neutral-200 bg-white shadow-2xs hover:border-neutral-300 transition-all flex items-center justify-between"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-neutral-900">{c.name}</h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    {c.document_count} documents · updated {c.updated_at ? c.updated_at.slice(0, 10) : 'recent'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <ReadinessChip readiness={c.readiness} />
                    <span className="text-xs text-neutral-600 font-medium">
                      {c.open_review_count} open finding(s)
                    </span>
                  </div>
                  <button
                    id={`open-case-btn-${c.case_id}`}
                    onClick={() => onSelectCase(c.case_id)}
                    className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    Open
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
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 mb-3 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Cases</span>
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{caseDetail.name}</h1>
            <p className="text-xs text-neutral-500 font-mono mt-0.5">Case ID: {caseDetail.case_id}</p>
          </div>
          <ReadinessChip readiness={caseDetail.readiness} />
        </div>
      </div>

      {/* 4-Document Pack Checklist */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {checklist.map(docType => {
          const complete = typesPresent.has(docType);
          return (
            <div
              key={docType}
              className={`p-3.5 rounded-lg border flex items-center gap-2.5 text-sm font-semibold transition-colors ${
                complete
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-400'
              }`}
            >
              {complete ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-neutral-300 shrink-0" />
              )}
              <span>{DOCUMENT_LABELS[docType]}</span>
            </div>
          );
        })}
      </div>

      {/* Readiness Banner */}
      {caseDetail.readiness === 'blocked' ? (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>Add both a Contract and an Invoice before analysis can start.</span>
        </div>
      ) : caseDetail.readiness === 'limited' ? (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Limited analysis: {caseDetail.missing_document_types.map(t => DOCUMENT_LABELS[t]).join(', ')} missing, so related checks will be skipped.
          </span>
        </div>
      ) : (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Document pack is complete and ready for deterministic cross-document analysis.</span>
        </div>
      )}

      {/* STEP 1: Add Document Pack with Drag & Drop Dropzone */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-neutral-900">1. Add document pack</h2>
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`p-8 rounded-xl border-2 border-dashed text-center space-y-3 transition-all ${
            isDragging 
              ? 'border-blue-500 bg-blue-50/80 scale-[1.01] shadow-md' 
              : 'border-neutral-300 bg-white hover:border-neutral-400'
          }`}
        >
          <UploadCloud className={`w-10 h-10 mx-auto transition-colors ${isDragging ? 'text-blue-600 scale-110' : 'text-neutral-400'}`} />
          <div>
            <p className="text-sm font-bold text-neutral-900">
              {isDragging ? 'Drop files here to upload...' : 'Drag & drop business files here, or browse'}
            </p>
            <div className="mt-2">
              <label className="cursor-pointer inline-block px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs transition-colors shadow-xs">
                Choose files to upload
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv"
                  onChange={handleFileSelection}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[11px] text-neutral-500 mt-2">
              Supports PDF, DOCX, TXT, MD, CSV (Contracts, Invoices, Purchase Orders, Policies)
            </p>
          </div>
        </div>

        {/* Selected files preview table */}
        {selectedFiles.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Selected Files &amp; Smart Type Ingestion ({selectedFiles.length})</span>
              </span>
              <button 
                onClick={() => setSelectedFiles([])}
                className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
              >
                Clear all
              </button>
            </div>
            <div className="divide-y divide-neutral-200">
              {selectedFiles.map((item, idx) => {
                const inferred = inferDocTypeWithConfidence(item.file.name);
                return (
                  <div key={idx} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900 truncate">{item.file.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-100 text-emerald-800">
                            {inferred.confidence}% Auto-Detected
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          {(item.file.size / 1024).toFixed(1)} KB · {inferred.reason}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <div className="flex items-center gap-1">
                        {(['contract', 'invoice', 'purchase_order', 'policy'] as DocumentType[]).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              const next = [...selectedFiles];
                              next[idx].type = t;
                              setSelectedFiles(next);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                              item.type === t
                                ? 'bg-neutral-900 text-white'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                          >
                            {DOCUMENT_LABELS[t]}
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
                        className="text-xs border border-neutral-300 rounded px-2 py-1 bg-white font-medium"
                      >
                        <option value="contract">Contract</option>
                        <option value="invoice">Invoice</option>
                        <option value="purchase_order">Purchase Order</option>
                        <option value="policy">Payment Policy</option>
                        <option value="other">Other</option>
                      </select>
                      <button
                        onClick={() => {
                          setSelectedFiles(selectedFiles.filter((_, i) => i !== idx));
                        }}
                        className="p-1 text-neutral-400 hover:text-red-600 rounded cursor-pointer"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex justify-end">
              <button
                id="upload-pack-btn"
                onClick={handleUploadPack}
                disabled={uploading}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {uploading ? 'Parsing & Indexing...' : `Upload and Index ${selectedFiles.length} file(s)`}
              </button>
            </div>
          </div>
        )}

        {uploadMessage && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{uploadMessage}</span>
          </div>
        )}

        {/* Existing documents with Quick Peek */}
        {caseDetail.documents && caseDetail.documents.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Documents in this case ({caseDetail.documents.length})
                </h3>
                <span className="text-[11px] text-neutral-400">Click any document to inspect content &amp; metadata</span>
              </div>
              {caseDetail.documents.length >= 2 && (
                <button
                  id="open-split-viewer-btn"
                  onClick={() => setSplitViewerConfig({
                    open: true,
                    leftDocId: caseDetail.documents![0]?.document_id,
                    rightDocId: caseDetail.documents![1]?.document_id,
                  })}
                  className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Columns className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Compare Documents (Split View)</span>
                </button>
              )}
            </div>
            <div className="divide-y divide-neutral-100">
              {caseDetail.documents.map(d => (
                <div 
                  key={d.document_id} 
                  className="py-2.5 px-2 -mx-2 rounded-lg hover:bg-neutral-50 transition-colors flex items-center justify-between text-xs group"
                >
                  <div 
                    onClick={() => handleOpenPeek(d.document_id)}
                    className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
                  >
                    <div className="w-7 h-7 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900 group-hover:text-blue-700 transition-colors truncate">{d.filename}</span>
                        <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono text-[10px] shrink-0">
                          {DOCUMENT_LABELS[d.document_type] || d.document_type}
                        </span>
                      </div>
                      <div className="text-neutral-400 font-mono text-[10px] mt-0.5">
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
                        className="px-2 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                        title="Compare this document side-by-side"
                      >
                        <Columns className="w-3 h-3 text-neutral-500" />
                        <span className="hidden sm:inline">Compare</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenPeek(d.document_id)}
                      className="px-2 py-1 rounded-md hover:bg-neutral-100 text-neutral-600 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Inspect</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick Peek Modal */}
      {peekDoc && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-neutral-900 truncate">{peekDoc.filename}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                    <span className="capitalize font-semibold text-neutral-700">{DOCUMENT_LABELS[peekDoc.document_type] || peekDoc.document_type}</span>
                    <span>·</span>
                    <span>{(peekDoc.size_bytes / 1024).toFixed(1)} KB</span>
                    <span>·</span>
                    <span className="text-emerald-700 font-medium">Indexed (v1.4)</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPeekDoc(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Metadata Bar */}
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-600">
                  <Hash className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="font-semibold text-neutral-700">SHA-256:</span>
                  <span className="select-all">{peekDoc.sha256}</span>
                </div>
                <button
                  onClick={handleCopySha256}
                  className="px-2.5 py-1 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-md font-semibold text-[11px] text-neutral-700 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedHash ? 'Copied!' : 'Copy Hash'}</span>
                </button>
              </div>

              {/* Extracted Structured Schema if present */}
              {peekDoc.extracted_data && Object.keys(peekDoc.extracted_data).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                    Normalized Schema Fields
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    {Object.entries(peekDoc.extracted_data).map(([k, v]) => (
                      <div key={k} className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
                        <span className="text-[10px] uppercase font-bold text-neutral-400 block">{k.replace(/_/g, ' ')}</span>
                        <span className="font-mono font-semibold text-neutral-900 mt-0.5 block truncate">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v || 'N/A')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw Document Content */}
              <div>
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Document Text Content
                </h4>
                <div className="p-4 rounded-xl bg-neutral-900 text-neutral-100 font-mono text-xs leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap select-text">
                  {peekDoc.text_content || 'No text content available.'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3">
              {caseDetail.documents && caseDetail.documents.length >= 2 ? (
                <button
                  onClick={() => {
                    const otherDoc = caseDetail.documents!.find(d => d.document_id !== peekDoc.document_id);
                    setSplitViewerConfig({
                      open: true,
                      leftDocId: peekDoc.document_id,
                      rightDocId: otherDoc?.document_id,
                    });
                    setPeekDoc(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Columns className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Open in Side-by-Side Split Viewer</span>
                </button>
              ) : <div />}
              <button
                onClick={() => setPeekDoc(null)}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white font-semibold text-xs hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Analyze Case */}
      <div className="space-y-4 pt-4 border-t border-neutral-200">
        <h2 className="text-base font-bold text-neutral-900">2. Analyze case</h2>

        <div className="flex items-center gap-3">
          <button
            id="analyze-case-btn"
            onClick={handleRunAnalysis}
            disabled={caseDetail.readiness === 'blocked' || activeWorkflow?.status === 'running'}
            className="px-6 py-2.5 rounded-lg bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Analyze case</span>
          </button>
          <span className="text-xs text-neutral-500">
            Runs deterministic arithmetic and cross-document validation rules.
          </span>
        </div>

        {/* Active Analysis Progress */}
        {activeWorkflow && activeWorkflow.status === 'running' && (
          <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-800">
              <span>{activeWorkflow.current_step}</span>
              <span>{activeWorkflow.progress_percent}%</span>
            </div>
            <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-900 transition-all duration-300"
                style={{ width: `${activeWorkflow.progress_percent}%` }}
              />
            </div>
            <div className="space-y-1.5 pt-2">
              {activeWorkflow.steps.map(s => (
                <div key={s.step} className="flex items-center gap-2 text-xs text-neutral-600">
                  {s.status === 'completed' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : s.status === 'running' ? (
                    <span className="w-2 h-2 rounded-full bg-neutral-900 animate-ping" />
                  ) : (
                    <Circle className="w-3 h-3 text-neutral-300" />
                  )}
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Analysis Report */}
        {activeWorkflow && activeWorkflow.status === 'completed' && activeWorkflow.result && (
          <div className="p-6 rounded-xl border border-neutral-200 bg-white space-y-6 shadow-xs">
            {/* 4 Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="text-xs text-neutral-500">Documents analyzed</div>
                <div className="text-xl font-bold text-neutral-900 mt-1">
                  {activeWorkflow.result.documents_analyzed?.length || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="text-xs text-neutral-500">High severity</div>
                <div className="text-xl font-bold text-red-600 mt-1">
                  {activeWorkflow.result.issues?.filter((i: any) => i.severity === 'high').length || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="text-xs text-neutral-500">Extraction failures</div>
                <div className="text-xl font-bold text-neutral-900 mt-1">
                  {activeWorkflow.result.extraction_failures?.length || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                <div className="text-xs text-neutral-500">Human review</div>
                <div className={`text-xl font-bold mt-1 ${activeWorkflow.requires_review ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {activeWorkflow.requires_review ? 'Required' : 'Not required'}
                </div>
              </div>
            </div>

            {/* Summary narrative */}
            <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 text-sm text-neutral-800 leading-relaxed">
              {activeWorkflow.result.summary}
            </div>

            {/* Discrepancy Findings by Severity */}
            {activeWorkflow.result.issues && activeWorkflow.result.issues.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-neutral-900">Findings & Evidence Breakdown</h3>
                <div className="space-y-3">
                  {activeWorkflow.result.issues.map((issue: Discrepancy, index: number) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border border-neutral-200 bg-white space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={issue.severity} />
                        <h4 className="text-sm font-bold text-neutral-900">
                          {issue.type.replace(/_/g, ' ').toUpperCase()}
                        </h4>
                      </div>
                      <p className="text-xs text-neutral-700 leading-relaxed">{issue.description}</p>

                      {/* Calculation Box if present */}
                      {issue.calculation && (
                        <div className="p-2.5 rounded bg-neutral-100 text-neutral-800 text-xs font-mono flex items-start gap-2">
                          <Calculator className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                          <div>
                            <div>Formula: {issue.calculation.formula}</div>
                            <div className="text-neutral-500">Difference: {issue.calculation.result}</div>
                          </div>
                        </div>
                      )}

                      {/* Evidence snippets */}
                      {issue.evidence && issue.evidence.length > 0 && (
                        <div className="pt-2 border-t border-neutral-100 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                              Evidence ({issue.evidence.length})
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
                              className="px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                            >
                              <Columns className="w-3 h-3 text-emerald-400" />
                              <span>Compare Evidence in Split View</span>
                            </button>
                          </div>
                          {issue.evidence.map((ev, ei) => (
                            <div key={ei} className="text-xs bg-neutral-50 p-2 rounded border border-neutral-100">
                              <span className="font-semibold text-neutral-800">{ev.filename}</span>
                              {ev.page_number && <span className="text-neutral-500"> · p. {ev.page_number}</span>}
                              {ev.snippet && <p className="text-neutral-600 mt-0.5 italic">"{ev.snippet}"</p>}
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
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-200">
              <div className="flex items-center gap-2">
                <button
                  id="review-findings-btn"
                  onClick={() => onNavigateToReviews(caseDetail.case_id)}
                  className="px-5 py-2 rounded-lg bg-neutral-900 text-white font-semibold text-xs hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Review findings ({activeWorkflow.result.issues?.length || 0})
                </button>

                <button
                  id="export-dossier-btn"
                  onClick={handleExportAuditDossier}
                  title="Print or export full official SOX/ISO Audit Dossier"
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold text-xs hover:bg-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Export Audit Dossier (Print / PDF)</span>
                </button>
              </div>

              <button
                id="download-report-btn"
                onClick={downloadMarkdownReport}
                className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-800 font-semibold text-xs hover:bg-neutral-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Markdown report</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Case Settings / Delete */}
      <div className="pt-6 border-t border-neutral-200">
        <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Case settings</h3>
          <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.checked)}
              className="rounded border-neutral-300"
            />
            <span>I understand this permanently deletes the case and its audit data.</span>
          </label>
          <button
            onClick={handleDeleteCase}
            disabled={!deleteConfirm}
            className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete case</span>
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
            // Find review finding id if any or trigger workflow review update
            onNavigateToReviews(caseDetail.case_id);
          }}
        />
      )}
    </div>
  );
}
