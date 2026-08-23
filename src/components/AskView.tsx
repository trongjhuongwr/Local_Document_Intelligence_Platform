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
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface AskViewProps {
  cases: CaseItem[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
}

export function AskView({ cases, selectedCaseId, onSelectCase }: AskViewProps) {
  const { lang, t } = useThemeLanguage();

  const categorizedPrompts = lang === 'vi' ? [
    {
      category: 'Sai lệch & Hạn mức thanh toán',
      icon: Scale,
      prompts: [
        'Điều khoản thanh toán trên hóa đơn có khớp với Hợp đồng nguyên tắc không?',
        'Tổng tiền hóa đơn có vượt quá hạn mức tối đa của Hợp đồng hoặc Đơn đặt hàng (PO) không?',
        'Có sự không khớp về đơn vị tiền tệ hoặc sai sót tính thuế GTGT/VAT không?',
      ],
    },
    {
      category: 'Quy tắc Kiểm toán & Tuân thủ',
      icon: ShieldCheck,
      prompts: [
        'Theo quy chế nội bộ có bắt buộc kèm PO không, và PO đã được phê duyệt hợp lệ chưa?',
        'Kiểm tra tính toán cộng dồn, thuế suất và tổng thanh toán có chính xác về mặt số học không?',
        'Ngày phát hành hóa đơn có nằm trong thời hạn hiệu lực của hợp đồng không?',
      ],
    },
    {
      category: 'Nghĩa vụ, Tiến độ & Điều khoản phạt',
      icon: FileSpreadsheet,
      prompts: [
        'Nghĩa vụ cốt lõi, sản phẩm bàn giao và mức độ dịch vụ (SLA) quy định ra sao?',
        'Mức phạt chậm tiến độ hoặc lãi suất quá hạn được quy định cụ thể như thế nào?',
        'Lập báo cáo tóm tắt tổng quan hồ sơ này kèm các bằng chứng quan trọng được trích dẫn.',
      ],
    },
  ] : [
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

  const suggestedFollowUps = lang === 'vi' ? [
    'Có điều khoản phạt nào khi giao hàng chậm tiến độ hoặc vi phạm hợp đồng không?',
    'Hóa đơn này có khớp với ngân sách và chi tiết các mục trong PO đã duyệt không?',
    'Tóm tắt các điểm sai lệch so với hạn mức ngân sách hợp đồng.',
    'Điều khoản thanh toán chính xác và chiết khấu thanh toán sớm quy định ra sao?',
    'Kiểm tra thuế suất VAT và tính toán tiền thuế có chuẩn xác không.',
    'Xác minh ngày lập hóa đơn có thuộc khung thời gian hiệu lực hợp đồng không.',
    'Tất cả các mốc bàn giao nghiệm thu đã có đủ chữ ký xác nhận chưa?',
  ] : [
    'Are there any penalties for late deliverables or breach?',
    'Does this invoice match the approved PO budget and item details?',
    'Summarize discrepancies with contract cap limits.',
    'What are the exact payment terms and discount clauses?',
    'Check if the VAT rate and tax calculations are accurate.',
    'Verify if invoice issuance date falls within contract term.',
    'Are all milestone deliverables signed and approved?',
  ];

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
          showToast(lang === 'vi' ? 'Đã trỏ con trỏ vào ô nhập câu hỏi (/)' : 'Focused chat input (Shortcut: /)');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [inspectorOpen, lang]);

  const scrollFollowUps = (direction: 'left' | 'right') => {
    if (followUpScrollRef.current) {
      const scrollAmount = 260;
      followUpScrollRef.current.scrollBy({
        left: direction === 'right' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Auto-resize textarea
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
        throw new Error(lang === 'vi' ? 'Không thể truy vấn công cụ phân tích tài liệu' : 'Failed to query document intelligence engine');
      }

      const data: QueryResponse = await res.json();

      const assistantMessage: ChatMessage = {
        id: 'msg_' + (Date.now() + 1),
        role: 'assistant',
        content: data.answer || (lang === 'vi' ? 'Không thể thiết lập câu trả lời từ các tài liệu hiện có.' : 'No answer could be formulated from the available documents.'),
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
        content: lang === 'vi' 
          ? `**Lỗi**: Không thể hoàn tất phân tích tài liệu (${err.message || 'Lỗi mạng'}). Vui lòng thử lại.` 
          : `**Error**: Unable to complete document analysis (${err.message || 'Network error'}). Please try again.`,
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

  const handleCopy = (text: string, id: string, label: string = lang === 'vi' ? 'Đã sao chép vào bộ nhớ tạm' : 'Copied to clipboard') => {
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
          `### [${m.role === 'user' ? (lang === 'vi' ? 'NGƯỜI DÙNG' : 'USER') : (lang === 'vi' ? 'TRỢ LÝ AI KIỂM TOÁN' : 'DOCUMENT AI COPILOT')}] - ${new Date(m.created_at).toLocaleString()}\n\n${m.content}\n`
      )
      .join('\n---\n\n');

    const blob = new Blob([transcript], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_chat_${selectedCaseId || 'all_cases'}_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(lang === 'vi' ? 'Đã xuất toàn bộ lịch sử hội thoại ra tệp Markdown' : 'Exported conversation history to Markdown');
  };

  const handleSaveToAuditNotes = (msg: ChatMessage) => {
    setSavedFeedbackId(msg.id);
    showToast(lang === 'vi' ? 'Đã lưu phát hiện vào ghi chú kiểm toán viên' : 'Saved finding to auditor notes');
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
        <div className="fixed top-6 right-6 z-50 bg-neutral-900/95 dark:bg-neutral-100/95 text-white dark:text-neutral-900 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl border border-neutral-700 dark:border-neutral-200 backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Context Control Strip */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-800 rounded-2xl p-2.5 mb-2 shadow-xs transition-all">
        {/* Row 1: Brand & Top Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-950 dark:from-neutral-100 dark:to-neutral-300 text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white tracking-tight">
                  {t.ask.copilotTitle}
                </h1>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Gemini 3.7 Flash Grounded
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 hidden sm:block">
                {t.ask.copilotDesc}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                inspectorOpen
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700 shadow-2xs'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
              }`}
              title={t.ask.evidenceInspector}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t.ask.evidenceInspector}</span>
              {selectedCitation && (
                <span className="w-2 h-2 rounded-full bg-amber-500 ml-0.5 animate-pulse" />
              )}
            </button>

            {messages.length > 0 && (
              <>
                <button
                  onClick={handleExportTranscript}
                  title="Export chat transcript as Markdown"
                  className="px-2 py-1 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span className="hidden sm:inline">{t.ask.exportBtn}</span>
                </button>
                <button
                  onClick={() => {
                    setMessages([]);
                    setSelectedCitation(null);
                  }}
                  title="Clear conversation history"
                  className="px-2 py-1 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800 text-neutral-600 dark:text-neutral-400 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.ask.clearBtn}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Controls Toolbar (Scope Selector & Retrieval Mode Pills) */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
          {/* Target Case Scope Dropdown */}
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3 text-neutral-400" />
              {t.ask.scope}:
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
                className="w-full pl-2.5 pr-8 py-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50/80 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 focus:bg-white dark:focus:bg-neutral-750 focus:border-neutral-900 dark:focus:border-neutral-400 focus:outline-hidden transition-all"
              >
                <option value="all">🌐 {t.ask.allCasesScope}</option>
                {cases.map(c => (
                  <option key={c.case_id} value={c.case_id}>
                    📁 {c.name} ({c.document_count} {lang === 'vi' ? 'tài liệu' : 'files'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Retrieval Mode Segmented Pills */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Sliders className="w-3 h-3 text-neutral-400" />
              {t.ask.engine}:
            </span>
            <div className="inline-flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-0.5 border border-neutral-200 dark:border-neutral-700">
              {(
                [
                  { id: 'bm25', label: 'BM25', tooltip: lang === 'vi' ? 'Tìm kiếm chính xác từ khóa' : 'High precision exact keyword match' },
                  { id: 'hybrid', label: 'Hybrid', tooltip: lang === 'vi' ? 'Kết hợp BM25 + Vector ngữ nghĩa' : 'BM25 + Semantic dense vector fusion' },
                  { id: 'dense', label: 'Dense', tooltip: lang === 'vi' ? 'Nhúng vector ngữ nghĩa sâu' : 'Deep semantic vector embedding' },
                ] as const
              ).map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setRetrievalMode(mode.id)}
                  title={mode.tooltip}
                  className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                    retrievalMode === mode.id
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs font-bold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
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
          <div className="mt-2 pt-1.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 overflow-x-auto no-scrollbar">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300 shrink-0 text-[10px] uppercase tracking-wider">
              {t.ask.activeFiles}:
            </span>
            {activeCase.documents.map(d => (
              <button
                key={d.document_id}
                onClick={() => openDocInInspector(d)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-100/90 dark:bg-neutral-800 hover:bg-neutral-200/90 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono text-[10px] shrink-0 border border-neutral-200/60 dark:border-neutral-700 transition-colors cursor-pointer"
                title={lang === 'vi' ? 'Nhấn để xem toàn bộ nội dung văn bản trích xuất' : 'Click to view full extracted document text'}
              >
                <FileText className="w-2.5 h-2.5 text-neutral-500 dark:text-neutral-400" />
                <span>{d.filename}</span>
                <span className="text-[9px] text-neutral-400 dark:text-neutral-500">({d.document_type})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Workspace: Modern AI Chat (Claude / ChatGPT / Gemini Inspired) */}
      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Left / Center Column: Conversation Thread */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/90 dark:border-neutral-800 overflow-hidden shadow-xs relative">
          
          {/* Scrollable Messages Container */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-2.5 space-y-4">
            {messages.length === 0 ? (
              /* Hero Empty State & Prompt Library */
              <div className="h-full flex flex-col justify-center items-center text-center max-w-4xl mx-auto py-1 space-y-2.5">
                <div className="space-y-1">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-neutral-950 via-neutral-900 to-neutral-800 dark:from-neutral-100 dark:to-neutral-300 text-white dark:text-neutral-900 flex items-center justify-center mx-auto shadow-xs ring-2 ring-neutral-100 dark:ring-neutral-800">
                    <Sparkles className="w-4 h-4 text-amber-400 dark:text-amber-600" />
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white tracking-tight">
                    {t.ask.heroQuestion}
                  </h2>
                  <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto leading-tight">
                    {t.ask.heroSubtitle}
                  </p>
                </div>

                {/* Case-Aware Contextual Smart Prompts */}
                {activeCase && !searchAllCases && (
                  <div className="w-full p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800 text-left space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>{lang === 'vi' ? `Gợi ý kiểm toán hồ sơ "${activeCase.name}"` : `Smart Audit Prompts for "${activeCase.name}"`}</span>
                      </span>
                      <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium">
                        {activeCase.document_count} {lang === 'vi' ? 'tài liệu đã nạp' : 'file(s) loaded'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                      <button
                        onClick={() => handleSendMessage(lang === 'vi' ? `Kiểm tra xem tổng tiền hóa đơn và đơn giá có khớp với thỏa thuận hợp đồng của ${activeCase.name} không` : `Check if invoice total and hourly rates match the contract agreement for ${activeCase.name}`)}
                        className="p-2 rounded-lg bg-white dark:bg-neutral-800 border border-blue-200 dark:border-blue-800 text-left hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-2xs transition-all cursor-pointer text-xs"
                      >
                        <p className="font-semibold text-neutral-900 dark:text-white text-[11px] line-clamp-1">{lang === 'vi' ? 'Đối soát Đơn giá & Hạn mức' : 'Rate & Cap Verification'}</p>
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">{lang === 'vi' ? 'So khớp hóa đơn với trần hợp đồng' : 'Compare invoice against contract cap'}</p>
                      </button>
                      <button
                        onClick={() => handleSendMessage(lang === 'vi' ? `Các điều khoản thanh toán, thuế suất VAT và phép tính cộng tiền có hợp lệ về số học không?` : `Are payment terms, VAT tax rates, and subtotal calculations mathematically valid in this case?`)}
                        className="p-2 rounded-lg bg-white dark:bg-neutral-800 border border-blue-200 dark:border-blue-800 text-left hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-2xs transition-all cursor-pointer text-xs"
                      >
                        <p className="font-semibold text-neutral-900 dark:text-white text-[11px] line-clamp-1">{lang === 'vi' ? 'Kiểm tra Số học & Thuế' : 'Arithmetic & Tax Check'}</p>
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">{lang === 'vi' ? 'Xác thực phép tính thuế và cộng dồn' : 'Verify tax and subtotal arithmetic'}</p>
                      </button>
                      <button
                        onClick={() => handleSendMessage(lang === 'vi' ? `Lập báo cáo tóm tắt kiểm toán cho ${activeCase.name} gồm nghĩa vụ chính, sản phẩm giao nộp và các sai lệch.` : `Provide an executive audit summary of ${activeCase.name} with key obligations, deliverables, and discrepancies.`)}
                        className="p-2 rounded-lg bg-white dark:bg-neutral-800 border border-blue-200 dark:border-blue-800 text-left hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-2xs transition-all cursor-pointer text-xs"
                      >
                        <p className="font-semibold text-neutral-900 dark:text-white text-[11px] line-clamp-1">{lang === 'vi' ? 'Báo cáo Tóm tắt Toàn diện' : 'Executive Summary Dossier'}</p>
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">{lang === 'vi' ? 'Liệt kê nghĩa vụ, SLA & sai lệch' : 'List obligations, SLA, & discrepancies'}</p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Categorized Prompt Suggestions (3x3 Grid) */}
                <div className="w-full space-y-2 text-left">
                  {categorizedPrompts.map((cat, catIdx) => {
                    const IconComp = cat.icon;
                    return (
                      <div key={catIdx} className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          <IconComp className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                          <span>{cat.category}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {cat.prompts.map((prompt, pIdx) => (
                            <button
                              key={pIdx}
                              onClick={() => handleSendMessage(prompt)}
                              className="p-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-850/60 hover:bg-white dark:hover:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-2xs text-left transition-all cursor-pointer group flex flex-col justify-between min-h-[58px]"
                            >
                              <p className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-neutral-950 dark:group-hover:text-white leading-snug line-clamp-2">
                                {prompt}
                              </p>
                              <div className="mt-1 flex items-center text-[10px] text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-800 dark:group-hover:text-neutral-300 font-semibold gap-0.5">
                                <span>{t.ask.askThis}</span>
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
                      /* USER MESSAGE */
                      <div className="flex justify-end pl-12">
                        <div className="bg-neutral-900 dark:bg-neutral-800 text-neutral-100 dark:text-white rounded-3xl rounded-tr-sm px-5 py-3.5 shadow-xs max-w-2xl border border-transparent dark:border-neutral-700">
                          <div className="text-sm leading-relaxed whitespace-pre-wrap font-normal selection:bg-neutral-700">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ASSISTANT MESSAGE */
                      <div className="flex gap-4 pr-4">
                        {/* Assistant Avatar */}
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-neutral-950 to-neutral-800 dark:from-neutral-100 dark:to-neutral-300 text-white dark:text-neutral-900 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ring-2 ring-neutral-100 dark:ring-neutral-800">
                          <Sparkles className="w-4 h-4 text-amber-400 dark:text-amber-600" />
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Verification & Metadata Header */}
                          {msg.responseMeta?.verification && (
                            <div className="flex items-center gap-2">
                              {msg.responseMeta.verification.valid ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>{t.ask.groundedBadge}</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                  <span>{t.ask.unverifiedWarning}</span>
                                </div>
                              )}

                              {msg.responseMeta.latency_ms && (
                                <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
                                  {msg.responseMeta.latency_ms}ms
                                </span>
                              )}
                            </div>
                          )}

                          {/* Markdown Rendered Answer */}
                          <div className="markdown-body text-sm text-neutral-900 dark:text-neutral-100 leading-relaxed">
                            <Markdown>{msg.content}</Markdown>
                          </div>

                          {/* Inline Evidence Citations Cards */}
                          {msg.responseMeta?.citations &&
                            Object.keys(msg.responseMeta.citations).length > 0 && (
                              <div className="pt-2 space-y-2">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
                                  <FileSearch className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                                  <span>{t.ask.groundedCitations} ({Object.keys(msg.responseMeta.citations).length})</span>
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
                                            ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 ring-2 ring-amber-300/40 shadow-xs'
                                            : 'bg-neutral-50/70 dark:bg-neutral-850/70 border-neutral-200 dark:border-neutral-800 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between font-bold text-neutral-800 dark:text-neutral-200">
                                          <span className="inline-flex items-center gap-1 font-mono text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 rounded text-[11px]">
                                            {marker} {cite.filename}
                                          </span>
                                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                                            {lang === 'vi' ? 'trang' : 'p.'} {cite.page_number || 1}
                                          </span>
                                        </div>
                                        {cite.section && (
                                          <div className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 uppercase">
                                            {cite.section}
                                          </div>
                                        )}
                                        <p className="text-neutral-600 dark:text-neutral-400 text-[11px] italic line-clamp-2 leading-relaxed">
                                          "{cite.evidence}"
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                          {/* Assistant Action Bar (Copy, Save Note, Telemetry) */}
                          <div className="flex items-center justify-between pt-1 text-xs text-neutral-400 dark:text-neutral-500">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleCopy(msg.content, msg.id, lang === 'vi' ? 'Đã sao chép câu trả lời vào bộ nhớ tạm' : 'Copied response to clipboard')}
                                className="hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-[11px] font-medium"
                                title="Copy response text"
                              >
                                {copiedId === msg.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                <span>{copiedId === msg.id ? (lang === 'vi' ? 'Đã sao chép' : 'Copied') : t.ask.copyAnswerBtn}</span>
                              </button>

                              <button
                                onClick={() => handleSaveToAuditNotes(msg)}
                                className="hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-[11px] font-medium"
                                title="Save to Review Findings note"
                              >
                                {savedFeedbackId === msg.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <BookmarkPlus className="w-3.5 h-3.5" />
                                )}
                                <span>{savedFeedbackId === msg.id ? (lang === 'vi' ? 'Đã lưu ghi chú' : 'Saved to notes') : (lang === 'vi' ? 'Lưu ghi chú' : 'Save Note')}</span>
                              </button>

                              {msg.responseMeta && (
                                <button
                                  onClick={() =>
                                    setExpandedTechId(expandedTechId === msg.id ? null : msg.id)
                                  }
                                  className="hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center gap-1 text-[11px] font-medium cursor-pointer py-1 px-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                  <span>{lang === 'vi' ? 'Chi tiết' : 'Details'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Technical Telemetry Expander */}
                          {expandedTechId === msg.id && msg.responseMeta && (
                            <div className="p-3 rounded-xl bg-neutral-900 dark:bg-neutral-950 text-neutral-200 font-mono text-[11px] space-y-1.5 animate-in fade-in duration-150 shadow-xs border border-neutral-800">
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
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-neutral-950 to-neutral-800 dark:from-neutral-100 dark:to-neutral-300 text-white dark:text-neutral-900 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ring-2 ring-neutral-100 dark:ring-neutral-800">
                      <Sparkles className="w-4 h-4 text-amber-400 dark:text-amber-600 animate-spin" />
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        <span>{lang === 'vi' ? 'Đang thẩm tra & đối chiếu chứng từ...' : 'Analyzing documents & verifying citations...'}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 py-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 dark:bg-neutral-700 animate-bounce" />
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 dark:bg-neutral-700 animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 dark:bg-neutral-700 animate-bounce [animation-delay:0.4s]" />
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
            <div className="px-4 sm:px-6 py-2 bg-neutral-50/90 dark:bg-neutral-850/90 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 shrink-0 select-none">
                {lang === 'vi' ? 'Gợi ý tiếp theo' : 'Suggested'}:
              </span>

              {/* Scroll Left Button */}
              <button
                type="button"
                onClick={() => scrollFollowUps('left')}
                className="w-6 h-6 rounded-full bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 flex items-center justify-center shrink-0 transition-colors shadow-2xs cursor-pointer"
                title="Scroll previous suggestions"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Horizontal Scrolling Track */}
              <div
                ref={followUpScrollRef}
                className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5"
              >
                {suggestedFollowUps.map((sug, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => handleSendMessage(sug)}
                    className="px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300 text-xs font-medium shrink-0 whitespace-nowrap transition-colors cursor-pointer shadow-2xs hover:shadow-xs"
                  >
                    {sug}
                  </button>
                ))}
              </div>

              {/* Scroll Right Button */}
              <button
                type="button"
                onClick={() => scrollFollowUps('right')}
                className="w-6 h-6 rounded-full bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 flex items-center justify-center shrink-0 transition-colors shadow-2xs hover:border-neutral-400 cursor-pointer"
                title="Slide next suggestions"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Modern Floating AI Input Box */}
          <div className="p-2 sm:p-3.5 bg-gradient-to-t from-white via-white to-white/90 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-900/90">
            <div className="max-w-4xl mx-auto">
              <div className="relative rounded-2xl border border-neutral-300/90 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus-within:border-neutral-900 dark:focus-within:border-neutral-400 focus-within:ring-4 focus-within:ring-neutral-900/5 shadow-xs hover:shadow-sm transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputQuestion}
                  onChange={e => setInputQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.ask.inputPlaceholder}
                  rows={1}
                  className="w-full px-4 pt-3 pb-9 text-xs sm:text-sm bg-transparent focus:outline-hidden resize-none text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 max-h-40 leading-relaxed"
                />

                {/* Input Bottom Action Row inside Bubble */}
                <div className="absolute bottom-2 left-3.5 right-2.5 flex items-center justify-between pointer-events-none">
                  {/* Left Helper Info */}
                  <div className="pointer-events-auto flex items-center gap-2 text-[10.5px] text-neutral-400 dark:text-neutral-500 font-medium hidden sm:flex">
                    <span className="flex items-center gap-1">
                      <CornerDownLeft className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                      <span>{lang === 'vi' ? 'Nhấn ' : 'Press '}<kbd className="font-mono bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-1 py-0.5 rounded text-[9.5px] font-semibold border border-neutral-200 dark:border-neutral-600">Enter</kbd>{lang === 'vi' ? ' để gửi' : ' to send'}</span>
                    </span>
                    <span>·</span>
                    <span><kbd className="font-mono bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-1 py-0.5 rounded text-[9.5px] font-semibold border border-neutral-200 dark:border-neutral-600">/</kbd> {lang === 'vi' ? 'trỏ ô nhập' : 'focus input'}</span>
                    <span>·</span>
                    <span><kbd className="font-mono bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-1 py-0.5 rounded text-[9.5px] font-semibold border border-neutral-200 dark:border-neutral-600">Esc</kbd> {lang === 'vi' ? 'đóng bảng' : 'close panel'}</span>
                  </div>

                  {/* Right Send Button */}
                  <div className="pointer-events-auto flex items-center gap-2">
                    <button
                      id="ask-documents-send-btn"
                      onClick={() => handleSendMessage()}
                      disabled={loading || !inputQuestion.trim()}
                      className="w-7 h-7 rounded-full bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-neutral-900 dark:disabled:hover:bg-white text-white dark:text-neutral-900 flex items-center justify-center transition-all cursor-pointer shadow-xs"
                      title={lang === 'vi' ? 'Gửi câu hỏi' : 'Send question'}
                    >
                      <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Sub-disclaimer */}
              <div className="text-center mt-1.5 text-[10.5px] text-neutral-400 dark:text-neutral-500">
                {lang === 'vi' ? 'Hệ thống đối soát xác định 100% kèm trích dẫn chứng cứ SOX/ISO.' : 'Deterministic audit with 100% citation grounding and cryptographic integrity.'}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Integrated Evidence & Document Inspector Panel */}
        {inspectorOpen && (
          <div className="w-80 lg:w-96 flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs shrink-0 animate-in slide-in-from-right-4 duration-200">
            {/* Inspector Top Bar */}
            <div className="p-3.5 bg-neutral-950 dark:bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold tracking-tight">{t.ask.evidenceInspectorTitle}</h3>
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
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                      {lang === 'vi' ? 'Trích dẫn' : 'Citation'} {selectedCitation.marker}
                    </span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
                      {lang === 'vi' ? 'Trang' : 'Page'} {selectedCitation.cite.page_number || 1}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-bold text-neutral-900 dark:text-white">
                      {selectedCitation.cite.filename}
                    </div>
                    {selectedCitation.cite.section && (
                      <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 uppercase">
                        {lang === 'vi' ? 'Mục' : 'Section'}: {selectedCitation.cite.section}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      {lang === 'vi' ? 'Bằng chứng trích xuất' : 'Extracted Evidence'}
                    </div>
                    <div className="p-3.5 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800 text-xs font-mono text-neutral-900 dark:text-neutral-200 leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap">
                      "{selectedCitation.cite.evidence}"
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={() => handleCopy(selectedCitation.cite.evidence, 'inspect-copy', lang === 'vi' ? 'Đã sao chép trích dẫn bằng chứng vào bộ nhớ tạm' : 'Copied evidence quote to clipboard')}
                      className="w-full py-1.5 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedId === 'inspect-copy' ? (lang === 'vi' ? 'Đã sao chép' : 'Copied') : (lang === 'vi' ? 'Sao chép đoạn trích' : 'Copy Quote')}</span>
                    </button>
                    {activeCase && activeCase.documents && activeCase.documents.length >= 2 && (
                      <button
                        onClick={() => {
                          setSplitViewerDocs(activeCase.documents || []);
                          setSplitViewerOpen(true);
                        }}
                        className="w-full py-1.5 px-3 rounded-xl bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-white text-white dark:text-neutral-900 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      >
                        <Columns className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
                        <span>{t.ask.openInSplitViewer}</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : selectedDocPreview ? (
                /* Displaying full document text */
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                      {selectedDocPreview.document_type}
                    </div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                      {selectedDocPreview.filename}
                    </h4>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      {lang === 'vi' ? 'Nội dung chứng từ trích xuất' : 'Extracted Document Text'}
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 text-[11px] font-mono text-neutral-800 dark:text-neutral-200 leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                      {selectedDocPreview.content || (lang === 'vi' ? 'Không có nội dung văn bản trích xuất.' : 'No text extracted.')}
                    </div>
                  </div>

                  {activeCase && activeCase.documents && activeCase.documents.length >= 2 && (
                    <button
                      onClick={() => {
                        setSplitViewerDocs(activeCase.documents || []);
                        setSplitViewerOpen(true);
                      }}
                      className="w-full py-1.5 px-3 rounded-xl bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-white text-white dark:text-neutral-900 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                    >
                      <Columns className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
                      <span>{t.ask.openInSplitViewer}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-neutral-400 dark:text-neutral-500 space-y-2">
                  <FileText className="w-8 h-8 text-neutral-300 dark:text-neutral-600" />
                  <p className="text-xs">
                    {lang === 'vi' ? 'Nhấn vào bất kỳ thẻ trích dẫn nào ' : 'Click any citation tag '}
                    <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded text-neutral-700 dark:text-neutral-300 font-mono">[1]</code>
                    {lang === 'vi' ? ' hoặc tệp hồ sơ để soi bằng chứng trực tiếp.' : ' or document chip to inspect raw evidence side-by-side.'}
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

