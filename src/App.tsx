import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { HomeView } from './components/HomeView';
import { CasesView } from './components/CasesView';
import { AskView } from './components/AskView';
import { ReviewsView } from './components/ReviewsView';
import { EvaluationView } from './components/EvaluationView';
import { CaseItem } from './types';
import { Menu, ShieldCheck } from 'lucide-react';

export function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loadingSample, setLoadingSample] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
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

  const handleNavigateToReviews = (caseId: string) => {
    setActiveCaseId(caseId);
    setCurrentTab('reviews');
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-neutral-50/60 font-sans text-neutral-900">
      {/* Mobile Top App Bar with Hamburger Toggle */}
      <header className="lg:hidden bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 -ml-1.5 text-neutral-700 hover:bg-neutral-100 rounded-lg cursor-pointer transition-colors"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xs font-bold text-neutral-900">Document Intelligence</span>
          </div>
        </div>

        {totalOpenFindings > 0 && (
          <button
            onClick={() => setCurrentTab('reviews')}
            className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold flex items-center gap-1"
          >
            <span>{totalOpenFindings} open findings</span>
          </button>
        )}
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
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden h-[calc(100vh-53px)] lg:h-screen">
        {currentTab === 'home' && (
          <div className="h-full overflow-y-auto pb-12">
            <HomeView
              cases={cases}
              onCreateCase={handleCreateCaseFromHome}
              onTrySampleCase={handleTrySampleCase}
              onOpenCase={handleOpenCase}
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

        {currentTab === 'ask' && (
          <AskView
            cases={cases}
            selectedCaseId={activeCaseId}
            onSelectCase={setActiveCaseId}
          />
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

