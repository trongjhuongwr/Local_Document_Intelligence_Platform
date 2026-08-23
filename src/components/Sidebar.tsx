import React, { useEffect, useState } from 'react';
import { 
  FolderOpen, 
  MessageSquare, 
  CheckSquare, 
  BarChart3, 
  Home, 
  ChevronDown, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  openFindingCount?: number;
}

export function Sidebar({ currentTab, onSelectTab, openFindingCount = 0 }: SidebarProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [readyStatus, setReadyStatus] = useState<{ status: string; checks?: any } | null>(null);

  useEffect(() => {
    fetch('/api/ready')
      .then(res => res.json())
      .then(data => setReadyStatus(data))
      .catch(() => setReadyStatus({ status: 'offline' }));
  }, []);

  const isReady = readyStatus?.status === 'ready';

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

  return (
    <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col justify-between h-screen shrink-0 sticky top-0">
      <div className="p-4 flex flex-col gap-6">
        {/* Branding Header */}
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-neutral-900 tracking-tight leading-tight">Document Intelligence</h1>
              <p className="text-xs text-neutral-500 font-medium">Local-first audit workspace</p>
            </div>
          </div>

          {/* System status pill */}
          <div className="mt-3.5 pt-3 border-t border-neutral-100 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isReady ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-red-500 ring-2 ring-red-100'}`} />
            <span className="text-xs text-neutral-600 font-medium">
              {isReady ? 'System ready' : 'System offline'}
            </span>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 px-2 mb-1.5">
              Workspace
            </div>
            <nav className="flex flex-col gap-0.5">
              {workspaceNav.map(item => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-btn-${item.id}`}
                    onClick={() => onSelectTab(item.id)}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-neutral-100 text-neutral-900 font-semibold'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${active ? 'text-neutral-900' : 'text-neutral-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 px-2 mb-1.5">
              Developer
            </div>
            <nav className="flex flex-col gap-0.5">
              {devNav.map(item => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-btn-${item.id}`}
                    onClick={() => onSelectTab(item.id)}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-neutral-100 text-neutral-900 font-semibold'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-neutral-900' : 'text-neutral-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Footer System Details Expander */}
      <div className="p-3 border-t border-neutral-200 bg-neutral-50/50">
        <button
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="w-full flex items-center justify-between text-xs text-neutral-500 hover:text-neutral-800 py-1 px-1 rounded transition-colors"
        >
          <span className="font-medium">System details</span>
          {detailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {detailsOpen && (
          <div className="mt-2 text-[11px] text-neutral-600 flex flex-col gap-1 p-2 bg-white rounded border border-neutral-200">
            <div>API: <span className="font-mono text-neutral-800">/api</span></div>
            <div>Database: <span className="font-mono text-neutral-800">{readyStatus?.checks?.database?.status || 'ready'}</span></div>
            <div>Engine: <span className="font-mono text-neutral-800">{readyStatus?.checks?.ollama?.llm_model?.model || 'deterministic-v1.4'}</span></div>
          </div>
        )}
      </div>
    </aside>
  );
}
