import React from 'react';
import { CaseItem } from '../types';
import { ReadinessChip } from './StatusBadges';
import { ArrowRight, Sparkles, FolderPlus, FileText, CheckCircle2, Search, Sliders } from 'lucide-react';

interface HomeViewProps {
  cases: CaseItem[];
  onCreateCase: () => void;
  onTrySampleCase: () => void;
  onOpenCase: (caseId: string) => void;
  loadingSample: boolean;
}

export function HomeView({ cases, onCreateCase, onTrySampleCase, onOpenCase, loadingSample }: HomeViewProps) {
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
          Document intelligence workspace
        </div>
        <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
          Review document packs with evidence, not guesswork
        </h1>
        <p className="mt-2 text-base text-neutral-600 max-w-3xl">
          Create a case, add business documents, and run a traceable discrepancy review entirely on your machine.
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

      {/* Recent cases */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900">Recent cases</h2>
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
                className="p-4 flex items-center justify-between hover:bg-neutral-50/70 transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-neutral-900">{c.name}</span>
                  <span className="text-xs text-neutral-500 mt-0.5">
                    Updated {c.updated_at ? c.updated_at.slice(0, 10) : 'recent'} · {c.document_count} documents
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <ReadinessChip readiness={c.readiness} />
                    <span className="text-xs text-neutral-600 font-medium">
                      {c.open_review_count} open finding(s)
                    </span>
                  </div>
                  <button
                    id={`open-case-${c.case_id}`}
                    onClick={() => onOpenCase(c.case_id)}
                    className="px-3.5 py-1.5 rounded-lg border border-neutral-300 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open</span>
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
