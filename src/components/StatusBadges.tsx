import React from 'react';
import { Severity, ReviewStatus, CaseReadiness } from '../types';

export function SeverityBadge({ severity }: { severity: Severity | string }) {
  const s = severity.toLowerCase();
  if (s === 'high') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
        HIGH
      </span>
    );
  }
  if (s === 'medium') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
        MEDIUM
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
      LOW
    </span>
  );
}

export function StatusChip({ status }: { status: ReviewStatus | string }) {
  const st = status.toUpperCase();
  if (st === 'OPEN') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-300">
        ● OPEN
      </span>
    );
  }
  if (st === 'APPROVED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-300">
        ✓ APPROVED
      </span>
    );
  }
  if (st === 'REJECTED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-300">
        ✕ REJECTED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 border border-neutral-300">
      RESOLVED
    </span>
  );
}

export function ReadinessChip({ readiness }: { readiness: CaseReadiness | string }) {
  const r = readiness.toLowerCase();
  if (r === 'ready') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        Ready
      </span>
    );
  }
  if (r === 'limited') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        Limited
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      Blocked
    </span>
  );
}

export function NeutralChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded bg-neutral-100 text-neutral-700 text-xs font-medium border border-neutral-200">
      {children}
    </span>
  );
}
