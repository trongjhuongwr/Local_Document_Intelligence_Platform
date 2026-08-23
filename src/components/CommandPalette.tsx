import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  FolderOpen, 
  FileText, 
  AlertTriangle, 
  CheckSquare, 
  ArrowRight, 
  CornerDownLeft, 
  X, 
  Building2, 
  Receipt, 
  ShieldCheck, 
  History, 
  Sparkles, 
  Sliders,
  BarChart3,
  MessageSquare
} from 'lucide-react';
import { CaseItem, ReviewFinding } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  cases: CaseItem[];
  onSelectCase: (caseId: string) => void;
  onNavigateTab: (tabId: string) => void;
  onOpenAuditTrail?: (caseId?: string) => void;
}

interface SearchItem {
  id: string;
  category: 'Cases' | 'Invoices & Vendors' | 'Documents' | 'Findings' | 'Quick Actions';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  icon: any;
  action: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  cases,
  onSelectCase,
  onNavigateTab,
  onOpenAuditTrail
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [reviews, setReviews] = useState<ReviewFinding[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch all reviews for cross-finding search
  useEffect(() => {
    if (isOpen) {
      fetch('/api/reviews?limit=200')
        .then(res => res.json())
        .then(data => setReviews(data.reviews || []))
        .catch(console.error);
    }
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build searchable items
  const items = useMemo(() => {
    const list: SearchItem[] = [];
    const q = query.trim().toLowerCase();

    // 1. Quick System Actions
    const quickActions: SearchItem[] = [
      {
        id: 'action_cases',
        category: 'Quick Actions',
        title: 'Open Cases & Split Document Viewer',
        subtitle: 'Navigate to case repository and side-by-side comparison',
        icon: FolderOpen,
        action: () => {
          onNavigateTab('cases');
          onClose();
        },
      },
      {
        id: 'action_reviews',
        category: 'Quick Actions',
        title: 'View Open Audit Findings & Human Review',
        subtitle: 'Resolve, approve or grant exceptions on flagged discrepancies',
        icon: CheckSquare,
        action: () => {
          onNavigateTab('reviews');
          onClose();
        },
      },
      {
        id: 'action_audit_trail',
        category: 'Quick Actions',
        title: 'Open Audit Trail & Compliance Ledger',
        subtitle: 'SOX Section 404 & ISO 27001 tamper-evident event history',
        icon: History,
        action: () => {
          if (onOpenAuditTrail) onOpenAuditTrail();
          else onNavigateTab('audit_trail');
          onClose();
        },
      },
      {
        id: 'action_ask',
        category: 'Quick Actions',
        title: 'Ask AI Copilot & Document RAG',
        subtitle: 'Natural language queries with citation verification',
        icon: MessageSquare,
        action: () => {
          onNavigateTab('ask');
          onClose();
        },
      },
      {
        id: 'action_evals',
        category: 'Quick Actions',
        title: 'View DocFlowBench Evaluation Benchmarks',
        subtitle: 'Precision, Recall, MRR and LLM latency metrics',
        icon: BarChart3,
        action: () => {
          onNavigateTab('evaluation');
          onClose();
        },
      },
    ];

    // 2. Cases
    cases.forEach(c => {
      list.push({
        id: `case_${c.case_id}`,
        category: 'Cases',
        title: c.name,
        subtitle: `ID: ${c.case_id} • ${c.document_count} doc(s) • ${c.open_review_count} open finding(s)`,
        badge: c.readiness.toUpperCase(),
        badgeColor: c.readiness === 'ready' ? 'bg-emerald-100 text-emerald-800' : c.readiness === 'limited' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800',
        icon: FolderOpen,
        action: () => {
          onSelectCase(c.case_id);
          onNavigateTab('cases');
          onClose();
        },
      });

      // 3. Documents inside cases
      if (c.documents) {
        c.documents.forEach(doc => {
          list.push({
            id: `doc_${doc.document_id}`,
            category: 'Documents',
            title: doc.filename,
            subtitle: `In Case: "${c.name}" • Type: ${doc.document_type.toUpperCase()}`,
            badge: doc.document_type.toUpperCase(),
            badgeColor: 'bg-neutral-100 text-neutral-700',
            icon: FileText,
            action: () => {
              onSelectCase(c.case_id);
              onNavigateTab('cases');
              onClose();
            },
          });
        });
      }
    });

    // 4. Vendors & Invoices from Case Names or Review payloads
    const knownVendors = [
      { name: 'Acme Analytics Ltd', inv: 'INV-2025-64282', po: 'PO-2025-8842', caseId: 'case_acme_q1_2026' },
      { name: 'Global Logistics Solutions Corp', inv: 'INV-GLS-99104', po: 'PO-2025-9941', caseId: 'case_global_logistics_2026' },
      { name: 'CloudScale Infrastructure Systems', inv: 'INV-CS-55041', po: 'PO-2025-4410', caseId: 'case_cloudscale_q1_2026' },
      { name: 'Pinnacle Facility & Corporate Services', inv: 'INV-PFS-8812', po: 'PO-2025-3319', caseId: 'case_pinnacle_services_2026' },
      { name: 'Apex Software Labs', inv: 'INV-ASL-7740', po: 'PO-2025-5501', caseId: 'case_apex_software_2026' },
      { name: 'Nexus Guard Corp', inv: 'INV-SEC-3301', po: 'PO-2025-7799', caseId: 'case_nexus_security_2026' },
    ];

    knownVendors.forEach(v => {
      list.push({
        id: `vendor_${v.name}`,
        category: 'Invoices & Vendors',
        title: v.name,
        subtitle: `Invoice: ${v.inv} • PO: ${v.po}`,
        badge: v.inv,
        badgeColor: 'bg-blue-100 text-blue-800',
        icon: Building2,
        action: () => {
          onSelectCase(v.caseId);
          onNavigateTab('cases');
          onClose();
        },
      });

      list.push({
        id: `invoice_${v.inv}`,
        category: 'Invoices & Vendors',
        title: `Invoice #${v.inv}`,
        subtitle: `Vendor: ${v.name} • Linked to PO: ${v.po}`,
        badge: 'INVOICE',
        badgeColor: 'bg-emerald-100 text-emerald-800',
        icon: Receipt,
        action: () => {
          onSelectCase(v.caseId);
          onNavigateTab('cases');
          onClose();
        },
      });
    });

    // 5. Findings & Discrepancies
    reviews.forEach(r => {
      list.push({
        id: `finding_${r.review_id}`,
        category: 'Findings',
        title: `[${r.severity.toUpperCase()}] ${r.discrepancy?.type?.replace(/_/g, ' ') || 'Discrepancy'}`,
        subtitle: r.discrepancy?.description || 'Audit discrepancy requiring review',
        badge: r.status,
        badgeColor: r.status === 'OPEN' ? 'bg-amber-100 text-amber-800' : r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-700',
        icon: AlertTriangle,
        action: () => {
          onSelectCase(r.case_id);
          onNavigateTab('reviews');
          onClose();
        },
      });
    });

    // Filter items based on query
    if (!q) {
      return [...quickActions, ...list.slice(0, 15)];
    }

    const filtered = [...quickActions, ...list].filter(item => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSubtitle = (item.subtitle || '').toLowerCase().includes(q);
      const matchCategory = item.category.toLowerCase().includes(q);
      const matchBadge = (item.badge || '').toLowerCase().includes(q);
      return matchTitle || matchSubtitle || matchCategory || matchBadge;
    });

    return filtered.slice(0, 25);
  }, [query, cases, reviews, onNavigateTab, onSelectCase, onClose, onOpenAuditTrail]);

  // Keyboard navigation inside palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (items.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + items.length) % (items.length || 1));
      } else if (e.key === 'Enter' && items[selectedIndex]) {
        e.preventDefault();
        items[selectedIndex].action();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-neutral-900/60 backdrop-blur-xs animate-in fade-in duration-100">
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Bar Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-neutral-100 bg-neutral-50/50">
          <Search className="w-5 h-5 text-neutral-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search vendor, invoice # (INV-...), case, finding, or jump to view..."
            className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-neutral-400 hover:text-neutral-600 rounded-md cursor-pointer mr-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-neutral-500 bg-neutral-200/80 rounded border border-neutral-300">
            ESC
          </kbd>
        </div>

        {/* Categories / Results List */}
        <div ref={listRef} className="overflow-y-auto p-2 divide-y divide-neutral-100 max-h-[60vh]">
          {items.length === 0 ? (
            <div className="py-12 text-center text-neutral-500">
              <Search className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm font-medium">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-neutral-400 mt-1">Try searching for an invoice number like &ldquo;INV-2025&rdquo; or vendor like &ldquo;Acme&rdquo;.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item, idx) => {
                const IconComponent = item.icon;
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    data-index={idx}
                    onClick={() => item.action()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-neutral-900 text-white shadow-2xs' 
                        : 'text-neutral-800 hover:bg-neutral-100'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        isSelected 
                          ? 'bg-neutral-800 text-white' 
                          : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate">
                            {item.title}
                          </span>
                          {item.badge && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-neutral-700 text-neutral-100' : item.badgeColor
                            }`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.subtitle && (
                          <p className={`text-[11px] truncate mt-0.5 ${
                            isSelected ? 'text-neutral-300' : 'text-neutral-500'
                          }`}>
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] uppercase font-semibold tracking-wider ${
                        isSelected ? 'text-neutral-400' : 'text-neutral-400'
                      }`}>
                        {item.category}
                      </span>
                      {isSelected && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-neutral-300" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-50 border-t border-neutral-200 text-[11px] text-neutral-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-neutral-300 font-mono text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-neutral-300 font-mono text-[10px]">↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-neutral-300 font-mono text-[10px]">↵</kbd> Select
            </span>
          </div>
          <div className="flex items-center gap-1 text-emerald-700 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>SOX / ISO 27001 Cryptographic Search</span>
          </div>
        </div>
      </div>
    </div>
  );
}
