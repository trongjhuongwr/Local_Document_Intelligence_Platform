import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import {
  CaseDocument,
  CaseItem,
  ChatMessage,
  QueryCitation,
  QueryResponse,
} from '../types';
import {
  Send,
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Copy,
  Check,
  RotateCcw,
  Download,
  Info,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Layers,
  Search,
  ExternalLink,
  X,
  BookmarkPlus,
  BookOpen,
  Sliders,
  Filter,
  CheckCircle2,
  HelpCircle,
  Clock,
  ArrowUp,
  FileSearch,
  Paperclip,
  CheckCheck,
  Scale,
  DollarSign,
  FileSpreadsheet,
  CornerDownLeft,
  Columns,
} from 'lucide-react';
import { DocumentSplitViewer } from './DocumentSplitViewer';

interface AskViewProps {
  cases: CaseItem[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
}

const CATEGORIZED_PROMPTS = [
  {
    category: 'Discrepancies & Price Caps',
    icon: Scale,
    prompts: [
      'Do the invoice payment terms match the Master Services Agreement contract?',
      'Does the invoice total exceed the contract maximum cap or PO budget?',
      'Are there any currency mismatches or VAT rate calculation errors?',
    ],
  },
  {
    category: 'Audit & Compliance Rules',
    icon: ShieldCheck,
    prompts: [
      'Is a purchase order required by policy, and is it validly cited and approved?',
      'Verify if the subtotal, tax rate, and total calculations are mathematically correct.',
      'Check if the invoice issuance date falls within the valid contractual period.',
    ],
  },
  {
    category: 'Obligations & Terms',
    icon: FileSpreadsheet,
    prompts: [
      'What are the core obligations, deliverables, and service levels in the contract?',
      'What are the late payment interest rates or breach penalties specified?',
      'Provide an executive summary of this case with all cited key facts.',
    ],
  },
];

export function AskView({ cases, selectedCaseId, onSelectCase }: AskViewProps) {
  const [searchAllCases, setSearchAllCases] = useState(false);
  const [retrievalMode, setRetrievalMode] = useState<'bm25' | 'hybrid' | 'dense'>('bm25');
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Side Inspector Panel State
  const [selectedCitation, setSelectedCitation] = useState<{
    marker: string;
    cite: QueryCitation;
    sourceMessageId?: string;
  } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedDocPreview, setSelectedDocPreview] = useState<CaseDocument | null>(null);
  const [splitViewerOpen, setSplitViewerOpen] = useState(false);
  const [splitViewerDocs, setSplitViewerDocs] = useState<CaseDocument[]>([]);

  // Interaction feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [savedFeedbackId, setSavedFeedbackId] = useState<string | null>(null);
  const [expandedTechId, setExpandedTechId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const followUpScrollRef = useRef<HTMLDivElement | null>(null);

  const activeCase = cases.find(c => c.case_id === selectedCaseId);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Keyboard Shortcuts: Esc to close Side Inspector, '/' to focus chat input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If user pressed Escape, close inspector if open
      if (e.key === 'Escape') {
        if (inspectorOpen) {
          setInspectorOpen(false);
        }
      }

      // If user pressed '/' and is not already typing in an input/textarea
      if (e.key === '/' && document.activeElement !== textareaRef.current) {
        const isInputField = ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement?.tagName || '').toUpperCase());
        if (!isInputField) {
          e.preventDefault();
          textareaRef.current?.focus();
          showToast('Focused chat input (Shortcut: /)');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [inspectorOpen]);

  const scrollFollowUps = (direction: 'left' | 'right') => {
    if (followUpScrollRef.current) {
      const scrollAmount = 260;
      followUpScrollRef.current.scrollBy({
        left: direction === 'right' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Auto-resize textarea like ChatGPT / Claude
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputQuestion]);

  // Auto-scroll to bottom of chat when messages change or loading
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input on load
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputQuestion).trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputQuestion('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);

    try {
      // Build history payload for Gemini context
      const historyPayload = newMessages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          mode: retrievalMode,
          filters: searchAllCases ? {} : { case_id: selectedCaseId || undefined },
          history: historyPayload,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to query document intelligence engine');
      }

      const data: QueryResponse = await res.json();

      const assistantMessage: ChatMessage = {
        id: 'msg_' + (Date.now() + 1),
        role: 'assistant',
        content: data.answer || 'No answer could be formulated from the available documents.',
        created_at: new Date().toISOString(),
        responseMeta: {
          citations: data.citations || {},
          verification: data.verification,
          retrieval_mode: data.retrieval_mode,
          route: data.route,
          routing_method: data.routing_method,
          retrieved_count: data.retrieved_count,
          context_chars: data.context_chars,
          latency_ms: data.latency_ms,
        },
      };

      setMessages([...newMessages, assistantMessage]);

      // If citations exist and no citation is currently open, auto-open the first citation in inspector
      if (data.citations && Object.keys(data.citations).length > 0 && !inspectorOpen) {
        const firstKey = Object.keys(data.citations)[0];
        setSelectedCitation({
          marker: firstKey,
          cite: data.citations[firstKey],
          sourceMessageId: assistantMessage.id,
        });
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage: ChatMessage = {
        id: 'msg_' + (Date.now() + 1),
        role: 'assistant',
        content: `**Error**: Unable to complete document analysis (${err.message || 'Network error'}). Please try again.`,
        created_at: new Date().toISOString(),
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopy = (text: string, id: string, label: string = 'Đã sao chép vào clipboard') => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast(label);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportTranscript = () => {
    if (messages.length === 0) return;
    const transcript = messages
      .map(
        m =>
          `### [${m.role === 'user' ? 'USER' : 'DOCUMENT AI COPILOT'}] - ${new Date(m.created_at).toLocaleString()}\n\n${m.content}\n`
      )
      .join('\n---\n\n');

    const blob = new Blob([transcript], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_chat_${selectedCaseId || 'all_cases'}_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất toàn bộ lịch sử hội thoại ra tệp Markdown');
  };

  const handleSaveToAuditNotes = (msg: ChatMessage) => {
    setSavedFeedbackId(msg.id);
    showToast('Đã lưu phát hiện vào ghi chú kiểm toán viên');
    setTimeout(() => setSavedFeedbackId(null), 2500);
  };

  const openCitationInInspector = (marker: string, cite: QueryCitation, msgId: string) => {
    setSelectedCitation({ marker, cite, sourceMessageId: msgId });
    setSelectedDocPreview(null);
    setInspectorOpen(true);
  };

  const openDocInInspector = (doc: CaseDocument) => {
    setSelectedDocPreview(doc);
    setSelectedCitation(null);
    setInspectorOpen(true);
  };

  return (
    <div className="flex flex-col h-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-2 overflow-hidden relative">
      {/* Floating Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-neutral-900/95 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl border border-neutral-700 backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Context Control Strip */}
      <div className="bg-white border border-neutral-200/90 rounded-2xl p-2.5 mb-2 shadow-xs transition-all">
        {/* Row 1: Brand & Top Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-950 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-bold text-neutral-900 tracking-tight">
                  Document Intelligence Copilot
                </h1>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Gemini 3.7 Flash Grounded
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 hidden sm:block">
                Audit cross-verification, mathematical consistency, and contractual term compliance
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                inspectorOpen
                  ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-2xs'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
              }`}
              title="Toggle Evidence & Document Inspector Side-Panel"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Evidence Inspector</span>
              {selectedCitation && (
                <span className="w-2 h-2 rounded-full bg-amber-500 ml-0.5 animate-pulse" />
              )}
            </button>

            {messages.length > 0 && (
              <>
                <button
                  onClick={handleExportTranscript}
                  title="Export chat transcript as Markdown"
                  className="px-2 py-1 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={() => {
                    setMessages([]);
                    setSelectedCitation(null);
                  }}
                  title="Clear conversation history"
                  className="px-2 py-1 rounded-xl border border-neutral-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-neutral-600 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Controls Toolbar (Scope Selector & Retrieval Mode Pills) */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
          {/* Target Case Scope Dropdown */}
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3 text-neutral-400" />
              Scope:
            </span>
            <div className="relative flex-1">
              <select
                value={searchAllCases ? 'all' : (selectedCaseId || '')}
                onChange={e => {
                  if (e.target.value === 'all') {
                    setSearchAllCases(true);
                  } else {
                    setSearchAllCases(false);
                    onSelectCase(e.target.value || null);
                  }
                }}
                className="w-full pl-2.5 pr-8 py-1 text-xs font-medium border border-neutral-300 rounded-xl bg-neutral-50/80 text-neutral-800 focus:bg-white focus:border-neutral-900 focus:outline-hidden transition-all"
              >
                <option value="all">🌐 All Cases (Cross-Corpus Search)</option>
                {cases.map(c => (
                  <option key={c.case_id} value={c.case_id}>
                    📁 {c.name} ({c.document_count} files)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Retrieval Mode Segmented Pills */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Sliders className="w-3 h-3 text-neutral-400" />
              Engine:
            </span>
            <div className="inline-flex rounded-xl bg-neutral-100 p-0.5 border border-neutral-200">
              {(
                [
                  { id: 'bm25', label: 'BM25', tooltip: 'High precision exact keyword match' },
                  { id: 'hybrid', label: 'Hybrid', tooltip: 'BM25 + Semantic dense vector fusion' },
                  { id: 'dense', label: 'Dense', tooltip: 'Deep semantic vector embedding' },
                ] as const
              ).map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setRetrievalMode(mode.id)}
                  title={mode.tooltip}
                  className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                    retrievalMode === mode.id
                      ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Documents Chip Bar (Click to preview document) */}
        {activeCase && !searchAllCases && activeCase.documents && activeCase.documents.length > 0 && (
          <div className="mt-2 pt-1.5 border-t border-neutral-100 flex items-center gap-2 text-xs text-neutral-500 overflow-x-auto no-scrollbar">
            <span className="font-semibold text-neutral-700 shrink-0 text-[10px] uppercase tracking-wider">
              Active Case Files:
            </span>
            {activeCase.documents.map(d => (
              <button
                key={d.document_id}
                onClick={() => openDocInInspector(d)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-100/90 hover:bg-neutral-200/90 text-neutral-700 font-mono text-[10px] shrink-0 border border-neutral-200/60 transition-colors cursor-pointer"
                title="Click to view full extracted document text"
              >
                <FileText className="w-2.5 h-2.5 text-neutral-500" />
                <span>{d.filename}</span>
                <span className="text-[9px] text-neutral-400">({d.document_type})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Workspace: Modern AI Chat (Claude / ChatGPT / Gemini Inspired) */}
      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Left / Center Column: Conversation Thread */}
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-neutral-200/90 overflow-hidden shadow-xs relative">
          
          {/* Scrollable Messages Container */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-2.5 space-y-4">
            {messages.length === 0 ? (
              /* Hero Empty State & Prompt Library (Compact & Perfectly Fitted Grid) */
              <div className="h-full flex flex-col justify-center items-center text-center max-w-4xl mx-auto py-1 space-y-2.5">
                <div className="space-y-1">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-neutral-950 via-neutral-900 to-neutral-800 text-white flex items-center justify-center mx-auto shadow-xs ring-2 ring-neutral-100">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight">
                    What would you like to audit or verify?
                  </h2>
                  <p className="text-[11px] sm:text-xs text-neutral-500 max-w-md mx-auto leading-tight">
                    Ask questions across Contracts, Invoices, Purchase Orders, and AP Policies. Every response is grounded with interactive evidence citations.
                  </p>
                </div>

                {/* Categorized Prompt Suggestions (3x3 Grid, Compact Design) */}
                <div className="w-full space-y-2 text-left">
                  {CATEGORIZED_PROMPTS.map((cat, catIdx) => {
                    const IconComp = cat.icon;
                    return (
                      <div key={catIdx} className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                          <IconComp className="w-3 h-3 text-neutral-500" />
                          <span>{cat.category}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {cat.prompts.map((prompt, pIdx) => (
                            <button
                              key={pIdx}
                              onClick={() => handleSendMessage(prompt)}
                              className="p-2.5 rounded-xl border border-neutral-200/80 bg-neutral-50/60 hover:bg-white hover:border-neutral-400 hover:shadow-2xs text-left transition-all cursor-pointer group flex flex-col justify-between min-h-[58px]"
                            >
                              <p className="text-[11px] font-medium text-neutral-800 group-hover:text-neutral-950 leading-snug line-clamp-2">
                                {prompt}
                              </p>
                              <div className="mt-1 flex items-center text-[10px] text-neutral-400 group-hover:text-neutral-800 font-semibold gap-0.5">
                                <span>Ask this</span>
                                <ArrowUp className="w-2.5 h-2.5 rotate-45 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Active Chat Stream */
              <div className="max-w-4xl mx-auto space-y-7">
                {messages.map(msg => (
                  <div key={msg.id} className="group">
                    {msg.role === 'user' ? (
                      /* USER MESSAGE: Modern sleek bubble aligned to right */
                      <div className="flex justify-end pl-12">
                        <div className="bg-neutral-900 text-neutral-100 rounded-3xl rounded-tr-sm px-5 py-3.5 shadow-xs max-w-2xl">
                          <div className="text-sm leading-relaxed whitespace-pre-wrap font-normal selection:bg-neutral-700">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ASSISTANT MESSAGE: Open canvas modern layout like Claude / ChatGPT / Gemini */
                      <div className="flex gap-4 pr-4">
                        {/* Assistant Avatar */}
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-neutral-950 to-neutral-800 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ring-2 ring-neutral-100">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Verification & Metadata Header */}
                          {msg.responseMeta?.verification && (
                            <div className="flex items-center gap-2">
                              {msg.responseMeta.verification.valid ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Grounded in Audited Documents</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Unverified Claim Warning</span>
                                </div>
                              )}

                              {msg.responseMeta.latency_ms && (
                                <span className="text-[11px] text-neutral-400 font-mono">
                                  {msg.responseMeta.latency_ms}ms
                                </span>
                              )}
                            </div>
                          )}

                          {/* Markdown Rendered Answer */}
                          <div className="markdown-body text-sm text-neutral-900 leading-relaxed">
                            <Markdown>{msg.content}</Markdown>
                          </div>

                          {/* Inline Evidence Citations Cards */}
                          {msg.responseMeta?.citations &&
                            Object.keys(msg.responseMeta.citations).length > 0 && (
                              <div className="pt-2 space-y-2">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                                  <FileSearch className="w-3.5 h-3.5 text-neutral-500" />
                                  <span>Grounded Source Citations ({Object.keys(msg.responseMeta.citations).length})</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {Object.entries(msg.responseMeta.citations).map(([marker, cite]) => {
                                    const isSelected =
                                      selectedCitation?.marker === marker &&
                                      selectedCitation?.sourceMessageId === msg.id;

                                    return (
                                      <div
                                        key={marker}
                                        onClick={() => openCitationInInspector(marker, cite, msg.id)}
                                        className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer space-y-1 ${
                                          isSelected
                                            ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-300/40 shadow-xs'
                                            : 'bg-neutral-50/70 border-neutral-200 hover:border-amber-300 hover:bg-amber-50/40'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between font-bold text-neutral-800">
                                          <span className="inline-flex items-center gap-1 font-mono text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded text-[11px]">
                                            {marker} {cite.filename}
                                          </span>
                                          <span className="text-[10px] text-neutral-400 font-normal">
                                            p. {cite.page_number || 1}
                                          </span>
                                        </div>
                                        {cite.section && (
                                          <div className="text-[10px] font-mono text-neutral-500 uppercase">
                                            {cite.section}
                                          </div>
                                        )}
                                        <p className="text-neutral-600 text-[11px] italic line-clamp-2 leading-relaxed">
                                          "{cite.evidence}"
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                          {/* Assistant Action Bar (Copy, Save Note, Telemetry) */}
                          <div className="flex items-center justify-between pt-1 text-xs text-neutral-400">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleCopy(msg.content, msg.id, 'Đã sao chép câu trả lời vào clipboard')}
                                className="hover:text-neutral-800 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer text-[11px] font-medium"
                                title="Copy response text"
                              >
                                {copiedId === msg.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                              </button>

                              <button
                                onClick={() => handleSaveToAuditNotes(msg)}
                                className="hover:text-neutral-800 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer text-[11px] font-medium"
                                title="Save to Review Findings note"
                              >
                                {savedFeedbackId === msg.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <BookmarkPlus className="w-3.5 h-3.5" />
                                )}
                                <span>{savedFeedbackId === msg.id ? 'Saved to findings' : 'Save to notes'}</span>
                              </button>

                              {msg.responseMeta && (
                                <button
                                  onClick={() =>
                                    setExpandedTechId(expandedTechId === msg.id ? null : msg.id)
                                  }
                                  className="hover:text-neutral-800 flex items-center gap-1 text-[11px] font-medium cursor-pointer py-1 px-2 rounded-lg hover:bg-neutral-100 transition-colors"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                  <span>Details</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Technical Telemetry Expander */}
                          {expandedTechId === msg.id && msg.responseMeta && (
                            <div className="p-3 rounded-xl bg-neutral-900 text-neutral-200 font-mono text-[11px] space-y-1.5 animate-in fade-in duration-150 shadow-xs">
                              <div className="text-amber-400 font-bold border-b border-neutral-800 pb-1 flex items-center justify-between">
                                <span>Execution Telemetry</span>
                                <span className="text-[10px] text-neutral-400 font-normal">Deterministic Grounding Pipeline</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[10px]">
                                <div>Engine: <span className="text-emerald-400 font-bold">{msg.responseMeta.retrieval_mode}</span></div>
                                <div>Latency: <span className="text-white font-bold">{msg.responseMeta.latency_ms} ms</span></div>
                                <div>Chunks: <span className="text-white font-bold">{msg.responseMeta.retrieved_count}</span></div>
                                <div>Context: <span className="text-white font-bold">{msg.responseMeta.context_chars} chars</span></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Assistant Loading / Typing Stream Indicator */}
                {loading && (
                  <div className="flex gap-4 pr-4">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-neutral-950 to-neutral-800 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ring-2 ring-neutral-100">
                      <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        <span>Analyzing documents & formulating grounded audit findings...</span>
                      </div>
                      <div className="flex items-center space-x-1.5 py-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce" />
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Quick Follow-up Slider Bar */}
          {messages.length > 0 && !loading && (
            <div className="px-4 sm:px-6 py-2 bg-neutral-50/90 border-t border-neutral-100 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 shrink-0 select-none">
                Suggested Follow-up:
              </span>

              {/* Scroll Left Button */}
              <button
                type="button"
                onClick={() => scrollFollowUps('left')}
                className="w-6 h-6 rounded-full bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-600 flex items-center justify-center shrink-0 transition-colors shadow-2xs cursor-pointer"
                title="Scroll previous suggestions"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Horizontal Scrolling Track (No scrollbar) */}
              <div
                ref={followUpScrollRef}
                className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5"
              >
                {[
                  'Are there any penalties for late deliverables or breach?',
                  'Does this invoice match the approved PO budget and item details?',
                  'Summarize discrepancies with contract cap limits.',
                  'What are the exact payment terms and discount clauses?',
                  'Check if the VAT rate and tax calculations are accurate.',
                  'Verify if invoice issuance date falls within contract term.',
                  'Are all milestone deliverables signed and approved?',
                ].map((sug, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => handleSendMessage(sug)}
                    className="px-3 py-1 rounded-full border border-neutral-200 bg-white hover:bg-neutral-100 hover:border-neutral-300 text-neutral-700 text-xs font-medium shrink-0 whitespace-nowrap transition-colors cursor-pointer shadow-2xs hover:shadow-xs"
                  >
                    {sug}
                  </button>
                ))}
              </div>

              {/* Scroll Right Button (Requested '>') */}
              <button
                type="button"
                onClick={() => scrollFollowUps('right')}
                className="w-6 h-6 rounded-full bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-800 flex items-center justify-center shrink-0 transition-colors shadow-2xs hover:border-neutral-400 cursor-pointer"
                title="Slide next suggestions"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Modern Floating AI Input Box (ChatGPT / Claude Style) */}
          <div className="p-2 sm:p-3.5 bg-gradient-to-t from-white via-white to-white/90">
            <div className="max-w-4xl mx-auto">
              <div className="relative rounded-2xl border border-neutral-300/90 bg-white focus-within:border-neutral-900 focus-within:ring-4 focus-within:ring-neutral-900/5 shadow-xs hover:shadow-sm transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputQuestion}
                  onChange={e => setInputQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about invoices, payment terms, contract maximums, or PO approvals..."
                  rows={1}
                  className="w-full px-4 pt-3 pb-9 text-xs sm:text-sm bg-transparent focus:outline-hidden resize-none text-neutral-900 placeholder:text-neutral-400 max-h-40 leading-relaxed"
                />

                {/* Input Bottom Action Row inside Bubble */}
                <div className="absolute bottom-2 left-3.5 right-2.5 flex items-center justify-between pointer-events-none">
                  {/* Left Helper Info */}
                  <div className="pointer-events-auto flex items-center gap-2 text-[10.5px] text-neutral-400 font-medium hidden sm:flex">
                    <span className="flex items-center gap-1">
                      <CornerDownLeft className="w-3 h-3 text-neutral-500" />
                      <span>Press <kbd className="font-mono bg-neutral-100 text-neutral-700 px-1 py-0.5 rounded text-[9.5px] font-semibold border border-neutral-200">Enter</kbd> to send</span>
                    </span>
                    <span>·</span>
                    <span><kbd className="font-mono bg-neutral-100 text-neutral-700 px-1 py-0.5 rounded text-[9.5px] font-semibold border border-neutral-200">/</kbd> focus input</span>
                    <span>·</span>
                    <span><kbd className="font-mono bg-neutral-100 text-neutral-700 px-1 py-0.5 rounded text-[9.5px] font-semibold border border-neutral-200">Esc</kbd> close panel</span>
                  </div>

                  {/* Right Send Button */}
                  <div className="pointer-events-auto flex items-center gap-2">
                    <button
                      id="ask-documents-send-btn"
                      onClick={() => handleSendMessage()}
                      disabled={loading || !inputQuestion.trim()}
                      className="w-7 h-7 rounded-full bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
                      title="Send question"
                    >
                      <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Sub-disclaimer */}
              <div className="text-center mt-1.5 text-[10.5px] text-neutral-400">
                Document Copilot extracts & audits claims directly from loaded case corpus files. Verify critical citations in the Inspector.
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Integrated Evidence & Document Inspector Panel */}
        {inspectorOpen && (
          <div className="w-80 lg:w-96 flex flex-col bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs shrink-0 animate-in slide-in-from-right-4 duration-200">
            {/* Inspector Top Bar */}
            <div className="p-3.5 bg-neutral-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold tracking-tight">Evidence & Document Inspector</h3>
              </div>
              <button
                onClick={() => setInspectorOpen(false)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
                title="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inspector Body Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedCitation ? (
                /* Displaying a specific citation evidence snippet */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-100 text-amber-900 border border-amber-300">
                      Citation {selectedCitation.marker}
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">
                      Page {selectedCitation.cite.page_number || 1}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-bold text-neutral-900">
                      {selectedCitation.cite.filename}
                    </div>
                    {selectedCitation.cite.section && (
                      <div className="text-[11px] font-mono text-neutral-500 uppercase">
                        Section: {selectedCitation.cite.section}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                      Extracted Text Evidence
                    </div>
                    <div className="p-3.5 rounded-xl bg-amber-50/40 border border-amber-200/80 text-xs font-mono text-neutral-900 leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap">
                      "{selectedCitation.cite.evidence}"
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={() => handleCopy(selectedCitation.cite.evidence, 'inspect-copy', 'Đã sao chép trích dẫn bằng chứng vào clipboard')}
                      className="w-full py-1.5 px-3 rounded-xl border border-neutral-300 hover:bg-neutral-50 text-xs font-medium text-neutral-700 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedId === 'inspect-copy' ? 'Copied' : 'Copy Quote'}</span>
                    </button>
                    {activeCase && activeCase.documents && activeCase.documents.length >= 2 && (
                      <button
                        onClick={() => {
                          setSplitViewerDocs(activeCase.documents || []);
                          setSplitViewerOpen(true);
                        }}
                        className="w-full py-1.5 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      >
                        <Columns className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Compare in Split Viewer</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : selectedDocPreview ? (
                /* Displaying full document text */
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-neutral-100 text-neutral-700">
                      {selectedDocPreview.document_type}
                    </div>
                    <h4 className="text-xs font-bold text-neutral-900">
                      {selectedDocPreview.filename}
                    </h4>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                      Extracted Document Text
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-[11px] font-mono text-neutral-800 leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                      {selectedDocPreview.content || 'No text extracted.'}
                    </div>
                  </div>

                  {activeCase && activeCase.documents && activeCase.documents.length >= 2 && (
                    <button
                      onClick={() => {
                        setSplitViewerDocs(activeCase.documents || []);
                        setSplitViewerOpen(true);
                      }}
                      className="w-full py-1.5 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                    >
                      <Columns className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Compare in Split Viewer</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-neutral-400 space-y-2">
                  <FileText className="w-8 h-8 text-neutral-300" />
                  <p className="text-xs">
                    Click any citation tag <code className="bg-neutral-100 px-1 rounded text-neutral-700 font-mono">[1]</code> or document chip to inspect raw evidence side-by-side.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Side-by-Side Split Document Viewer Modal */}
      {splitViewerOpen && splitViewerDocs.length > 0 && (
        <DocumentSplitViewer
          documents={splitViewerDocs}
          initialLeftDocId={selectedDocPreview?.document_id || splitViewerDocs[0]?.document_id}
          initialRightDocId={splitViewerDocs[1]?.document_id}
          caseId={activeCase?.case_id}
          onClose={() => setSplitViewerOpen(false)}
        />
      )}
    </div>
  );
}
