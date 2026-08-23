import React, { useState, useEffect } from 'react';
import { CaseItem, DocumentType, WorkflowRun, Discrepancy } from '../types';
import { SeverityBadge, ReadinessChip } from './StatusBadges';
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
  Calculator
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

function inferDocType(filename: string): DocumentType {
  const f = filename.toLowerCase();
  if (f.includes('contract') || f.includes('msa') || f.includes('agreement')) return 'contract';
  if (f.includes('invoice') || f.includes('inv') || f.includes('bill')) return 'invoice';
  if (f.includes('po') || f.includes('purchase') || f.includes('order')) return 'purchase_order';
  if (f.includes('policy') || f.includes('terms') || f.includes('guideline')) return 'policy';
  return 'other';
}

export function CasesView({ cases, activeCaseId, onSelectCase, onRefreshCases, onNavigateToReviews }: CasesViewProps) {
  // Create case state
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [creating, setCreating] = useState(false);

  // Active case state
  const [caseDetail, setCaseDetail] = useState<CaseItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Upload state
  const [selectedFiles, setSelectedFiles] = useState<Array<{ file: File; type: DocumentType }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  // Analysis / Workflow state
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowRun | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const mapped = files.map(file => ({
      file,
      type: inferDocType(file.name),
    }));
    setSelectedFiles(mapped);
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
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
          >
            {createFormOpen ? 'Cancel' : '+ New case'}
          </button>
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
        {cases.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-dashed border-neutral-300 bg-white">
            <h4 className="text-base font-semibold text-neutral-800">Your workspace is empty</h4>
            <p className="text-xs text-neutral-500 mt-1">
              Create a case above or try the sample pack on the Home page.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map(c => (
              <div
                key={c.case_id}
                className="p-5 rounded-xl border border-neutral-200 bg-white shadow-xs hover:border-neutral-300 transition-all flex items-center justify-between"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-neutral-900">{c.name}</h3>
                  <p className="text-xs text-neutral-500">
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

      {/* STEP 1: Add Document Pack */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-neutral-900">1. Add document pack</h2>
        <div className="p-6 rounded-xl border border-dashed border-neutral-300 bg-white text-center space-y-3">
          <UploadCloud className="w-8 h-8 text-neutral-400 mx-auto" />
          <div>
            <label className="cursor-pointer inline-block px-4 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs transition-colors">
              Choose one or more documents
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.csv"
                onChange={handleFileSelection}
                className="hidden"
              />
            </label>
            <p className="text-[11px] text-neutral-500 mt-1.5">PDF, DOCX, TXT, MD, CSV supported</p>
          </div>
        </div>

        {/* Selected files preview table */}
        {selectedFiles.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
            <div className="p-3 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-700">
              Selected Files ({selectedFiles.length})
            </div>
            <div className="divide-y divide-neutral-200">
              {selectedFiles.map((item, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-4 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                    <span className="font-medium text-neutral-800 truncate">{item.file.name}</span>
                    <span className="text-xs text-neutral-400 shrink-0">({(item.file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs text-neutral-500 font-medium">Type:</label>
                    <select
                      value={item.type}
                      onChange={e => {
                        const next = [...selectedFiles];
                        next[idx].type = e.target.value as DocumentType;
                        setSelectedFiles(next);
                      }}
                      className="text-xs border border-neutral-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="contract">Contract</option>
                      <option value="invoice">Invoice</option>
                      <option value="purchase_order">Purchase Order</option>
                      <option value="policy">Payment Policy</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex justify-end">
              <button
                id="upload-pack-btn"
                onClick={handleUploadPack}
                disabled={uploading}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
              >
                {uploading ? 'Parsing & Indexing...' : 'Upload document pack'}
              </button>
            </div>
          </div>
        )}

        {uploadMessage && (
          <div className="p-3 rounded-lg bg-neutral-100 text-neutral-800 text-xs font-medium">
            {uploadMessage}
          </div>
        )}

        {/* Existing documents accordion */}
        {caseDetail.documents && caseDetail.documents.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Documents in this case ({caseDetail.documents.length})
            </h3>
            <div className="divide-y divide-neutral-100">
              {caseDetail.documents.map(d => (
                <div key={d.document_id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-neutral-500" />
                    <span className="font-semibold text-neutral-900">{d.filename}</span>
                    <span className="text-neutral-400">·</span>
                    <span className="text-neutral-600">{DOCUMENT_LABELS[d.document_type] || d.document_type}</span>
                    <span className="text-neutral-400">·</span>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono text-[10px]">
                      {d.status}
                    </span>
                  </div>
                  <div className="text-neutral-400 font-mono text-[10px]">
                    SHA-256: {d.sha256.slice(0, 8)}... · {(d.size_bytes / 1024).toFixed(1)} KB
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* STEP 2: Analyze Case */}
      <div className="space-y-4 pt-4 border-t border-neutral-200">
        <h2 className="text-base font-bold text-neutral-900">2. Analyze case</h2>

        <div className="flex items-center gap-3">
          <button
            id="analyze-case-btn"
            onClick={handleRunAnalysis}
            disabled={caseDetail.readiness === 'blocked' || activeWorkflow?.status === 'running'}
            className="px-6 py-2.5 rounded-lg bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
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
                        <div className="pt-2 border-t border-neutral-100 space-y-1.5">
                          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                            Evidence ({issue.evidence.length})
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
              <button
                id="review-findings-btn"
                onClick={() => onNavigateToReviews(caseDetail.case_id)}
                className="px-5 py-2 rounded-lg bg-neutral-900 text-white font-semibold text-xs hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Review findings ({activeWorkflow.result.issues?.length || 0})
              </button>

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
    </div>
  );
}
