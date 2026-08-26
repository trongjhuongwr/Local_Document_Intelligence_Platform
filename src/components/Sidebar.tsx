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
  ChevronRight,
  History,
  Search,
  Languages,
  Globe
} from 'lucide-react';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { ReadyStatus } from '../types';
import { apiPost, errorMessage } from '../api';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  openFindingCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenCommandPalette?: () => void;
}

export function Sidebar({ 
  currentTab, 
  onSelectTab, 
  openFindingCount = 0, 
  mobileOpen = false, 
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
  onOpenCommandPalette
}: SidebarProps) {
  const { theme, setTheme, toggleTheme, lang, setLang, toggleLang, t } = useThemeLanguage();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'appearance' | 'rules' | 'diagnostics'>('appearance');
  const [auditMode, setAuditMode] = useState<'strict' | 'standard'>('strict');
  const [defaultCurrency, setDefaultCurrency] = useState<'USD' | 'EUR' | 'VND'>(lang === 'vi' ? 'VND' : 'USD');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const [readyStatus, setReadyStatus] = useState<ReadyStatus | null>(null);
  const [readyError, setReadyError] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);

  const refreshReadyStatus = () => {
    // /api/ready answers 503 with the same body when a dependency is down,
    // so read the payload in both cases instead of treating 503 as no data.
    fetch('/api/ready')
      .then(async res => {
        const data = (await res.json()) as ReadyStatus;
        setReadyStatus(data);
        setReadyError(null);
      })
      .catch(err => {
        setReadyStatus(null);
        setReadyError(errorMessage(err));
      });
  };

  useEffect(() => {
    refreshReadyStatus();
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
  // Only ever name the model the backend actually reports (/api/ready ->
  // checks.ollama.llm_model.model, currently llama3.2:1b served by Ollama).
  const llmModel = readyStatus?.checks?.ollama?.llm_model?.model ?? null;
  const embeddingModel = readyStatus?.checks?.ollama?.embedding_model?.model ?? null;
  const activeEngineLabel = llmModel
    ? `${llmModel} (Ollama, local)`
    : lang === 'vi'
      ? 'Chưa xác định được mô hình'
      : 'Model not reported by /api/ready';

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 2500);
  };

  const workspaceNav = [
    { id: 'home', label: t.nav.home, icon: Home },
    { id: 'cases', label: t.nav.cases, icon: FolderOpen },
    { 
      id: 'reviews', 
      label: t.nav.reviews, 
      icon: CheckSquare,
      badge: openFindingCount > 0 ? openFindingCount : undefined
    },
    { id: 'audit_trail', label: t.nav.auditTrail, icon: History },
    { id: 'ask', label: t.nav.ask, icon: MessageSquare },
  ];

  const devNav = [
    { id: 'evaluation', label: t.nav.evaluation, icon: BarChart3 },
  ];

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleToggleTheme = () => {
    toggleTheme();
    showToast(theme === 'light' ? (lang === 'vi' ? 'Đã bật Chế độ Tối' : 'Dark theme enabled') : (lang === 'vi' ? 'Đã bật Chế độ Sáng' : 'Light theme enabled'));
    setAccountMenuOpen(false);
  };

  const handleToggleLang = () => {
    toggleLang();
    const nextLang = lang === 'en' ? 'Tiếng Việt' : 'English';
    showToast(lang === 'en' ? 'Đã chuyển sang Tiếng Việt' : 'Switched to English');
    setAccountMenuOpen(false);
  };

  const handleResetData = async () => {
    try {
      await apiPost('/api/demo/cases');
      showToast(lang === 'vi' ? 'Đã nạp lại hồ sơ mẫu' : 'Demo case provisioned');
      setAccountMenuOpen(false);
      window.location.reload();
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Floating Action Feedback Toast */}
      {feedbackToast && (
        <div className="fixed bottom-5 right-5 z-60 bg-neutral-900 dark:bg-neutral-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl border border-neutral-700 dark:border-neutral-600 animate-in fade-in slide-in-from-bottom-2 duration-150 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{feedbackToast}</span>
        </div>
      )}

      <aside className={`
        fixed lg:sticky top-0 z-40 h-screen bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col justify-between shrink-0 transition-all duration-250 ease-in-out select-none
        ${mobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
        ${collapsed ? 'lg:w-[68px]' : 'lg:w-64'}
      `}>
        {/* Top Header & Navigation */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Header */}
          <div className="p-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div 
                onClick={() => handleNavClick('home')}
                className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-neutral-800 text-white flex items-center justify-center font-bold text-sm shrink-0 cursor-pointer shadow-2xs hover:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors"
                title={t.common.appName}
              >
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              
              {!collapsed && (
                <div className="min-w-0">
                  <h1 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight leading-tight truncate">Doc Intelligence</h1>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium truncate">
                      {isReady ? t.common.statusReady : t.common.statusOffline}
                      {llmModel ? ` · ${llmModel}` : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Collapse / Expand Toggle Button */}
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors"
                title={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
              >
                {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            )}

            {/* Mobile Close Button */}
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg lg:hidden cursor-pointer"
                title={t.common.close}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <div className="p-2.5 flex flex-col gap-4">
            {/* Command Palette Trigger */}
            {onOpenCommandPalette && (
              <button
                onClick={onOpenCommandPalette}
                className={`w-full flex items-center rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-600 dark:text-neutral-300 transition-all cursor-pointer shadow-2xs ${
                  collapsed ? 'justify-center p-2.5' : 'justify-between px-2.5 py-2'
                }`}
                title="Quick Search & Actions (Ctrl + K)"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  {!collapsed && <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 truncate">{t.common.searchPlaceholder}</span>}
                </div>
                {!collapsed && (
                  <kbd className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-semibold text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                    ⌘K
                  </kbd>
                )}
              </button>
            )}

            {/* Workspace section */}
            <div>
              {!collapsed && (
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-2 mb-1.5">
                  {t.nav.workspace}
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
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                          : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${active ? (theme === 'dark' ? 'text-neutral-900' : 'text-white') : 'text-neutral-400 dark:text-neutral-500'}`} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {item.badge !== undefined && (
                        collapsed ? (
                          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-neutral-900" />
                        ) : (
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                            active 
                              ? 'bg-amber-400 text-neutral-950' 
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
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
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-2 mb-1.5">
                  {t.nav.auditingSuite}
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
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                          : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? (theme === 'dark' ? 'text-neutral-900' : 'text-white') : 'text-neutral-400 dark:text-neutral-500'}`} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom Profile / Account Area */}
        <div className="p-2 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40 relative" ref={popoverRef}>
          {/* Account Button Trigger */}
          <button
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            className={`w-full flex items-center rounded-xl p-2 hover:bg-white dark:hover:bg-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700 border border-transparent transition-all cursor-pointer group ${
              collapsed ? 'justify-center' : 'justify-between'
            } ${accountMenuOpen ? 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 shadow-xs' : ''}`}
            title={t.nav.accountAndSettings}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-neutral-800 to-neutral-950 text-amber-300 font-bold text-xs flex items-center justify-center ring-2 ring-neutral-200 dark:ring-neutral-700 shrink-0 shadow-2xs">
                HN
              </div>
              {!collapsed && (
                <div className="text-left min-w-0">
                  <div className="text-xs font-bold text-neutral-900 dark:text-white truncate">Huong Nguyen</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium truncate">{t.nav.leadAuditor}</div>
                </div>
              )}
            </div>

            {!collapsed && (
              <Settings className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors shrink-0" />
            )}
          </button>

          {/* Account Popover Menu */}
          {accountMenuOpen && (
            <div className={`absolute bottom-full mb-2 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
              collapsed ? 'left-2 w-72' : 'left-2 right-2'
            }`}>
              {/* User Profile Header */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-neutral-900 dark:bg-neutral-800 text-amber-300 font-bold text-xs flex items-center justify-center ring-2 ring-white dark:ring-neutral-700 shadow-xs">
                    HN
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-neutral-900 dark:text-white truncate">Huong Nguyen</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate font-mono">nguyentronghuong05@gmail.com</div>
                    <div className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold text-[9px] uppercase tracking-wider">
                      {t.nav.enterpriseAdmin}
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu Actions */}
              <div className="p-1.5 space-y-0.5 text-xs font-medium text-neutral-700 dark:text-neutral-200">
                {/* System Settings (Includes Theme & Language) */}
                <button
                  onClick={() => {
                    setSettingsActiveTab('appearance');
                    setSettingsModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left font-semibold text-neutral-900 dark:text-white"
                >
                  <div className="flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>{t.settings.title}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {/* Audit Rules & Currency */}
                <button
                  onClick={() => {
                    setSettingsActiveTab('rules');
                    setSettingsModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>{t.nav.rulesAndCurrency}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {/* Audit Engine Diagnostics */}
                <button
                  onClick={() => {
                    setSettingsActiveTab('diagnostics');
                    setSettingsModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>{t.nav.engineDiagnostics}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {/* Reset Demo Data */}
                <button
                  onClick={handleResetData}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left text-neutral-700 dark:text-neutral-300"
                >
                  <RefreshCw className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span>{t.nav.refreshDemoCases}</span>
                </button>

                <hr className="my-1 border-neutral-100 dark:border-neutral-800" />

                {/* Sign Out Simulation */}
                <button
                  onClick={() => {
                    showToast(lang === 'vi' ? 'Đã kết thúc phiên làm việc' : 'Logged out of session');
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors cursor-pointer text-left font-semibold"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>{t.nav.signOut}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* Unified System Settings Modal (Theme, Language, Rules, Diagnostics)      */}
      {/* ========================================================================= */}
      {settingsModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-850/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-900 text-amber-300 dark:bg-neutral-100 dark:text-neutral-900 flex items-center justify-center shrink-0 shadow-xs">
                  <Settings className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white">{t.settings.title}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t.settings.subtitle}</p>
                </div>
              </div>
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 px-5 pt-3 pb-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/40 text-xs">
              <button
                onClick={() => setSettingsActiveTab('appearance')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  settingsActiveTab === 'appearance'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>{t.settings.tabAppearance}</span>
              </button>

              <button
                onClick={() => setSettingsActiveTab('rules')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  settingsActiveTab === 'rules'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{t.settings.tabAuditRules}</span>
              </button>

              <button
                onClick={() => setSettingsActiveTab('diagnostics')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  settingsActiveTab === 'diagnostics'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>{t.settings.tabDiagnostics}</span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {/* TAB 1: APPEARANCE & LANGUAGE */}
              {settingsActiveTab === 'appearance' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Theme Mode Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                          {t.settings.themeLabel}
                        </h4>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {t.settings.themeDesc}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-mono text-[10px] font-bold">
                        {theme === 'dark' ? 'DARK MODE' : 'LIGHT MODE'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Light Mode Card */}
                      <button
                        onClick={() => setTheme('light')}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                          theme === 'light'
                            ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800/90 ring-2 ring-neutral-900 dark:ring-white shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-850 hover:border-neutral-300 dark:hover:border-neutral-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-300 flex items-center justify-center shadow-2xs">
                            <Sun className="w-4 h-4" />
                          </div>
                          {theme === 'light' && (
                            <span className="w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center text-[10px] font-bold">
                              ✓
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-neutral-900 dark:text-white">{t.settings.themeLight}</div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                            {t.settings.themeLightDesc}
                          </div>
                        </div>
                      </button>

                      {/* Dark Mode Card */}
                      <button
                        onClick={() => setTheme('dark')}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                          theme === 'dark'
                            ? 'border-neutral-900 dark:border-white bg-neutral-900 text-white ring-2 ring-amber-400 shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-850 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-900 dark:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-8 h-8 rounded-lg bg-neutral-800 text-amber-300 flex items-center justify-center shadow-2xs">
                            <Moon className="w-4 h-4" />
                          </div>
                          {theme === 'dark' && (
                            <span className="w-5 h-5 rounded-full bg-amber-400 text-neutral-950 flex items-center justify-center text-[10px] font-bold">
                              ✓
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-neutral-900 dark:text-white">{t.settings.themeDark}</div>
                          <div className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                            {t.settings.themeDarkDesc}
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <hr className="border-neutral-200 dark:border-neutral-800" />

                  {/* Language Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                          {t.settings.languageLabel}
                        </h4>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {t.settings.languageDesc}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-bold">
                        {lang === 'vi' ? 'TIẾNG VIỆT' : 'ENGLISH'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Vietnamese Option */}
                      <button
                        onClick={() => setLang('vi')}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                          lang === 'vi'
                            ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800/90 ring-2 ring-neutral-900 dark:ring-white shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-850 hover:border-neutral-300 dark:hover:border-neutral-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🇻🇳</span>
                            <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[10px] font-bold text-neutral-700 dark:text-neutral-300">
                              VI
                            </span>
                          </div>
                          {lang === 'vi' && (
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                              ✓
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-neutral-900 dark:text-white">{t.settings.langVietnamese}</div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                            {t.settings.langVietnameseDesc}
                          </div>
                        </div>
                      </button>

                      {/* English Option */}
                      <button
                        onClick={() => setLang('en')}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                          lang === 'en'
                            ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800/90 ring-2 ring-neutral-900 dark:ring-white shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-850 hover:border-neutral-300 dark:hover:border-neutral-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🇺🇸</span>
                            <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[10px] font-bold text-neutral-700 dark:text-neutral-300">
                              EN
                            </span>
                          </div>
                          {lang === 'en' && (
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                              ✓
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-neutral-900 dark:text-white">{t.settings.langEnglish}</div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                            {t.settings.langEnglishDesc}
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AUDIT RULES & CURRENCY */}
              {settingsActiveTab === 'rules' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Audit Sensitivity */}
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-2">
                      {t.settings.sensitivityLabel}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={() => setAuditMode('strict')}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          auditMode === 'strict'
                            ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                        }`}
                      >
                        <div className="font-bold text-xs">{t.settings.strictMode}</div>
                        <div className={`text-[10px] mt-1 ${
                          auditMode === 'strict' 
                            ? (theme === 'dark' ? 'text-neutral-700' : 'text-neutral-300')
                            : 'text-neutral-500 dark:text-neutral-400'
                        }`}>
                          {t.settings.strictModeDesc}
                        </div>
                      </button>

                      <button
                        onClick={() => setAuditMode('standard')}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          auditMode === 'standard'
                            ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                        }`}
                      >
                        <div className="font-bold text-xs">{t.settings.standardMode}</div>
                        <div className={`text-[10px] mt-1 ${
                          auditMode === 'standard' 
                            ? (theme === 'dark' ? 'text-neutral-700' : 'text-neutral-300')
                            : 'text-neutral-500 dark:text-neutral-400'
                        }`}>
                          {t.settings.standardModeDesc}
                        </div>
                      </button>
                    </div>
                  </div>

                  <hr className="border-neutral-200 dark:border-neutral-800" />

                  {/* Primary Currency */}
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-2">
                      {t.settings.currencyLabel}
                    </h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
                      {t.settings.currencyDesc}
                    </p>
                    <select
                      value={defaultCurrency}
                      onChange={e => setDefaultCurrency(e.target.value as any)}
                      className="w-full p-3 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold focus:outline-hidden focus:ring-2 focus:ring-neutral-900 text-xs"
                    >
                      <option value="VND">VND (₫) - Việt Nam Đồng</option>
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="EUR">EUR (€) - Euro Standard</option>
                    </select>
                  </div>
                </div>
              )}

              {/* TAB 3: LIVE ENGINE DIAGNOSTICS (everything here comes from /api/ready) */}
              {settingsActiveTab === 'diagnostics' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Active Engine Card */}
                  <div className="p-4 rounded-xl bg-neutral-900 dark:bg-neutral-800 text-white space-y-2 border border-neutral-800 dark:border-neutral-700">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                        {lang === 'vi' ? 'MÔ HÌNH NGÔN NGỮ' : 'LANGUAGE MODEL'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                          isReady
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {readyStatus ? readyStatus.status.toUpperCase() : 'UNREACHABLE'}
                      </span>
                    </div>
                    <div className="text-sm font-bold flex items-center gap-2 text-white">
                      <Cpu className="w-4 h-4 text-amber-400" />
                      <span>{activeEngineLabel}</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      {lang === 'vi'
                        ? 'Mô hình chạy hoàn toàn cục bộ qua Ollama; phần đối soát số học do bộ quy tắc xác định của máy chủ thực hiện.'
                        : 'The model runs entirely locally through Ollama; cross-document arithmetic is handled by the backend rule engine.'}
                    </p>
                  </div>

                  {readyError && (
                    <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-[11px] font-medium">
                      {readyError}
                    </div>
                  )}

                  {/* Live dependency checks straight from /api/ready */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                        {lang === 'vi' ? 'Kiểm tra phụ thuộc' : 'Dependency Checks'}
                      </h4>
                      <button
                        onClick={refreshReadyStatus}
                        className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{t.common.refresh}</span>
                      </button>
                    </div>

                    {!readyStatus ? (
                      <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850/60 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {t.common.loadFailed}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850/60 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 font-bold text-[11px]">
                              <Database className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                              <span>PostgreSQL / pgvector</span>
                            </div>
                            <span
                              className={`font-mono text-[10px] font-bold ${
                                readyStatus.checks?.database?.status === 'ok'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {readyStatus.checks?.database?.status ?? 'unknown'}
                            </span>
                          </div>
                          {readyStatus.checks?.database?.detail && (
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                              {readyStatus.checks.database.detail}
                            </div>
                          )}
                          {readyStatus.checks?.database?.hint && (
                            <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
                              {readyStatus.checks.database.hint}
                            </div>
                          )}
                        </div>

                        <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850/60 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 font-bold text-[11px]">
                              <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                              <span>Ollama</span>
                            </div>
                            <span
                              className={`font-mono text-[10px] font-bold ${
                                readyStatus.checks?.ollama?.status === 'ok'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {readyStatus.checks?.ollama?.status ?? 'unknown'}
                            </span>
                          </div>
                          {readyStatus.checks?.ollama?.detail && (
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                              {readyStatus.checks.ollama.detail}
                            </div>
                          )}
                          {llmModel && (
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-neutral-500 dark:text-neutral-400">
                                {lang === 'vi' ? 'Mô hình sinh' : 'Generation model'}
                              </span>
                              <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                                {llmModel}
                                {readyStatus.checks?.ollama?.llm_model?.available === false && ' · missing'}
                              </span>
                            </div>
                          )}
                          {embeddingModel && (
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-neutral-500 dark:text-neutral-400">
                                {lang === 'vi' ? 'Mô hình nhúng' : 'Embedding model'}
                              </span>
                              <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                                {embeddingModel}
                                {readyStatus.checks?.ollama?.embedding_model?.available === false && ' · missing'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {lang === 'vi'
                      ? 'Các chỉ số chất lượng (recall, độ chính xác, độ trễ) chỉ hiển thị trong tab Đánh giá và chỉ khi bộ đo kiểm đã thực sự được chạy.'
                      : 'Quality metrics (recall, accuracy, latency) live in the Evaluation tab and only appear once the benchmark has actually been run.'}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 flex items-center justify-between">
              <span className="text-[11px] text-neutral-400">
                {lang === 'vi' ? 'Mọi thay đổi có hiệu lực ngay lập tức' : 'Changes apply immediately across workspace'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSettingsModalOpen(false);
                    showToast(t.settings.appliedSuccess);
                  }}
                  className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs hover:bg-neutral-800 dark:hover:bg-white transition-colors cursor-pointer shadow-xs"
                >
                  {t.settings.saveBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

