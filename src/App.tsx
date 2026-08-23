import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { HomeView } from './components/HomeView';
import { CasesView } from './components/CasesView';
import { AskView } from './components/AskView';
import { ReviewsView } from './components/ReviewsView';
import { EvaluationView } from './components/EvaluationView';
import { AuditTrailView } from './components/AuditTrailView';
import { CommandPalette } from './components/CommandPalette';
import { CaseItem } from './types';
import { Menu, ShieldCheck, Search } from 'lucide-react';
import { useThemeLanguage } from './context/ThemeLanguageContext';

export function App() {
  const { t } = useThemeLanguage();
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loadingSample, setLoadingSample] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Global Keyboard shortcuts:
  // - Ctrl+K / Cmd+K: Toggle Command Palette
  // - Ctrl+B / Cmd+B: Toggle Sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchCases = () => {
    fetch('/api/cases')
      .then(res => res.json())
      .then(data => setCases(data.cases || []))
      .catch(console.error);
  };

  useEffect(() => {
    fetchCases();
  }, []);

  // Compute total open findings across all cases
  const totalOpenFindings = cases.reduce((acc, c) => acc + (c.open_review_count || 0), 0);

  const handleOpenCase = (caseId: string) => {
    setActiveCaseId(caseId);
    setCurrentTab('cases');
  };

  const handleCreateCaseFromHome = () => {
    setActiveCaseId(null);
    setCurrentTab('cases');
  };

  const handleTrySampleCase = async () => {
    setLoadingSample(true);
    try {
      const res = await fetch('/api/demo/cases', { method: 'POST' });
      const newCase = await res.json();
      fetchCases();
      setActiveCaseId(newCase.case_id);
      setCurrentTab('cases');
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleNavigateToReviews = (caseId?: string) => {
    if (caseId) setActiveCaseId(caseId);
    setCurrentTab('reviews');
  };

  const handleNavigateToAuditTrail = (caseId?: string) => {
    if (caseId) setActiveCaseId(caseId);
    setCurrentTab('audit_trail');
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-neutral-50/60 dark:bg-neutral-950 font-sans text-neutral-900 dark:text-neutral-100 transition-colors duration-150">
      {/* Global Command Palette (Ctrl + K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        cases={cases}
        onSelectCase={setActiveCaseId}
        onNavigateTab={setCurrentTab}
        onOpenAuditTrail={handleNavigateToAuditTrail}
      />

      {/* Mobile Top App Bar with Hamburger Toggle */}
      <header className="lg:hidden bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 -ml-1.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-neutral-900 dark:bg-neutral-800 text-white flex items-center justify-center font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xs font-bold text-neutral-900 dark:text-white">Doc Intelligence</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors border border-neutral-200 dark:border-neutral-700"
            title="Search (Ctrl + K)"
          >
            <Search className="w-4 h-4" />
          </button>

          {totalOpenFindings > 0 && (
            <button
              onClick={() => setCurrentTab('reviews')}
              className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 border border-amber-300 dark:border-amber-700"
            >
              <span>{totalOpenFindings}</span>
            </button>
          )}
        </div>
      </header>

      {/* Sidebar with Drawer on Mobile & Collapsible Rail on Desktop */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={tab => {
          setCurrentTab(tab);
          setMobileMenuOpen(false);
        }}
        openFindingCount={totalOpenFindings}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden h-[calc(100vh-53px)] lg:h-screen bg-neutral-50/60 dark:bg-neutral-950">
        {currentTab === 'home' && (
          <div className="h-full overflow-y-auto pb-12">
            <HomeView
              cases={cases}
              onCreateCase={handleCreateCaseFromHome}
              onTrySampleCase={handleTrySampleCase}
              onOpenCase={handleOpenCase}
              onNavigateToReviews={handleNavigateToReviews}
              onNavigateToAuditTrail={handleNavigateToAuditTrail}
              loadingSample={loadingSample}
            />
          </div>
        )}

        {currentTab === 'cases' && (
          <div className="h-full overflow-y-auto pb-12">
            <CasesView
              cases={cases}
              activeCaseId={activeCaseId}
              onSelectCase={setActiveCaseId}
              onRefreshCases={fetchCases}
              onNavigateToReviews={handleNavigateToReviews}
            />
          </div>
        )}

        {currentTab === 'reviews' && (
          <div className="h-full overflow-y-auto pb-12">
            <ReviewsView
              cases={cases}
              selectedCaseId={activeCaseId}
              onSelectCase={setActiveCaseId}
              onRefreshCases={fetchCases}
            />
          </div>
        )}

        {currentTab === 'audit_trail' && (
          <div className="h-full overflow-hidden">
            <AuditTrailView
              cases={cases}
              selectedCaseId={activeCaseId}
              onSelectCase={setActiveCaseId}
              onNavigateToCase={handleOpenCase}
            />
          </div>
        )}

        {currentTab === 'ask' && (
          <AskView
            cases={cases}
            selectedCaseId={activeCaseId}
            onSelectCase={setActiveCaseId}
          />
        )}

        {currentTab === 'evaluation' && (
          <div className="h-full overflow-y-auto pb-12">
            <EvaluationView />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;


