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
  const { theme, toggleTheme, lang, setLang, toggleLang, t } = useThemeLanguage();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [auditMode, setAuditMode] = useState<'strict' | 'standard'>('strict');
  const [defaultCurrency, setDefaultCurrency] = useState<'USD' | 'EUR' | 'VND'>(lang === 'vi' ? 'VND' : 'USD');
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
      await fetch('/api/demo/cases', { method: 'POST' });
      showToast(lang === 'vi' ? 'Đã làm mới dữ liệu hồ sơ mẫu' : 'Sample cases refreshed successfully');
      setAccountMenuOpen(false);
      window.location.reload();
    } catch (e) {
      showToast(lang === 'vi' ? 'Lỗi khi làm mới dữ liệu' : 'Error resetting workspace');
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
                      {isReady ? t.common.statusReady : t.common.statusOffline} · {t.common.version}
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
            {/* Quick Controls Bar: Lang & Theme (visible in expanded sidebar) */}
            {!collapsed && (
              <div className="flex items-center justify-between gap-1.5 px-1 py-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-xs">
                {/* Language Switcher Pill */}
                <div className="flex items-center gap-1 bg-white dark:bg-neutral-900 p-0.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700">
                  <button
                    onClick={() => setLang('en')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                      lang === 'en'
                        ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                        : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => setLang('vi')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                      lang === 'vi'
                        ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                        : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400'
                    }`}
                  >
                    VI
                  </button>
                </div>

                {/* Theme Toggle Button */}
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-neutral-900 transition-colors cursor-pointer"
                  title={t.common.switchTheme}
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.common.lightTheme}</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5 text-neutral-600" />
                      <span>{t.common.darkTheme}</span>
                    </>
                  )}
                </button>
              </div>
            )}

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
                {/* Language Switch */}
                <button
                  onClick={handleToggleLang}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{lang === 'vi' ? 'Ngôn ngữ (Language)' : 'Language (Ngôn ngữ)'}</span>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase">
                    {lang === 'vi' ? 'Tiếng Việt' : 'English'}
                  </span>
                </button>

                {/* Dark Mode Toggle */}
                <button
                  onClick={handleToggleTheme}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400 shrink-0" /> : <Moon className="w-4 h-4 text-neutral-500 shrink-0" />}
                    <span>{theme === 'dark' ? t.common.lightTheme : t.common.darkTheme}</span>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">{theme === 'dark' ? 'DARK' : 'LIGHT'}</span>
                </button>

                {/* Audit Engine Diagnostics */}
                <button
                  onClick={() => {
                    setDiagnosticsModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{t.nav.engineDiagnostics}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {/* Audit Preferences */}
                <button
                  onClick={() => {
                    setPreferencesModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{t.nav.rulesAndCurrency}</span>
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
      {/* 1. Modal: Audit Engine & AI Diagnostics                                  */}
      {/* ========================================================================= */}
      {diagnosticsModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{t.nav.engineDiagnostics}</h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{t.nav.engineDiagnosticsDesc}</p>
                </div>
              </div>
              <button
                onClick={() => setDiagnosticsModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Active Engine Card */}
              <div className="p-4 rounded-xl bg-neutral-900 dark:bg-neutral-800 text-white space-y-2 border border-neutral-800 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                    {lang === 'vi' ? 'ĐỘNG CƠ KẾT NỐI' : 'CONNECTED ENGINE'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold">
                    ACTIVE · 100% HEALTHY
                  </span>
                </div>
                <div className="text-sm font-bold flex items-center gap-2 text-white">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{activeEngineLabel}</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  {lang === 'vi' 
                    ? 'Kiến trúc lai kết hợp sinh ngôn ngữ Gemini 3.7 Flash với lớp tính toán số học xác định 100% không ảo giác.'
                    : 'Hybrid architecture pairing Gemini 3.7 Flash generation with deterministic cross-document mathematical verification.'}
                </p>
              </div>

              {/* Engine Spec Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 font-bold text-[11px]">
                    <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{lang === 'vi' ? 'Quy tắc Xác định' : 'Rule Engine'}</span>
                  </div>
                  <div className="text-sm font-bold text-neutral-900 dark:text-white">
                    {lang === 'vi' ? '12 Quy tắc Nghiệp vụ' : '12 Deterministic Rules'}
                  </div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {lang === 'vi' ? 'Loại bỏ hoàn toàn ảo giác tính toán' : 'Zero arithmetic hallucinations'}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 font-bold text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{lang === 'vi' ? 'Chế độ Trích dẫn' : 'Grounding Mode'}</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Strict Citations [1..n]</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {lang === 'vi' ? 'Gắn kết trực tiếp văn bản nguồn' : 'Side inspector binding'}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 font-bold text-[11px]">
                    <Database className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>{lang === 'vi' ? 'Truy xuất Vector' : 'Vector Retrieval'}</span>
                  </div>
                  <div className="text-sm font-bold text-neutral-900 dark:text-white">Hybrid (BM25 + Dense)</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Latency ~33ms · Recall 93.3%</div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 font-bold text-[11px]">
                    <Info className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                    <span>{lang === 'vi' ? 'Tính Toàn vẹn' : 'Doc Integrity'}</span>
                  </div>
                  <div className="text-sm font-bold text-neutral-900 dark:text-white">SHA-256 Checksums</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {lang === 'vi' ? 'Sổ cái nhật ký bất biến' : 'Immutable audit trails'}
                  </div>
                </div>
              </div>

              {/* 12 Rule Specifications Summary */}
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850/60">
                <h4 className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-2">
                  {lang === 'vi' ? 'Các Quy Tắc Đối Soát Tự Động Kích Hoạt' : 'Active Deterministic Audit Checks'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                  <div>✓ {lang === 'vi' ? 'Hạn mức giá trị hợp đồng tối đa' : 'Contract total value cap'}</div>
                  <div>✓ {lang === 'vi' ? 'Tính toán từng dòng & thuế VAT hóa đơn' : 'Invoice line item math & VAT'}</div>
                  <div>✓ {lang === 'vi' ? 'Điều khoản thanh toán (Net 30/60)' : 'Payment terms (Net 30/60)'}</div>
                  <div>✓ {lang === 'vi' ? 'Thời hạn mốc nghiệm thu giai đoạn' : 'Performance milestone dates'}</div>
                  <div>✓ {lang === 'vi' ? 'Bất đồng loại tiền tệ (EUR/USD/VND)' : 'Currency mismatch (EUR/USD/VND)'}</div>
                  <div>✓ {lang === 'vi' ? 'Khớp mã đơn đặt hàng PO bắt buộc' : 'Mandatory PO number match'}</div>
                  <div>✓ {lang === 'vi' ? 'Phát hiện trùng lặp hóa đơn' : 'Duplicate invoice detection'}</div>
                  <div>✓ {lang === 'vi' ? 'Phạt chậm trả & thời gian ân hạn' : 'Grace period & penalty fees'}</div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 flex justify-end">
              <button
                onClick={() => setDiagnosticsModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs hover:bg-neutral-800 dark:hover:bg-white transition-colors cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Modal: Audit Preferences & Currency Settings                          */}
      {/* ========================================================================= */}
      {preferencesModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{t.nav.rulesAndCurrency}</h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{t.nav.rulesAndCurrencyDesc}</p>
                </div>
              </div>
              <button
                onClick={() => setPreferencesModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 text-xs">
              {/* Audit Sensitivity */}
              <div>
                <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
                  {lang === 'vi' ? 'Độ Nhạy Đối Soát Kiểm Toán' : 'Audit Verification Sensitivity'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAuditMode('strict')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      auditMode === 'strict'
                        ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                        : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-bold text-xs">
                      {lang === 'vi' ? 'Nghiêm ngặt (Khớp 100%)' : 'Strict (100% Match)'}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${
                      auditMode === 'strict' 
                        ? (theme === 'dark' ? 'text-neutral-700' : 'text-neutral-300')
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}>
                      {lang === 'vi' ? 'Báo động mọi chênh lệch dù chỉ 1 đồng' : 'Flags even ±$1 discrepancies & net terms'}
                    </div>
                  </button>

                  <button
                    onClick={() => setAuditMode('standard')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      auditMode === 'standard'
                        ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                        : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-bold text-xs">
                      {lang === 'vi' ? 'Dung sai Chuẩn (<0.1%)' : 'Standard Tolerance'}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${
                      auditMode === 'standard'
                        ? (theme === 'dark' ? 'text-neutral-700' : 'text-neutral-300')
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}>
                      {lang === 'vi' ? 'Chấp nhận sai số làm tròn số học nhỏ' : 'Permits minor rounding diffs < 0.1%'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Default Currency */}
              <div>
                <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
                  {lang === 'vi' ? 'Đơn Vị Tiền Tệ Báo Cáo Chính' : 'Primary Audit Reporting Currency'}
                </label>
                <select
                  value={defaultCurrency}
                  onChange={e => setDefaultCurrency(e.target.value as any)}
                  className="w-full p-2.5 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold focus:outline-hidden focus:ring-2 focus:ring-neutral-900 text-xs"
                >
                  <option value="VND">VND (₫) - Việt Nam Đồng</option>
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="EUR">EUR (€) - Euro Standard</option>
                </select>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 flex justify-end gap-2">
              <button
                onClick={() => {
                  setPreferencesModalOpen(false);
                  showToast(lang === 'vi' ? 'Đã lưu tùy chọn kiểm toán' : 'Preferences saved');
                }}
                className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs hover:bg-neutral-800 dark:hover:bg-white transition-colors cursor-pointer shadow-xs"
              >
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

