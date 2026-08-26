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
import { useThemeLanguage } from '../context/ThemeLanguageContext';

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
  const { lang, t } = useThemeLanguage();

  // Compute key summary metrics
  const totalCases = cases.length;
  const totalOpenFindings = cases.reduce((acc, c) => acc + (c.open_review_count || 0), 0);
  const totalDocuments = cases.reduce((acc, c) => acc + (c.document_count || 0), 0);

  // Share of cases that hold a complete document pack with no open findings.
  // With no cases loaded there is nothing to report, so show an em dash
  // rather than inventing a percentage.
  const fullyCompliantCases = cases.filter(c => c.open_review_count === 0 && c.readiness === 'complete').length;
  const averageComplianceRate = totalCases > 0 ? Math.round((fullyCompliantCases / totalCases) * 100) : null;

  // Breakdown by readiness status
  const readyCases = cases.filter(c => c.readiness === 'complete').length;

  const steps = [
    {
      num: '1',
      title: lang === 'vi' ? '1. Nạp Tài Liệu Đối Soát' : '1. Ingest Evidence Documents',
      desc: lang === 'vi' ? 'Kéo thả Hợp đồng, Hóa đơn VAT, PO và Chính sách thanh toán' : 'Upload contracts, invoices, purchase orders, and payment policies',
      icon: FolderPlus,
    },
    {
      num: '2',
      title: lang === 'vi' ? '2. Băm Khóa SHA-256 & Bóc Tách' : '2. SHA-256 Hashing & Extraction',
      desc: lang === 'vi' ? 'Tự động tính chuỗi băm chứng cứ toàn vẹn và bóc tách định dạng' : 'Generate cryptographic hashes and extract structured rate cards',
      icon: FileText,
    },
    {
      num: '3',
      title: lang === 'vi' ? '3. Thẩm Định Toán Học & Đối Chiếu' : '3. Deterministic Audit & Reconciliation',
      desc: lang === 'vi' ? 'Kiểm tra thuế VAT, định mức chi trả, đơn giá giờ và ngày hiệu lực' : 'Verify mathematical formulas, rate caps, and cross-doc rules',
      icon: Search,
    },
    {
      num: '4',
      title: lang === 'vi' ? '4. Chứng Thực & Xuất Hồ Sơ' : '4. Attestation & Export',
      desc: lang === 'vi' ? 'Kiểm toán viên ký duyệt và xuất hồ sơ báo cáo PDF/CSV' : 'Record an auditor sign-off and export the dossier as PDF/CSV',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-10">
      {/* Header section */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
          {t.home.heroBadge}
        </div>
        <h1 className="text-3xl font-extrabold text-neutral-900 dark:text-white tracking-tight leading-tight">
          {t.home.welcomeTitle}
        </h1>
        <p className="mt-2.5 text-base text-neutral-600 dark:text-neutral-300 max-w-3xl leading-relaxed">
          {t.home.welcomeSubtitle}
        </p>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            id="home-create-case-btn"
            onClick={onCreateCase}
            className="px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-sm hover:bg-neutral-800 dark:hover:bg-white transition-colors shadow-xs cursor-pointer"
          >
            {t.home.ctaNewCase}
          </button>
          <button
            id="home-sample-case-btn"
            onClick={onTrySampleCase}
            disabled={loadingSample}
            className="px-5 py-2.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60 shadow-2xs"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>{loadingSample ? t.home.loadingSample : t.home.ctaLoadSample}</span>
          </button>
          {onNavigateToReviews && totalOpenFindings > 0 && (
            <button
              onClick={() => onNavigateToReviews()}
              className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <CheckSquare className="w-4 h-4" />
              <span>{lang === 'vi' ? `Xem ${totalOpenFindings} sai lệch chờ duyệt` : `Review ${totalOpenFindings} Open Finding(s)`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Metric Summary Cards & Risk Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              {t.home.statCasesTitle}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 dark:text-white">{totalCases}</span>
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{totalDocuments} {lang === 'vi' ? 'tài liệu' : 'docs'}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              {t.home.statFindingsTitle}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{totalOpenFindings}</span>
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{lang === 'vi' ? 'cần xử lý' : 'pending'}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              {t.home.statReadinessTitle}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{readyCases}</span>
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">/ {totalCases} {lang === 'vi' ? 'đạt chuẩn' : 'ready'}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              {t.home.statComplianceTitle}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 dark:text-white">
                {averageComplianceRate === null ? '—' : `${averageComplianceRate}%`}
              </span>
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{lang === 'vi' ? 'chuẩn hóa' : 'verified'}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      <hr className="border-neutral-200 dark:border-neutral-800" />

      {/* How it works */}
      <div>
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
          {lang === 'vi' ? 'Quy trình đối soát tự động & Thẩm tra chứng từ' : 'How Multi-Document Audit Works'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {steps.map(step => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs hover:border-neutral-300 dark:hover:border-neutral-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500">
                      {lang === 'vi' ? `Bước ${step.num}` : `Step ${step.num}`}
                    </span>
                    <div className="w-7 h-7 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{step.title}</h3>
                  <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent cases with direct quick action triggers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{t.home.recentCasesTitle}</h2>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {lang === 'vi' ? `Hiển thị ${Math.min(5, cases.length)} hồ sơ gần nhất` : `Showing top ${Math.min(5, cases.length)} recent workspace(s)`}
          </span>
        </div>

        {cases.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{t.home.noCasesTitle}</h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {t.home.noCasesDesc}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
            {cases.slice(0, 5).map(c => (
              <div
                key={c.case_id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/70 dark:hover:bg-neutral-800/50 transition-colors"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900 dark:text-white">{c.name}</span>
                    <span className="text-[10px] font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700">
                      {c.case_id}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {lang === 'vi' ? 'Cập nhật' : 'Updated'} {c.updated_at ? c.updated_at.slice(0, 10) : 'recent'} · {c.document_count} {lang === 'vi' ? 'tài liệu đã nạp' : 'document(s) ingested'}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <ReadinessChip readiness={c.readiness} />

                  {c.open_review_count > 0 && onNavigateToReviews && (
                    <button
                      onClick={() => onNavigateToReviews(c.case_id)}
                      className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-semibold border border-amber-200 dark:border-amber-800/80 flex items-center gap-1 cursor-pointer transition-colors"
                      title={lang === 'vi' ? 'Chuyển đến thẩm định sai lệch' : 'Jump to findings review'}
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span>{c.open_review_count} {lang === 'vi' ? 'sai lệch' : 'finding(s)'}</span>
                    </button>
                  )}

                  {onNavigateToAuditTrail && (
                    <button
                      onClick={() => onNavigateToAuditTrail(c.case_id)}
                      className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
                      title={lang === 'vi' ? 'Xem Sổ cái Nhật ký SHA-256' : 'Inspect SHA-256 Audit Trail'}
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    id={`open-case-${c.case_id}`}
                    onClick={() => onOpenCase(c.case_id)}
                    className="px-3.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-white transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <span>{t.home.actionOpen}</span>
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
