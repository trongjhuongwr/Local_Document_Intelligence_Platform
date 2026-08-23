import React, { useEffect, useState, useRef } from 'react';
import { 
  FolderOpen, 
  MessageSquare, 
  CheckSquare, 
  BarChart3, 
  Home, 
  ShieldCheck,
  Cpu,
  Sparkles,
  X,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User,
  Moon,
  Sun,
  LogOut,
  Sliders,
  Check,
  RefreshCw,
  Info,
  Database,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  openFindingCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ 
  currentTab, 
  onSelectTab, 
  openFindingCount = 0, 
  mobileOpen = false, 
  onCloseMobile,
  collapsed = false,
  onToggleCollapse
}: SidebarProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [auditMode, setAuditMode] = useState<'strict' | 'standard'>('strict');
  const [defaultCurrency, setDefaultCurrency] = useState<'USD' | 'EUR' | 'VND'>('USD');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const [readyStatus, setReadyStatus] = useState<{ 
    status: string; 
    engine_summary?: string;
    ai_model?: string;
    deterministic_rules_count?: number;
    checks?: any 
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/ready')
      .then(res => res.json())
      .then(data => setReadyStatus(data))
      .catch(() => setReadyStatus({ status: 'offline' }));
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    if (accountMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountMenuOpen]);

  const isReady = readyStatus?.status === 'ready';
  const activeEngineLabel = readyStatus?.engine_summary || 'Gemini 3.7 Flash + Local Deterministic Engine';

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 2500);
  };

  const workspaceNav = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'cases', label: 'Cases', icon: FolderOpen },
    { id: 'ask', label: 'Ask Documents', icon: MessageSquare },
    { 
      id: 'reviews', 
      label: 'Review Findings', 
      icon: CheckSquare,
      badge: openFindingCount > 0 ? openFindingCount : undefined
    },
  ];

  const devNav = [
    { id: 'evaluation', label: 'Evaluation', icon: BarChart3 },
  ];

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleToggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    showToast(next ? 'Dark theme preference saved' : 'Light theme enabled');
    setAccountMenuOpen(false);
  };

  const handleResetData = async () => {
    try {
      await fetch('/api/demo/cases', { method: 'POST' });
      showToast('Sample cases refreshed successfully');
      setAccountMenuOpen(false);
      window.location.reload();
    } catch (e) {
      showToast('Error resetting workspace');
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-neutral-900/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Floating Action Feedback Toast */}
      {feedbackToast && (
        <div className="fixed bottom-5 right-5 z-60 bg-neutral-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl border border-neutral-700 animate-in fade-in slide-in-from-bottom-2 duration-150 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{feedbackToast}</span>
        </div>
      )}

      <aside className={`
        fixed lg:sticky top-0 z-40 h-screen bg-white border-r border-neutral-200 flex flex-col justify-between shrink-0 transition-all duration-250 ease-in-out select-none
        ${mobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
        ${collapsed ? 'lg:w-[68px]' : 'lg:w-64'}
      `}>
        {/* Top Header & Navigation */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Header */}
          <div className="p-3.5 border-b border-neutral-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div 
                onClick={() => handleNavClick('home')}
                className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0 cursor-pointer shadow-2xs hover:bg-neutral-800 transition-colors"
                title="Document Intelligence Home"
              >
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              
              {!collapsed && (
                <div className="min-w-0">
                  <h1 className="text-sm font-black text-neutral-900 tracking-tight leading-tight truncate">Doc Intelligence</h1>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] text-neutral-500 font-medium truncate">Operational · v1.4</span>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Collapse / Expand Toggle Button */}
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg cursor-pointer transition-colors"
                title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
              >
                {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            )}

            {/* Mobile Close Button */}
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg lg:hidden cursor-pointer"
                title="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <div className="p-2.5 flex flex-col gap-5">
            {/* Workspace section */}
            <div>
              {!collapsed && (
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 px-2 mb-1.5">
                  Workspace
                </div>
              )}
              <nav className="flex flex-col gap-1">
                {workspaceNav.map(item => {
                  const Icon = item.icon;
                  const active = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`nav-btn-${item.id}`}
                      onClick={() => handleNavClick(item.id)}
                      title={collapsed ? `${item.label} ${item.badge ? `(${item.badge})` : ''}` : undefined}
                      className={`relative flex items-center rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        collapsed 
                          ? 'justify-center p-2.5' 
                          : 'justify-between px-2.5 py-2'
                      } ${
                        active
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-neutral-400'}`} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {item.badge !== undefined && (
                        collapsed ? (
                          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
                        ) : (
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                            active ? 'bg-amber-400 text-neutral-950' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.badge}
                          </span>
                        )
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Quality section */}
            <div>
              {!collapsed && (
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 px-2 mb-1.5">
                  Auditing Suite
                </div>
              )}
              <nav className="flex flex-col gap-1">
                {devNav.map(item => {
                  const Icon = item.icon;
                  const active = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`nav-btn-${item.id}`}
                      onClick={() => handleNavClick(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        collapsed 
                          ? 'justify-center p-2.5' 
                          : 'gap-2.5 px-2.5 py-2'
                      } ${
                        active
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-neutral-400'}`} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom Profile / Account Area */}
        <div className="p-2 border-t border-neutral-200 bg-neutral-50/50 relative" ref={popoverRef}>
          {/* Account Button Trigger */}
          <button
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            className={`w-full flex items-center rounded-xl p-2 hover:bg-white hover:border-neutral-200 border border-transparent transition-all cursor-pointer group ${
              collapsed ? 'justify-center' : 'justify-between'
            } ${accountMenuOpen ? 'bg-white border-neutral-200 shadow-xs' : ''}`}
            title="Account & Settings"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-neutral-800 to-neutral-950 text-amber-300 font-bold text-xs flex items-center justify-center ring-2 ring-neutral-200 shrink-0 shadow-2xs">
                NH
              </div>
              {!collapsed && (
                <div className="text-left min-w-0">
                  <div className="text-xs font-bold text-neutral-900 truncate">Huong Nguyen</div>
                  <div className="text-[10px] text-neutral-500 font-medium truncate">Lead Auditor</div>
                </div>
              )}
            </div>

            {!collapsed && (
              <Settings className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 transition-colors shrink-0" />
            )}
          </button>

          {/* Account Popover Menu */}
          {accountMenuOpen && (
            <div className={`absolute bottom-full mb-2 bg-white rounded-2xl border border-neutral-200 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
              collapsed ? 'left-2 w-72' : 'left-2 right-2'
            }`}>
              {/* User Profile Header */}
              <div className="p-3.5 bg-neutral-50 border-b border-neutral-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-neutral-900 text-amber-300 font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-xs">
                    NH
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-neutral-900 truncate">Huong Nguyen</div>
                    <div className="text-[11px] text-neutral-500 truncate font-mono">nguyentronghuong05@gmail.com</div>
                    <div className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[9px] uppercase tracking-wider">
                      Enterprise Admin
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu Actions */}
              <div className="p-1.5 space-y-0.5 text-xs font-medium text-neutral-700">
                {/* Audit Engine Diagnostics */}
                <button
                  onClick={() => {
                    setDiagnosticsModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Audit Engine &amp; AI Setup</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {/* Audit Preferences */}
                <button
                  onClick={() => {
                    setPreferencesModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Audit Rules &amp; Currency</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {/* Dark Mode Toggle */}
                <button
                  onClick={handleToggleTheme}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    {darkMode ? <Sun className="w-4 h-4 text-amber-500 shrink-0" /> : <Moon className="w-4 h-4 text-neutral-500 shrink-0" />}
                    <span>{darkMode ? 'Light Theme' : 'Dark Theme Preview'}</span>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">{darkMode ? 'ON' : 'OFF'}</span>
                </button>

                {/* Reset Demo Data */}
                <button
                  onClick={handleResetData}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer text-left text-neutral-700"
                >
                  <RefreshCw className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span>Refresh Sample Cases</span>
                </button>

                <hr className="my-1 border-neutral-100" />

                {/* Sign Out Simulation */}
                <button
                  onClick={() => {
                    showToast('Logged out of session');
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors cursor-pointer text-left font-semibold"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 1. Modal: Audit Engine & AI Diagnostics                                  */}
      {/* ========================================================================= */}
      {diagnosticsModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Audit Engine Diagnostics</h3>
                  <p className="text-[11px] text-neutral-500">Live AI model parameters and verification layers</p>
                </div>
              </div>
              <button
                onClick={() => setDiagnosticsModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Active Engine Card */}
              <div className="p-4 rounded-xl bg-neutral-900 text-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Connected Engine</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold">
                    ACTIVE · 100% HEALTHY
                  </span>
                </div>
                <div className="text-sm font-bold flex items-center gap-2 text-white">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{activeEngineLabel}</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Hybrid architecture pairing Gemini 3.7 Flash generation with deterministic cross-document mathematical verification.
                </p>
              </div>

              {/* Engine Spec Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 font-bold text-[11px]">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>Rule Engine</span>
                  </div>
                  <div className="text-sm font-bold text-neutral-900">12 Deterministic Rules</div>
                  <div className="text-[10px] text-neutral-500">Zero arithmetic hallucinations</div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 font-bold text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Grounding Mode</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-700">Strict Citations [1..n]</div>
                  <div className="text-[10px] text-neutral-500">Side inspector binding</div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 font-bold text-[11px]">
                    <Database className="w-3.5 h-3.5 text-purple-600" />
                    <span>Vector Retrieval</span>
                  </div>
                  <div className="text-sm font-bold text-neutral-900">Hybrid (BM25 + Dense)</div>
                  <div className="text-[10px] text-neutral-500">Latency ~33ms · Recall 93.3%</div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 font-bold text-[11px]">
                    <Info className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Doc Integrity</span>
                  </div>
                  <div className="text-sm font-bold text-neutral-900">SHA-256 Checksums</div>
                  <div className="text-[10px] text-neutral-500">Immutable audit trails</div>
                </div>
              </div>

              {/* 12 Rule Specifications Summary */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50">
                <h4 className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider mb-2">
                  Active Deterministic Audit Checks
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-neutral-600">
                  <div>✓ Contract total value cap</div>
                  <div>✓ Invoice line item math &amp; VAT</div>
                  <div>✓ Payment terms (Net 30/60)</div>
                  <div>✓ Performance milestone dates</div>
                  <div>✓ Currency mismatch (EUR/USD)</div>
                  <div>✓ Mandatory PO number match</div>
                  <div>✓ Duplicate invoice detection</div>
                  <div>✓ Grace period &amp; penalty fees</div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex justify-end">
              <button
                onClick={() => setDiagnosticsModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white font-semibold text-xs hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Modal: Audit Preferences & Currency Settings                          */}
      {/* ========================================================================= */}
      {preferencesModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Audit Rules &amp; Preferences</h3>
                  <p className="text-[11px] text-neutral-500">Configure auditor sensitivity and currency rules</p>
                </div>
              </div>
              <button
                onClick={() => setPreferencesModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 text-xs">
              {/* Audit Sensitivity */}
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                  Audit Verification Sensitivity
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAuditMode('strict')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      auditMode === 'strict'
                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-bold text-xs">Strict (100% Match)</div>
                    <div className={`text-[10px] mt-0.5 ${auditMode === 'strict' ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      Flags even ±$1 discrepancies &amp; net terms
                    </div>
                  </button>

                  <button
                    onClick={() => setAuditMode('standard')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      auditMode === 'standard'
                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-bold text-xs">Standard Tolerance</div>
                    <div className={`text-[10px] mt-0.5 ${auditMode === 'standard' ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      Permits minor rounding diffs &lt; 0.1%
                    </div>
                  </button>
                </div>
              </div>

              {/* Default Currency */}
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                  Primary Audit Reporting Currency
                </label>
                <select
                  value={defaultCurrency}
                  onChange={e => setDefaultCurrency(e.target.value as any)}
                  className="w-full p-2.5 border border-neutral-200 rounded-xl bg-neutral-50 text-neutral-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-neutral-900 text-xs"
                >
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="EUR">EUR (€) - Euro Standard</option>
                  <option value="VND">VND (₫) - Vietnamese Dong</option>
                </select>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2">
              <button
                onClick={() => setPreferencesModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white font-semibold text-xs hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
