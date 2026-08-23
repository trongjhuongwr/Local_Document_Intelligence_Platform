import React from 'react';
import { CaseItem } from '../types';
import { ReadinessChip } from './StatusBadges';
import { 
  ArrowRight, 
  Sparkles, 
  FolderPlus, 
  FileText, 
  CheckCircle2, 
  Search, 
  Briefcase, 
  AlertTriangle, 
  ShieldCheck,
  History,
  CheckSquare,
  Layers
} from 'lucide-react';

interface HomeViewProps {
  cases: CaseItem[];
  onCreateCase: () => void;
  onTrySampleCase: () => void;
  onOpenCase: (caseId: string) => void;
  onNavigateToReviews?: (caseId?: string) => void;
  onNavigateToAuditTrail?: (caseId?: string) => void;
  loadingSample: boolean;
}

export function HomeView({ 
  cases, 
  onCreateCase, 
  onTrySampleCase, 
  onOpenCase, 
  onNavigateToReviews,
  onNavigateToAuditTrail,
  loadingSample 
}: HomeViewProps) {
  // Compute key summary metrics
  const totalCases = cases.length;
  const totalOpenFindings = cases.reduce((acc, c) => acc + (c.open_review_count || 0), 0);
  const totalDocuments = cases.reduce((acc, c) => acc + (c.document_count || 0), 0);
  
  // Calculate average compliance rate (Cases with 0 open findings or 'ready' status vs total)
  const fullyCompliantCases = cases.filter(c => (c.open_review_count === 0 && c.readiness === 'ready')).length;
  const averageComplianceRate = totalCases > 0 ? Math.round((fullyCompliantCases / totalCases) * 100) : 100;

  // Breakdown by readiness status
  const readyCases = cases.filter(c => c.readiness === 'ready').length;

  const steps = [
    {
      num: '1',
      title: 'Create case',
      desc: 'Give the document review a clear business name.',
      icon: FolderPlus,
    },
    {
      num: '2',
      title: 'Add document pack',
      desc: 'Upload contract, invoice, purchase order, and policy.',
      icon: FileText,
    },
    {
      num: '3',
      title: 'Analyze discrepancies',
      desc: 'Structured extraction plus deterministic arithmetic and constraint checks.',
      icon: Search,
    },
    {
      num: '4',
      title: 'Review findings',
      desc: 'Approve or reject each finding with an immutable audit trail.',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-10">
      {/* Header section */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
          Enterprise Document Intelligence Workspace
        </div>
        <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
          Review document packs with cryptographic evidence, not guesswork
        </h1>
        <p className="mt-2 text-base text-neutral-600 max-w-3xl leading-relaxed">
          Cross-examine contracts, invoices, purchase orders, and payment policies on a local runtime. Zero hallucinations, pure deterministic verification with SHA-256 audit trails.
        </p>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            id="home-create-case-btn"
            onClick={onCreateCase}
            className="px-5 py-2.5 rounded-lg bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
          >
            Create a case
          </button>
          <button
            id="home-sample-case-btn"
            onClick={onTrySampleCase}
            disabled={loadingSample}
            className="px-5 py-2.5 rounded-lg bg-white border border-neutral-300 text-neutral-800 font-semibold text-sm hover:bg-neutral-50 hover:border-neutral-400 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>{loadingSample ? 'Preparing sample pack...' : 'Try a sample case'}</span>
          </button>
          {onNavigateToReviews && totalOpenFindings > 0 && (
            <button
              onClick={() => onNavigateToReviews()}
              className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <CheckSquare className="w-4 h-4" />
              <span>Review {totalOpenFindings} Open Finding(s)</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Metric Summary Cards & Risk Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-neutral-200 bg-white shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Active Cases</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900">{totalCases}</span>
              <span className="text-xs font-medium text-neutral-500">{totalDocuments} docs</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-200 bg-white shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Open Findings</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600">{totalOpenFindings}</span>
              <span className="text-xs font-medium text-neutral-500">pending</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-200 bg-white shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Pack Readiness</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{readyCases}</span>
              <span className="text-xs font-medium text-neutral-500">/ {totalCases} ready</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-200 bg-white shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Clean Rate</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-600">{averageComplianceRate}%</span>
              <span className="text-xs font-medium text-neutral-500">verified</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      <hr className="border-neutral-200" />

      {/* How it works */}
      <div>
        <h2 className="text-lg font-bold text-neutral-900 mb-4">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {steps.map(step => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="p-5 rounded-xl border border-neutral-200 bg-white shadow-xs hover:border-neutral-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-neutral-400">Step {step.num}</span>
                    <div className="w-7 h-7 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-600">
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-neutral-900">{step.title}</h3>
                  <p className="mt-1 text-xs text-neutral-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent cases with direct quick action triggers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900">Recent cases</h2>
          <span className="text-xs text-neutral-500">Showing top {Math.min(5, cases.length)} recent workspace(s)</span>
        </div>

        {cases.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-neutral-300 bg-white">
            <h4 className="text-sm font-semibold text-neutral-800">No cases yet</h4>
            <p className="text-xs text-neutral-500 mt-1">
              Create your first case or open the sample workflow above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
            {cases.slice(0, 5).map(c => (
              <div
                key={c.case_id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/70 transition-colors"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900">{c.name}</span>
                    <span className="text-[10px] font-mono bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded border border-neutral-200">
                      {c.case_id}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-500 mt-0.5">
                    Updated {c.updated_at ? c.updated_at.slice(0, 10) : 'recent'} · {c.document_count} document(s) ingested
                  </span>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <ReadinessChip readiness={c.readiness} />
                  
                  {c.open_review_count > 0 && onNavigateToReviews && (
                    <button
                      onClick={() => onNavigateToReviews(c.case_id)}
                      className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Jump straight to open findings review for this case"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      <span>{c.open_review_count} finding(s)</span>
                    </button>
                  )}

                  {onNavigateToAuditTrail && (
                    <button
                      onClick={() => onNavigateToAuditTrail(c.case_id)}
                      className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-neutral-200"
                      title="Inspect SHA-256 Audit Trail"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    id={`open-case-${c.case_id}`}
                    onClick={() => onOpenCase(c.case_id)}
                    className="px-3.5 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <span>Open Case</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
