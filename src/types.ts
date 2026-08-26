export type DocumentType = 'contract' | 'invoice' | 'purchase_order' | 'policy' | 'other';
/** app/services/cases.py calculate_readiness() returns exactly these. */
export type CaseReadiness = 'complete' | 'limited' | 'blocked';
export type Severity = 'high' | 'medium' | 'low';
export type ReviewStatus = 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
export type WorkflowStatus = 'queued' | 'running' | 'completed' | 'failed';
/** app/models Document.status */
export type DocumentStatus = 'pending' | 'parsed' | 'failed';

export interface Calculation {
  formula: string;
  operands: Record<string, number | string | null>;
  result: number | string;
}

export interface EvidenceItem {
  filename: string;
  document_id?: string;
  document_type?: string;
  field?: string;
  page_number?: number | null;
  section?: string | null;
  snippet?: string | null;
  text?: string | null;
}

export interface Discrepancy {
  type: string;
  severity: Severity;
  description: string;
  field?: string;
  /** "DETERMINISTIC_MISMATCH" | "MODEL_SUSPECTED" | ... */
  source?: string;
  invoice_number?: string;
  expected_value?: any;
  observed_value?: any;
  difference?: number | null;
  calculation?: Calculation | null;
  evidence?: EvidenceItem[];
  confidence?: number;
}

/** GET /api/documents/{id}/chunks */
export interface DocumentChunk {
  chunk_id: string;
  document_id: string;
  text: string;
  page_number?: number | null;
  section?: string | null;
  element_type: string;
  order_index: number;
  token_estimate: number;
  chunk_metadata?: Record<string, any>;
}

/** Document as embedded in GET /api/cases/{id}. */
export interface CaseDocument {
  document_id: string;
  filename: string;
  document_type: DocumentType;
  status: DocumentStatus;
  size_bytes: number;
  sha256: string;
  parser_version: string;
  page_count?: number | null;
  error_message?: string | null;
  created_at: string;
}

/** GET /api/documents/{id} */
export interface DocumentDetail extends CaseDocument {
  mime_type: string;
  case_id?: string | null;
  doc_metadata: Record<string, any>;
  element_count: number;
  chunk_count: number;
}

export interface WorkflowStep {
  step: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  details?: Record<string, any>;
  completed_at?: string | null;
}

/** WorkflowRun.result for the discrepancy_analysis workflow. */
export interface WorkflowResult {
  case_id?: string;
  issues: Discrepancy[];
  issue_count?: number;
  deterministic_issue_count?: number;
  model_suspected_issue_count?: number;
  summary: string;
  checks_run?: number;
  limitations?: string[];
  documents_analyzed: string[];
  extraction_failures: string[];
  review_task_ids?: string[];
  requires_human_review?: boolean;
  model_version: string;
  report_markdown?: string;
  workflow_completed_at?: string;
}

/** GET /api/workflows/{id} */
export interface WorkflowRun {
  workflow_id: string;
  workflow_type?: string;
  case_id: string;
  status: WorkflowStatus;
  route?: string | null;
  input?: Record<string, any> | null;
  progress_percent: number;
  current_step: string | null;
  steps: WorkflowStep[];
  result?: WorkflowResult | null;
  report_markdown?: string;
  requires_review?: boolean;
  errors?: string[] | null;
  duration_ms?: number | null;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

/** The `latest_workflow` summary embedded in GET /api/cases/{id}. */
export interface WorkflowSummary {
  workflow_id: string;
  status: WorkflowStatus;
  requires_review?: boolean;
  duration_ms?: number | null;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

/** GET /api/cases and GET /api/cases/{id} */
export interface CaseItem {
  case_id: string;
  name: string;
  source?: string;
  readiness: CaseReadiness;
  document_count: number;
  document_types: DocumentType[];
  missing_document_types: DocumentType[];
  open_review_count: number;
  workflow_status?: WorkflowStatus | null;
  last_analyzed_at?: string | null;
  /** Present only on the detail endpoint. */
  documents?: CaseDocument[];
  latest_workflow?: WorkflowSummary | null;
  created_at: string;
  updated_at: string;
}

/** POST /api/cases/{id}/analyses -> 202 */
export interface AnalysisAccepted {
  workflow_id: string;
  case_id: string;
  status: WorkflowStatus;
  existing: boolean;
}

/** GET /api/reviews */
export interface ReviewFinding {
  review_id: string;
  case_id: string;
  workflow_run_id: string | null;
  severity: Severity;
  status: ReviewStatus;
  discrepancy: Discrepancy;
  reviewer?: string | null;
  note?: string | null;
  created_at: string;
  decided_at?: string | null;
}

export interface SearchResultItem {
  chunk_id: string;
  document_id: string;
  filename: string;
  document_type: DocumentType;
  page_number?: number | null;
  section?: string | null;
  text: string;
  score: number;
  rank?: number;
}

export interface QueryCitation {
  citation_id?: string;
  chunk_id?: string;
  document_id?: string;
  document_type?: string;
  filename: string;
  page_number?: number | null;
  section?: string | null;
  evidence: string;
}

/** app/citations/verifier.py output. */
export interface CitationVerification {
  valid: boolean;
  used_citation_ids?: string[];
  unknown_citation_ids?: string[];
  unused_citation_ids?: string[];
  warnings?: string[];
}

/** POST /api/query */
export interface QueryResponse {
  answer: string;
  /** Citations are keyed by marker: {"C1": {...}, "C2": {...}} */
  citations: Record<string, QueryCitation>;
  verification: CitationVerification;
  retrieval_mode: RetrievalMode;
  route: string;
  routing_method: string;
  retrieved_count: number;
  context_chars: number;
  latency_ms: number;
  suggested_action?: string | null;
  /** Set when a single-value lookup drew evidence from several document packs. */
  scope_warning?: string | null;
}

export type RetrievalMode = 'bm25' | 'dense' | 'hybrid';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  /** Set when the message failed, so the UI can style it as an error. */
  isError?: boolean;
  responseMeta?: {
    citations?: Record<string, QueryCitation>;
    verification?: CitationVerification;
    retrieval_mode?: RetrievalMode;
    route?: string;
    routing_method?: string;
    retrieved_count?: number;
    context_chars?: number;
    latency_ms?: number;
    suggested_action?: string | null;
    scope_warning?: string | null;
  };
}

/** GET /api/ready */
export interface ReadyStatus {
  status: 'ready' | 'not_ready';
  checks: {
    database?: { status: string; detail?: string; hint?: string };
    ollama?: {
      status: string;
      detail?: string;
      hint?: string;
      llm_model?: { model: string; available: boolean; hint?: string };
      embedding_model?: { model: string; available: boolean; hint?: string };
    };
  };
}

// ---------------------------------------------------------------------------
// Evaluation reports (evals/reports/*.json, served by GET /api/evals).
// Every section is optional: the backend only returns what has actually been
// generated, and the UI renders "not yet generated" for anything missing.
// ---------------------------------------------------------------------------

export interface PrecisionRecallF1 {
  tp?: number;
  fp?: number;
  fn?: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface RetrievalModeMetrics {
  recall_at_1: number;
  recall_at_3: number;
  recall_at_5: number;
  mrr: number;
  ndcg_at_5?: number;
  mean_latency_ms: number;
}

export interface RetrievalEvalReport {
  generated_at?: string;
  cases_evaluated?: number;
  query_count?: number;
  top_k?: number;
  embedding_model?: string;
  corpus_documents?: number;
  modes: Partial<Record<RetrievalMode, RetrievalModeMetrics>>;
  recommended_default?: string;
  recommendation_basis?: string;
  headline?: string;
}

export interface ExtractionTypeMetrics {
  documents: number;
  schema_valid_rate: number;
  overall_field_accuracy: number;
  numeric_accuracy: number;
  date_accuracy: number;
  required_field_completeness?: number;
  field_accuracy?: Record<string, number>;
}

export interface ExtractionEvalReport {
  generated_at?: string;
  cases_evaluated?: number;
  model?: string;
  overall_field_accuracy: number;
  overall_schema_valid_rate: number;
  median_llm_latency_ms: number;
  p95_llm_latency_ms: number;
  by_document_type: Record<string, ExtractionTypeMetrics>;
}

export interface RouterMetrics {
  total?: number;
  accuracy: number;
  macro_f1: number;
  per_route?: Record<string, PrecisionRecallF1>;
}

export interface RoutingEvalReport {
  generated_at?: string;
  model?: string;
  production_router: RouterMetrics;
  llm_assisted_router?: RouterMetrics;
  llm_only?: RouterMetrics;
  keyword_only?: RouterMetrics;
  production_router_method_counts?: Record<string, number>;
  headline?: string;
}

export interface DiscrepancyEvalReport {
  generated_at?: string;
  mode?: string;
  cases_evaluated?: number;
  expected_anomalies?: number;
  overall: PrecisionRecallF1;
  by_type?: Record<string, PrecisionRecallF1>;
}

export interface GenerationEvalReport {
  generated_at?: string;
  model?: string;
  queries?: number;
  query_completion_rate: number;
  citation_presence_rate: number;
  valid_citation_rate: number;
  correct_document_rate?: number;
  no_evidence_rate?: number;
  median_latency_ms: number;
  p95_latency_ms?: number | null;
  note?: string;
  headline?: string;
}

export interface WorkflowEvalReport {
  generated_at?: string;
  cases?: number;
  completed?: number;
  failed?: number;
  completion_rate: number;
  documents_processed?: number;
  extraction_failure_count: number;
  extraction_failure_rate?: number;
  review_task_creation_consistency: number;
  median_duration_ms: number;
  p95_duration_ms?: number | null;
  headline?: string;
}

export interface EvalResults {
  retrieval?: RetrievalEvalReport;
  extraction?: ExtractionEvalReport;
  routing?: RoutingEvalReport;
  discrepancy_rules?: DiscrepancyEvalReport;
  discrepancy_end_to_end?: DiscrepancyEvalReport;
  generation?: GenerationEvalReport;
  workflow?: WorkflowEvalReport;
}

/** GET /api/evals */
export interface EvalReport {
  results: EvalResults;
  /** Section names with no report file on disk. */
  missing?: string[];
  unreadable?: Array<{ section: string; error: string }>;
  /** Why a section is absent, e.g. "retrieval (report not generated)". */
  skipped?: string[];
  /** Why the last real run skipped an eval, e.g. "retrieval (Ollama unreachable)". */
  consolidated_skipped?: string[];
  source?: string;
  source_generated_at?: Record<string, string | null>;
  sections?: string[];
}

/** POST /api/evals/run -> 202 */
export interface EvalRunAccepted {
  run_id: string;
  status: string;
  poll_url?: string;
}

/** GET /api/evals/runs/{id} */
export interface EvalRunStatus {
  run_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  cases?: number;
  started_at?: string | null;
  completed_at?: string | null;
  returncode?: number | null;
  stdout_tail?: string | null;
  stderr_tail?: string | null;
  errors?: string[] | null;
}

/**
 * Actions the ledger projection currently emits. Kept open-ended (`| string`)
 * so a new backend event type renders with its raw label instead of breaking
 * the build or being silently dropped.
 */
export type AuditAction =
  | 'DOCUMENT_INGESTED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'QUERY_EXECUTED'
  | 'FINDING_FLAGGED'
  | 'FINDING_APPROVED'
  | 'FINDING_REJECTED'
  | 'FINDING_RESOLVED'
  | 'FINDING_BATCH_ACTION'
  | 'CASE_CREATED'
  | 'CASE_DELETED'
  | 'REPORT_EXPORTED'
  | 'MANUAL_ATTESTATION'
  | (string & {});

export type AuditEntityType =
  | 'document'
  | 'workflow'
  | 'review_finding'
  | 'case'
  | 'query'
  | 'report'
  | 'attestation'
  | (string & {});

export interface AuditTrailEntry {
  log_id: string;
  timestamp: string;
  action: AuditAction;
  actor: string;
  case_id?: string | null;
  case_name?: string | null;
  entity_type: AuditEntityType;
  entity_id: string;
  details: string;
  metadata?: Record<string, any>;
  prev_hash: string;
  integrity_hash: string;
}

/** GET /api/audit-trail */
export interface AuditTrailResponse {
  entries: AuditTrailEntry[];
  count?: number;
  total: number;
  limit?: number;
  offset?: number;
  chain_valid?: boolean;
  chain_algorithm?: string;
  /** The backend's own caveat about how the chain is computed. */
  chain_note?: string;
}
