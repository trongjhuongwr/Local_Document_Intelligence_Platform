import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { HomeView } from './components/HomeView';
import { CasesView } from './components/CasesView';
import { AskView } from './components/AskView';
import { ReviewsView } from './components/ReviewsView';
import { EvaluationView } from './components/EvaluationView';
import { CaseItem } from './types';

export function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loadingSample, setLoadingSample] = useState(false);

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
    <div className="flex min-h-screen bg-neutral-50/60 font-sans text-neutral-900">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={tab => {
          setCurrentTab(tab);
        }}
        openFindingCount={totalOpenFindings}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden h-screen">
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
