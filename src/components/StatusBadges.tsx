import React from 'react';
import { Severity, ReviewStatus, CaseReadiness } from '../types';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

export function SeverityBadge({ severity }: { severity: Severity | string }) {
  const { lang, t } = useThemeLanguage();
  const s = severity.toLowerCase();
  
  if (s === 'high') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
        {lang === 'vi' ? 'CAO' : 'HIGH'}
      </span>
    );
  }
  if (s === 'medium') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
        {lang === 'vi' ? 'TRUNG BÌNH' : 'MEDIUM'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
      {lang === 'vi' ? 'THẤP' : 'LOW'}
    </span>
  );
}

export function StatusChip({ status }: { status: ReviewStatus | string }) {
  const { lang } = useThemeLanguage();
  const st = status.toUpperCase();

  if (st === 'OPEN' || st === 'PENDING') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
        ● {lang === 'vi' ? 'CHỜ THẨM ĐỊNH' : 'OPEN'}
      </span>
    );
  }
  if (st === 'APPROVED') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
        ✓ {lang === 'vi' ? 'ĐÃ PHÊ DUYỆT' : 'APPROVED'}
      </span>
    );
  }
  if (st === 'REJECTED') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50">
        ✕ {lang === 'vi' ? 'TỪ CHỐI / BÁC BỎ' : 'REJECTED'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
      {lang === 'vi' ? 'ĐÃ XỬ LÝ' : 'RESOLVED'}
    </span>
  );
}

export function ReadinessChip({ readiness }: { readiness: CaseReadiness | string }) {
  const { lang } = useThemeLanguage();
  const r = readiness.toLowerCase();

  if (r === 'ready') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
        {lang === 'vi' ? 'Sẵn sàng kiểm toán' : 'Audit Ready'}
      </span>
    );
  }
  if (r === 'limited' || r === 'needs_review') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
        {lang === 'vi' ? 'Cần thẩm định' : 'Needs Review'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
      {lang === 'vi' ? 'Hồ sơ nháp' : 'Draft'}
    </span>
  );
}

export function NeutralChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium border border-neutral-200 dark:border-neutral-700">
      {children}
    </span>
  );
}

