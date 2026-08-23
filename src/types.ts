export type DocumentType = 'contract' | 'invoice' | 'purchase_order' | 'policy' | 'other';
export type CaseReadiness = 'ready' | 'limited' | 'blocked';
export type Severity = 'high' | 'medium' | 'low';
export type ReviewStatus = 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
export type WorkflowStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Calculation {
  formula: string;
  operands: Record<string, number | string | null>;
  result: number | string;
}

export interface EvidenceItem {
  filename: string;
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
  invoice_number?: string;
  expected_value?: any;
  observed_value?: any;
  difference?: number | null;
  calculation?: Calculation;
  evidence?: EvidenceItem[];
  confidence?: number;
}

export interface DocumentChunk {
  chunk_id: string;
  document_id: string;
  page_number?: number;
  section?: string;
  text: string;
}

export interface CaseDocument {
  document_id: string;
  filename: string;
  document_type: DocumentType;
  status: 'indexed' | 'pending' | 'failed';
  size_bytes: number;
  sha256: string;
  parser_version: string;
  content?: string;
  extracted_data?: Record<string, any>;
  created_at: string;
}

export interface WorkflowStep {
  step: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface WorkflowResult {
  documents_analyzed: string[];
  issues: Discrepancy[];
  summary: string;
  extraction_failures: string[];
  model_version: string;
  report_markdown?: string;
}

export interface WorkflowRun {
  workflow_id: string;
  case_id: string;
  status: WorkflowStatus;
  progress_percent: number;
  current_step: string;
  steps: WorkflowStep[];
  result?: WorkflowResult;
  report_markdown?: string;
  requires_review?: boolean;
  errors?: string[];
  started_at: string;
  completed_at?: string;
}

export interface CaseItem {
  case_id: string;
  name: string;
  readiness: CaseReadiness;
  document_count: number;
  document_types: DocumentType[];
  missing_document_types: DocumentType[];
  open_review_count: number;
  documents?: CaseDocument[];
  latest_workflow?: WorkflowRun;
  created_at: string;
  updated_at: string;
}

export interface ReviewFinding {
  review_id: string;
  case_id: string;
  workflow_id: string;
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
  page_number?: number;
  section?: string;
  text: string;
  score: number;
}

export interface QueryCitation {
  filename: string;
  page_number?: number | null;
  section?: string | null;
  evidence: string;
}

export interface QueryResponse {
  answer: string;
  citations: Record<string, QueryCitation>;
  verification: {
    valid: boolean;
    missing_citations?: string[];
  };
  retrieval_mode: 'bm25' | 'dense' | 'hybrid';
  route: string;
  routing_method: string;
  retrieved_count: number;
  context_chars: number;
  latency_ms: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  responseMeta?: {
    citations?: Record<string, QueryCitation>;
    verification?: {
      valid: boolean;
      missing_citations?: string[];
    };
    retrieval_mode?: 'bm25' | 'dense' | 'hybrid';
    route?: string;
    routing_method?: string;
    retrieved_count?: number;
    context_chars?: number;
    latency_ms?: number;
  };
}

export type AuditAction = 
  | 'DOCUMENT_INGESTED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'FINDING_APPROVED'
  | 'FINDING_REJECTED'
  | 'FINDING_RESOLVED'
  | 'FINDING_BATCH_ACTION'
  | 'CASE_CREATED'
  | 'CASE_DELETED'
  | 'REPORT_EXPORTED'
  | 'MANUAL_ATTESTATION';

export interface AuditTrailEntry {
  log_id: string;
  timestamp: string;
  action: AuditAction;
  actor: string;
  case_id?: string;
  case_name?: string;
  entity_type: 'document' | 'workflow' | 'review_finding' | 'case' | 'report' | 'attestation';
  entity_id: string;
  details: string;
  metadata?: Record<string, any>;
  prev_hash: string;
  integrity_hash: string;
}


