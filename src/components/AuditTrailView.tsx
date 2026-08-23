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
import { AuditTrailEntry, CaseItem, AuditAction } from '../types';

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
  const [entries, setEntries] = useState<AuditTrailEntry[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [chainValid, setChainValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [activeCaseFilter, setActiveCaseFilter] = useState<string>(selectedCaseId || 'ALL');
  const [selectedEntry, setSelectedEntry] = useState<AuditTrailEntry | null>(null);
  
  // Attestation modal
  const [attestationModalOpen, setAttestationModalOpen] = useState(false);
  const [attestActor, setAttestActor] = useState('Senior Lead Auditor (SOX Compliance)');
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

    fetch(`/api/audit-trail?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setEntries(data.entries || []);
        setTotalRecords(data.total || 0);
        setChainValid(data.chain_valid !== false);
      })
      .catch(err => {
        console.error('Failed to fetch audit trail:', err);
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
      const res = await fetch('/api/audit-trail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: attestCaseId || undefined,
          actor: attestActor.trim(),
          details: attestDetails.trim(),
          metadata: {
            standard: 'SOX-404-Attestation',
            attestation_scope: 'Financial & Contractual Discrepancy Reconciliation',
          },
        }),
      });

      if (res.ok) {
        showToast('Compliance attestation cryptographically recorded to ledger');
        setAttestDetails('');
        setAttestationModalOpen(false);
        fetchAuditTrail();
      }
    } catch (err) {
      console.error(err);
      showToast('Error recording attestation');
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
        return { label: 'Doc Ingested', bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: FileText };
      case 'WORKFLOW_STARTED':
        return { label: 'Audit Started', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Play };
      case 'WORKFLOW_COMPLETED':
        return { label: 'Audit Completed', bg: 'bg-purple-50 text-purple-700 border-purple-200', icon: CheckCircle2 };
      case 'FINDING_APPROVED':
        return { label: 'Approved', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 };
      case 'FINDING_REJECTED':
        return { label: 'Rejected / Exception', bg: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle };
      case 'FINDING_RESOLVED':
        return { label: 'Resolved', bg: 'bg-teal-50 text-teal-700 border-teal-200', icon: CheckCircle2 };
      case 'FINDING_BATCH_ACTION':
        return { label: 'Batch Action', bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: Layers };
      case 'CASE_CREATED':
        return { label: 'Case Created', bg: 'bg-neutral-100 text-neutral-800 border-neutral-200', icon: FolderOpen };
      case 'MANUAL_ATTESTATION':
        return { label: 'Auditor Sign-off', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold', icon: ShieldCheck };
      default:
        return { label: action, bg: 'bg-neutral-100 text-neutral-700 border-neutral-200', icon: History };
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50/50">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-neutral-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-neutral-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <header className="bg-white border-b border-neutral-200 px-6 py-5 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-neutral-900 text-white">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                  Audit Trail & Compliance Ledger
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    SOX 404 & ISO 27001
                  </span>
                </h1>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Immutable, cryptographically chained record of all document ingestions, automated rule evaluations, and auditor decisions.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setAttestationModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Record Auditor Sign-Off</span>
            </button>

            <div className="flex items-center rounded-xl bg-neutral-100 p-0.5 border border-neutral-200">
              <button
                onClick={() => handleExport('csv')}
                className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title="Export as CSV spreadsheet"
              >
                CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title="Export as JSON audit ledger"
              >
                JSON
              </button>
            </div>

            <button
              onClick={fetchAuditTrail}
              className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition-colors cursor-pointer"
              title="Refresh ledger records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-neutral-900' : ''}`} />
            </button>
          </div>
        </div>

        {/* Cryptographic Ledger Summary Status */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${chainValid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {chainValid ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-[11px] font-medium text-neutral-500">Cryptographic Integrity</p>
                <p className="text-xs font-bold text-neutral-900">
                  {chainValid ? 'Tamper-Proof Chain Intact' : 'Chain Inconsistency Detected'}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-white border border-neutral-200 text-neutral-600">
              SHA-256
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                <Hash className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-neutral-500">Total Audit Events</p>
                <p className="text-xs font-bold text-neutral-900">{totalRecords} Immutable Records</p>
              </div>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              Ledger Active
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-neutral-500">Compliance Standard</p>
                <p className="text-xs font-bold text-neutral-900">SOX 404 & ISO/IEC 27001</p>
              </div>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
              Auditable
            </span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search event details, actor, SHA-256 hash or case..."
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Case filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-neutral-500 whitespace-nowrap">Case:</span>
            <select
              value={activeCaseFilter}
              onChange={e => setActiveCaseFilter(e.target.value)}
              className="bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            >
              <option value="ALL">All Cases ({cases.length})</option>
              {cases.map(c => (
                <option key={c.case_id} value={c.case_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Action filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-neutral-500 whitespace-nowrap">Action:</span>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            >
              <option value="ALL">All Actions</option>
              <option value="DOCUMENT_INGESTED">Document Ingested</option>
              <option value="WORKFLOW_COMPLETED">Workflow Completed</option>
              <option value="FINDING_APPROVED">Finding Approved</option>
              <option value="FINDING_REJECTED">Finding Rejected</option>
              <option value="MANUAL_ATTESTATION">Auditor Sign-off</option>
              <option value="CASE_CREATED">Case Created</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Content: Timeline & Entries Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-400 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-neutral-900" />
            <p className="text-xs font-medium">Verifying cryptographic hash chain & loading ledger...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center max-w-lg mx-auto mt-8">
            <History className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-neutral-900">No Audit Events Found</h3>
            <p className="text-xs text-neutral-500 mt-1">
              No ledger events matched your filter criteria. Try clearing filters or recording a new auditor sign-off.
            </p>
            <button
              onClick={() => {
                setActiveCaseFilter('ALL');
                setFilterAction('ALL');
                setSearchQuery('');
              }}
              className="mt-4 px-3.5 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-6xl mx-auto">
            {entries.map((entry, idx) => {
              const badge = getActionBadge(entry.action);
              const IconComp = badge.icon;
              const formattedTime = new Date(entry.timestamp).toLocaleString(undefined, {
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
                  className="bg-white rounded-xl border border-neutral-200 hover:border-neutral-300 hover:shadow-xs transition-all p-4 cursor-pointer"
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
                              className="text-[11px] font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                            >
                              <FolderOpen className="w-3 h-3 text-neutral-500" />
                              <span className="truncate max-w-[200px]">{entry.case_name}</span>
                            </span>
                          )}

                          <span className="text-[11px] text-neutral-400 font-mono">
                            {entry.log_id}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-neutral-900 mt-1.5 leading-snug">
                          {entry.details}
                        </p>

                        {/* Metadata Snippet */}
                        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-neutral-600">
                            {entry.metadata.filename && (
                              <span className="bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded font-mono text-[10px]">
                                📄 {entry.metadata.filename}
                              </span>
                            )}
                            {entry.metadata.findings_count !== undefined && (
                              <span className="bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                                ⚠️ {entry.metadata.findings_count} finding(s)
                              </span>
                            )}
                            {entry.metadata.sha256 && (
                              <span className="bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded font-mono text-[10px] text-neutral-500">
                                SHA: {entry.metadata.sha256.substring(0, 10)}...
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actor, Timestamp & Cryptographic Hash */}
                    <div className="flex flex-row lg:flex-col lg:items-end justify-between items-center shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-neutral-100 text-right gap-1">
                      <div className="flex items-center gap-1.5 text-neutral-600 text-xs font-medium">
                        <User className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="font-semibold">{entry.actor}</span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-neutral-400">
                        <Calendar className="w-3 h-3" />
                        <span>{formattedTime}</span>
                      </div>

                      <div 
                        onClick={e => {
                          e.stopPropagation();
                          handleCopy(entry.integrity_hash, entry.log_id);
                        }}
                        className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 hover:text-neutral-700 bg-neutral-50 hover:bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200 transition-colors"
                        title="Click to copy full SHA-256 block hash"
                      >
                        <KeyRound className="w-3 h-3 text-neutral-400" />
                        <span>{entry.integrity_hash.substring(0, 12)}...</span>
                        {copiedHash === entry.log_id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setSelectedEntry(null)}
        >
          <div 
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-neutral-900">Audit Record Cryptographic Proof</h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Log Record ID:</span>
                  <span className="font-mono font-bold text-neutral-800">{selectedEntry.log_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Timestamp (ISO 8601):</span>
                  <span className="font-mono text-neutral-800">{selectedEntry.timestamp}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Action:</span>
                  <span className="font-semibold text-neutral-900">{selectedEntry.action}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Recorded By (Actor):</span>
                  <span className="font-bold text-neutral-900">{selectedEntry.actor}</span>
                </div>
                {selectedEntry.case_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 font-medium">Case:</span>
                    <span className="font-semibold text-neutral-900">{selectedEntry.case_name}</span>
                  </div>
                )}
              </div>

              {/* Details text */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-neutral-500 tracking-wider mb-1">
                  Event Statement & Audit Trail
                </label>
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-800 font-medium leading-relaxed">
                  {selectedEntry.details}
                </div>
              </div>

              {/* Cryptographic Ledger Hashes */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-neutral-500 tracking-wider mb-1">
                  Cryptographic Integrity (SOX 404 Immutable Blockchain Chain)
                </label>
                <div className="p-3 bg-neutral-900 text-neutral-200 rounded-xl font-mono text-[11px] space-y-2">
                  <div>
                    <span className="text-neutral-400 block text-[10px]">CURRENT BLOCK SHA-256 SIGNATURE:</span>
                    <span className="text-emerald-400 break-all">{selectedEntry.integrity_hash}</span>
                  </div>
                  <div className="pt-2 border-t border-neutral-800">
                    <span className="text-neutral-400 block text-[10px]">PREVIOUS BLOCK SHA-256 LINK:</span>
                    <span className="text-amber-400 break-all">{selectedEntry.prev_hash}</span>
                  </div>
                </div>
              </div>

              {/* Raw JSON Payload */}
              {selectedEntry.metadata && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-neutral-500 tracking-wider mb-1">
                    Attached Record Metadata
                  </label>
                  <pre className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 font-mono text-[10px] text-neutral-800 overflow-x-auto max-h-36">
                    {JSON.stringify(selectedEntry.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> Tamper-evident ledger entry
              </span>
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-1.5 bg-neutral-900 text-white rounded-xl text-xs font-semibold hover:bg-neutral-800 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Manual Attestation Modal */}
      {attestationModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setAttestationModalOpen(false)}
        >
          <div 
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <form onSubmit={handleCreateAttestation}>
              {/* Header */}
              <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/50">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-neutral-900">Record Auditor Sign-Off & Attestation</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAttestationModalOpen(false)}
                  className="p-1 text-neutral-400 hover:text-neutral-600 rounded-md cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Auditor Name / Authority Title
                  </label>
                  <input
                    type="text"
                    value={attestActor}
                    onChange={e => setAttestActor(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Target Case Reference
                  </label>
                  <select
                    value={attestCaseId}
                    onChange={e => setAttestCaseId(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900"
                  >
                    <option value="">Global / Multi-Case Attestation</option>
                    {cases.map(c => (
                      <option key={c.case_id} value={c.case_id}>
                        {c.name} ({c.case_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Attestation Finding & Compliance Sign-Off Statement
                  </label>
                  <textarea
                    value={attestDetails}
                    onChange={e => setAttestDetails(e.target.value)}
                    required
                    rows={4}
                    placeholder="E.g., All Q1 invoice variances have been reconciled against the master service contract amendment and approved under policy authorization."
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 resize-none"
                  />
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <p>
                    Once submitted, this attestation will be hashed with SHA-256 and immutably appended to the SOX compliance audit trail. It cannot be altered or deleted.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAttestationModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAttest || !attestDetails.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-xl transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  {submittingAttest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>Sign & Append to Ledger</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
