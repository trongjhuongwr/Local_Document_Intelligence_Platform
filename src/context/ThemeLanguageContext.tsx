import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'vi';
export type Theme = 'light' | 'dark';

export interface Translations {
  common: {
    appName: string;
    tagline: string;
    version: string;
    statusReady: string;
    statusOffline: string;
    operational: string;
    active: string;
    searchPlaceholder: string;
    searchShortcut: string;
    close: string;
    cancel: string;
    confirm: string;
    save: string;
    refresh: string;
    delete: string;
    edit: string;
    view: string;
    copy: string;
    copied: string;
    download: string;
    export: string;
    print: string;
    loading: string;
    total: string;
    items: string;
    documents: string;
    findings: string;
    issues: string;
    severityHigh: string;
    severityMedium: string;
    severityLow: string;
    statusApproved: string;
    statusRejected: string;
    statusPending: string;
    statusNeedsReview: string;
    statusDraft: string;
    switchTheme: string;
    switchLanguage: string;
    lightTheme: string;
    darkTheme: string;
    english: string;
    vietnamese: string;
  };
  nav: {
    workspace: string;
    auditingSuite: string;
    home: string;
    cases: string;
    reviews: string;
    auditTrail: string;
    ask: string;
    evaluation: string;
    accountAndSettings: string;
    leadAuditor: string;
    enterpriseAdmin: string;
    engineDiagnostics: string;
    engineDiagnosticsDesc: string;
    rulesAndCurrency: string;
    rulesAndCurrencyDesc: string;
    themeToggle: string;
    refreshDemoCases: string;
    signOut: string;
    collapseSidebar: string;
    expandSidebar: string;
  };
  home: {
    welcomeTitle: string;
    welcomeSubtitle: string;
    heroBadge: string;
    ctaNewCase: string;
    ctaLoadSample: string;
    loadingSample: string;
    statReadinessTitle: string;
    statReadinessDesc: string;
    statComplianceTitle: string;
    statComplianceDesc: string;
    statFindingsTitle: string;
    statFindingsDesc: string;
    statCasesTitle: string;
    statCasesDesc: string;
    openFindingsAction: string;
    recentCasesTitle: string;
    viewAllCases: string;
    noCasesTitle: string;
    noCasesDesc: string;
    tableColCaseName: string;
    tableColStatus: string;
    tableColDocs: string;
    tableColFindings: string;
    tableColLastUpdated: string;
    tableColActions: string;
    actionOpen: string;
    actionRunAudit: string;
    actionReview: string;
  };
  cases: {
    title: string;
    subtitle: string;
    newCaseBtn: string;
    newCase: string;
    case: string;
    contract: string;
    invoice: string;
    purchaseOrder: string;
    paymentPolicy: string;
    searchPlaceholder: string;
    filterAll: string;
    filterReady: string;
    filterNeedsReview: string;
    filterDraft: string;
    noCasesFound: string;
    createFirstCase: string;
    detailTitle: string;
    caseIdLabel: string;
    createdLabel: string;
    updatedLabel: string;
    documentsTab: string;
    discrepanciesTab: string;
    runDeepAuditBtn: string;
    runningAuditBtn: string;
    exportDossierBtn: string;
    downloadMarkdownBtn: string;
    uploadAreaTitle: string;
    uploadAreaDesc: string;
    browseFilesBtn: string;
    selectedFilesTitle: string;
    autoDetectedConfidence: string;
    clearSelectedFiles: string;
    uploadFilesBtn: string;
    docTypeContract: string;
    docTypeInvoice: string;
    docTypePO: string;
    docTypePolicy: string;
    docTypeOther: string;
    quickPeekTitle: string;
    sha256Hash: string;
    copyHash: string;
    formulaLabel: string;
    evidenceSources: string;
    deleteCaseBtn: string;
    confirmDeletePrompt: string;
    newCaseModalTitle: string;
    caseNameInputPlaceholder: string;
    createAndUploadBtn: string;
  };
  reviews: {
    title: string;
    subtitle: string;
    filterCaseLabel: string;
    allCasesOption: string;
    filterSeverityLabel: string;
    allSeverities: string;
    filterStatusLabel: string;
    allStatuses: string;
    batchSelectedCount: string;
    batchApproveBtn: string;
    batchRejectBtn: string;
    batchClearSelection: string;
    batchNotePlaceholder: string;
    batchApplyNote: string;
    quickPresetsTitle: string;
    presetContractVariance: string;
    presetReissueInvoice: string;
    presetFxTolerance: string;
    presetMilestoneMet: string;
    presetAcceptedRisk: string;
    splitViewerBtn: string;
    exportCsvBtn: string;
    findingCardHeader: string;
    formulaSection: string;
    evidenceSection: string;
    auditorNotesLabel: string;
    auditorNotesPlaceholder: string;
    approveBtn: string;
    rejectBtn: string;
    saveNoteBtn: string;
    noFindingsTitle: string;
    noFindingsDesc: string;
  };
  ask: {
    title: string;
    subtitle: string;
    copilotTitle: string;
    copilotDesc: string;
    scopeToggleLabel: string;
    scopeAllCases: string;
    scopeCurrentCase: string;
    scope: string;
    allCasesScope: string;
    engine: string;
    activeFiles: string;
    smartPromptsTitle: string;
    heroQuestion: string;
    heroSubtitle: string;
    askThis: string;
    groundedBadge: string;
    unverifiedWarning: string;
    groundedCitations: string;
    filesLoadedCount: string;
    promptRateCap: string;
    promptRateCapDesc: string;
    promptArithmeticTax: string;
    promptArithmeticTaxDesc: string;
    promptExecutiveDossier: string;
    promptExecutiveDossierDesc: string;
    categoryCompliance: string;
    categoryFinancial: string;
    categoryDelivery: string;
    inputPlaceholder: string;
    sendBtn: string;
    evidenceInspector: string;
    evidenceInspectorTitle: string;
    evidenceInspectorDesc: string;
    extractedEvidence: string;
    extractedDocumentText: string;
    copyQuote: string;
    compareSplitBtn: string;
    openInSplitViewer: string;
    copyBtn: string;
    copyAnswerBtn: string;
    saveNoteBtn: string;
    detailsBtn: string;
    exportBtn: string;
    clearBtn: string;
    discrepancyBadge: string;
    clearChatBtn: string;
    noChatTitle: string;
    noChatDesc: string;
    analyzingDocs: string;
    suggestedFollowUp: string;
    disclaimer: string;
  };
  audit: {
    title: string;
    subtitle: string;
    recordSignOff: string;
    cryptoIntegrity: string;
    chainValid: string;
    chainInvalid: string;
    totalEvents: string;
    complianceStandard: string;
    action: string;
    actor: string;
    allActions: string;
    noEvents: string;
  };
  auditTrail: {
    title: string;
    subtitle: string;
    cryptoVerifiedBadge: string;
    chainIntegrityDesc: string;
    signAttestationBtn: string;
    downloadLedgerCsv: string;
    exportReportMd: string;
    filterActorLabel: string;
    allActors: string;
    filterActionLabel: string;
    allActions: string;
    searchEventsPlaceholder: string;
    tableColTimestamp: string;
    tableColActor: string;
    tableColAction: string;
    tableColCaseName: string;
    tableColEntryHash: string;
    tableColPrevHash: string;
    tableColDetails: string;
    attestationModalTitle: string;
    attestationModalDesc: string;
    auditorNameLabel: string;
    signaturePasscodeLabel: string;
    complianceStandardLabel: string;
    attestationNotesLabel: string;
    certifyAndSealBtn: string;
  };
  evaluation: {
    title: string;
    subtitle: string;
    runSuiteBtn: string;
    runningSuiteBtn: string;
    metricRetrievalRecall: string;
    metricMRR: string;
    metricAvgLatency: string;
    metricDeterministicAccuracy: string;
    confusionMatrixTitle: string;
    testCasesTitle: string;
    searchQueriesTitle: string;
  };
  splitViewer: {
    title: string;
    subtitle: string;
    findingCounter: string;
    prevFinding: string;
    nextFinding: string;
    leftDocumentLabel: string;
    rightDocumentLabel: string;
    evidenceHighlightLabel: string;
    formulaReconciliation: string;
    closeBtn: string;
    shortcutHint: string;
  };
}

const enTranslations: Translations = {
  common: {
    appName: 'Doc Intelligence',
    tagline: 'Enterprise Multi-Document Audit & Integrity Platform',
    version: 'v1.4 Enterprise',
    statusReady: 'Operational',
    statusOffline: 'Offline / Degraded',
    operational: 'Operational',
    active: 'Active',
    searchPlaceholder: 'Search cases, documents, findings...',
    searchShortcut: '⌘K / Ctrl+K',
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    refresh: 'Refresh',
    delete: 'Delete',
    edit: 'Edit',
    view: 'View',
    copy: 'Copy',
    copied: 'Copied!',
    download: 'Download',
    export: 'Export',
    print: 'Print Dossier',
    loading: 'Loading...',
    total: 'Total',
    items: 'items',
    documents: 'Documents',
    findings: 'Findings',
    issues: 'Discrepancies',
    severityHigh: 'High Severity',
    severityMedium: 'Medium Severity',
    severityLow: 'Low Severity',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    statusPending: 'Pending Review',
    statusNeedsReview: 'Needs Review',
    statusDraft: 'Draft Pack',
    switchTheme: 'Toggle Theme',
    switchLanguage: 'Change Language',
    lightTheme: 'Light Theme',
    darkTheme: 'Dark Theme',
    english: 'English (US)',
    vietnamese: 'Tiếng Việt (VN)',
  },
  nav: {
    workspace: 'Workspace',
    auditingSuite: 'Auditing Suite',
    home: 'Home Overview',
    cases: 'Cases & Packs',
    reviews: 'Review Findings',
    auditTrail: 'Audit Trail & Ledger',
    ask: 'Ask Documents',
    evaluation: 'Benchmark & Eval',
    accountAndSettings: 'Auditor Settings',
    leadAuditor: 'Lead Auditor',
    enterpriseAdmin: 'Enterprise Admin',
    engineDiagnostics: 'Audit Engine & AI Setup',
    engineDiagnosticsDesc: 'Live Gemini parameters & deterministic rules',
    rulesAndCurrency: 'Audit Rules & Sensitivity',
    rulesAndCurrencyDesc: 'Configure tolerance limits & currency format',
    themeToggle: 'Appearance',
    refreshDemoCases: 'Refresh Demo Cases',
    signOut: 'Sign Out Session',
    collapseSidebar: 'Collapse Sidebar (Ctrl+B)',
    expandSidebar: 'Expand Sidebar (Ctrl+B)',
  },
  home: {
    welcomeTitle: 'Document Intelligence Hub',
    welcomeSubtitle: 'Multi-document verification, deterministic reconciliation, and immutable audit logs.',
    heroBadge: 'SOX-404 / ISO-27001 Certified Audit Engine',
    ctaNewCase: 'New Audit Pack',
    ctaLoadSample: 'Load Sample Case',
    loadingSample: 'Synthesizing Documents...',
    statReadinessTitle: 'Pack Readiness',
    statReadinessDesc: 'Cross-document verification completeness',
    statComplianceTitle: 'Clean Compliance Rate',
    statComplianceDesc: 'Packs passing all financial constraints',
    statFindingsTitle: 'Open Discrepancies',
    statFindingsDesc: 'Variance items requiring auditor sign-off',
    statCasesTitle: 'Active Audit Packs',
    statCasesDesc: 'Total managed cases in workspace',
    openFindingsAction: 'Review Open Findings',
    recentCasesTitle: 'Recent Audit Packs',
    viewAllCases: 'View All Cases',
    noCasesTitle: 'No Audit Cases Yet',
    noCasesDesc: 'Create a new audit pack or load the enterprise sample package to get started.',
    tableColCaseName: 'Case / Pack Name',
    tableColStatus: 'Readiness Status',
    tableColDocs: 'Docs',
    tableColFindings: 'Discrepancies',
    tableColLastUpdated: 'Last Verification',
    tableColActions: 'Actions',
    actionOpen: 'Open Pack',
    actionRunAudit: 'Run Audit',
    actionReview: 'Review Findings',
  },
  cases: {
    title: 'Audit Cases & Evidence Packs',
    subtitle: 'Upload contracts, invoices, and purchase orders for cross-document reconciliation.',
    newCaseBtn: 'Create Case',
    newCase: 'Create Case',
    case: 'Case',
    contract: 'Contract',
    invoice: 'Invoice',
    purchaseOrder: 'Purchase Order',
    paymentPolicy: 'Payment Policy',
    searchPlaceholder: 'Search cases by title or ID...',
    filterAll: 'All Cases',
    filterReady: 'Audit Ready',
    filterNeedsReview: 'Needs Review',
    filterDraft: 'Draft',
    noCasesFound: 'No matching audit cases found.',
    createFirstCase: 'Create your first audit case',
    detailTitle: 'Audit Pack Details',
    caseIdLabel: 'Case ID',
    createdLabel: 'Created',
    updatedLabel: 'Last Updated',
    documentsTab: 'Uploaded Evidence Documents',
    discrepanciesTab: 'Audit Discrepancies & Reconciliation',
    runDeepAuditBtn: 'Run Full Deep Audit',
    runningAuditBtn: 'Running Multi-Doc Verification...',
    exportDossierBtn: 'Export Official Dossier (PDF/Print)',
    downloadMarkdownBtn: 'Download Summary (MD)',
    uploadAreaTitle: 'Upload Evidence Documents',
    uploadAreaDesc: 'Drag & drop contracts, invoices, POs, or policies (PDF, TXT, MD, CSV)',
    browseFilesBtn: 'Browse Local Files',
    selectedFilesTitle: 'Selected Files & Auto-Type Detection',
    autoDetectedConfidence: 'Confidence Auto-Detected',
    clearSelectedFiles: 'Clear Selection',
    uploadFilesBtn: 'Upload & Ingest Documents',
    docTypeContract: 'Contract',
    docTypeInvoice: 'Invoice',
    docTypePO: 'Purchase Order',
    docTypePolicy: 'Payment Policy',
    docTypeOther: 'Other Document',
    quickPeekTitle: 'Document Quick Peek & Extracted Fields',
    sha256Hash: 'SHA-256 Hash',
    copyHash: 'Copy SHA-256',
    formulaLabel: 'Mathematical Formula',
    evidenceSources: 'Direct Evidence Sources',
    deleteCaseBtn: 'Delete Case Pack',
    confirmDeletePrompt: 'Are you sure you want to permanently delete this audit pack?',
    newCaseModalTitle: 'Create New Audit Pack',
    caseNameInputPlaceholder: 'e.g. Acme Corp Q3 Infrastructure Audit',
    createAndUploadBtn: 'Create Pack',
  },
  reviews: {
    title: 'Auditor Review & Discrepancy Findings',
    subtitle: 'Review mathematical variances, approve contract adjustments, or reject non-compliant billings.',
    filterCaseLabel: 'Filter by Case Pack:',
    allCasesOption: 'All Active Cases',
    filterSeverityLabel: 'Severity:',
    allSeverities: 'All Severities',
    filterStatusLabel: 'Review Status:',
    allStatuses: 'All Review States',
    batchSelectedCount: 'selected findings',
    batchApproveBtn: 'Batch Approve',
    batchRejectBtn: 'Batch Reject',
    batchClearSelection: 'Clear Selection',
    batchNotePlaceholder: 'Add batch auditor rationale note...',
    batchApplyNote: 'Apply Note',
    quickPresetsTitle: 'Auditor Rationale Presets',
    presetContractVariance: 'Contract amendment agreed by legal',
    presetReissueInvoice: 'Re-issue invoice requested from vendor',
    presetFxTolerance: 'Acceptable FX exchange rate variance (<0.2%)',
    presetMilestoneMet: 'Performance milestone confirmed by project lead',
    presetAcceptedRisk: 'Minor variance within CFO discretionary limit',
    splitViewerBtn: 'Launch Split Viewer',
    exportCsvBtn: 'Export Findings (CSV)',
    findingCardHeader: 'Discrepancy Finding',
    formulaSection: 'Calculated Variance Formula',
    evidenceSection: 'Supporting Evidence Passages',
    auditorNotesLabel: 'Auditor Review Notes & Justification',
    auditorNotesPlaceholder: 'Enter professional audit rationale for this finding...',
    approveBtn: 'Approve Finding',
    rejectBtn: 'Reject / Flag Discrepancy',
    saveNoteBtn: 'Save Notes',
    noFindingsTitle: 'No Findings Match Criteria',
    noFindingsDesc: 'All items have been reviewed or no discrepancies match your filter filters.',
  },
  ask: {
    title: 'Ask Documents & Grounded AI Inquirer',
    subtitle: 'Perform natural language questions strictly grounded in uploaded evidence documents.',
    copilotTitle: 'Ask Documents & Grounded AI Inquirer',
    copilotDesc: 'Grounded multi-document Q&A with 100% cryptographic citation backing.',
    scopeToggleLabel: 'Inquiry Scope:',
    scopeAllCases: 'All Active Cases (Global Workspace)',
    scopeCurrentCase: 'Selected Case Only',
    scope: 'Scope',
    allCasesScope: 'All Active Cases (Global Workspace)',
    engine: 'Retrieval Engine',
    activeFiles: 'Active Files',
    smartPromptsTitle: 'Smart Audit Queries for this Case',
    heroQuestion: 'What would you like to verify across your audit packs?',
    heroSubtitle: 'Enter a custom question or select a smart prompt below to cross-examine contracts, invoices, and POs.',
    askThis: 'Ask this',
    groundedBadge: 'Grounded & Verified',
    unverifiedWarning: 'Unverified Citation Match',
    groundedCitations: 'Grounded Evidence Citations',
    filesLoadedCount: 'files loaded in memory',
    promptRateCap: 'Rate & Cap Verification',
    promptRateCapDesc: 'Compare billed hourly rates against Master Agreement caps',
    promptArithmeticTax: 'Arithmetic & Tax Check',
    promptArithmeticTaxDesc: 'Verify line items, VAT calculation, and subtotal math',
    promptExecutiveDossier: 'Executive Summary Dossier',
    promptExecutiveDossierDesc: 'Extract key obligations, milestones, and deliverables',
    categoryCompliance: 'Compliance & Governance',
    categoryFinancial: 'Financial Reconciliation',
    categoryDelivery: 'SLA & Milestones',
    inputPlaceholder: 'Ask any question across contracts, invoices, POs, or policies...',
    sendBtn: 'Query Engine',
    evidenceInspector: 'Evidence Inspector',
    evidenceInspectorTitle: 'Evidence Inspector & Snippet Grounding',
    evidenceInspectorDesc: 'Direct verbatim excerpts cited by the grounding engine.',
    extractedEvidence: 'Extracted Evidence',
    extractedDocumentText: 'Extracted Document Text',
    copyQuote: 'Copy Quote',
    compareSplitBtn: 'Compare in Split Viewer',
    openInSplitViewer: 'Inspect in Split Viewer',
    copyBtn: 'Copy',
    copyAnswerBtn: 'Copy Answer',
    saveNoteBtn: 'Save Note',
    detailsBtn: 'Details',
    exportBtn: 'Export Transcript',
    clearBtn: 'Clear Conversation',
    discrepancyBadge: 'Discrepancy Detected',
    clearChatBtn: 'Clear Conversation',
    noChatTitle: 'Ask Anything About Your Documents',
    noChatDesc: 'Type a question or click a smart audit prompt above to run grounded multi-doc analysis.',
    analyzingDocs: 'Analyzing documents & verifying citations...',
    suggestedFollowUp: 'Suggested Follow-Up',
    disclaimer: 'Deterministic audit with 100% citation grounding and cryptographic integrity.',
  },
  audit: {
    title: 'Audit Trail & Compliance Ledger',
    subtitle: 'Cryptographically hashed event ledger ensuring complete non-repudiation and SOX 404 compliance.',
    recordSignOff: 'Record Sign-Off',
    cryptoIntegrity: 'Crypto Integrity',
    chainValid: 'Hash Chain Intact',
    chainInvalid: 'Chain Tampering Detected',
    totalEvents: 'Total Events',
    complianceStandard: 'Compliance Standard',
    action: 'Action',
    actor: 'Actor',
    allActions: 'All Actions',
    noEvents: 'No Audit Trail Events Found',
  },
  auditTrail: {
    title: 'Cryptographic Audit Trail & Ledger',
    subtitle: 'Immutable SHA-256 hash-chained event logs ensuring non-repudiation and SOX compliance.',
    cryptoVerifiedBadge: 'Cryptographic Ledger Verified (100% Chain Integrity)',
    chainIntegrityDesc: 'All blocks verified from Genesis to latest block. Zero tampering detected.',
    signAttestationBtn: 'Sign Formal Attestation',
    downloadLedgerCsv: 'Export Ledger (CSV)',
    exportReportMd: 'Export Log Report (MD)',
    filterActorLabel: 'Actor:',
    allActors: 'All Actors',
    filterActionLabel: 'Action Type:',
    allActions: 'All Actions',
    searchEventsPlaceholder: 'Search event details or hashes...',
    tableColTimestamp: 'Timestamp (UTC)',
    tableColActor: 'Actor & Role',
    tableColAction: 'Action Taken',
    tableColCaseName: 'Case / Target',
    tableColEntryHash: 'Entry SHA-256 Hash',
    tableColPrevHash: 'Previous Block Hash',
    tableColDetails: 'Event Details',
    attestationModalTitle: 'Sign Official Compliance Attestation',
    attestationModalDesc: 'Issue a legally binding cryptographic seal on current audit findings.',
    auditorNameLabel: 'Certifying Auditor Name',
    signaturePasscodeLabel: 'Auditor Digital Passcode',
    complianceStandardLabel: 'Compliance Framework',
    attestationNotesLabel: 'Executive Certification Statement',
    certifyAndSealBtn: 'Cryptographically Sign & Certify',
  },
  evaluation: {
    title: 'DocFlowBench Evaluation & Metrics',
    subtitle: 'Standardized quantitative benchmark measuring precision, recall, and zero-hallucination accuracy.',
    runSuiteBtn: 'Run Full Evaluation Benchmark',
    runningSuiteBtn: 'Executing 120 DocFlowBench Queries...',
    metricRetrievalRecall: 'Retrieval Recall@5',
    metricMRR: 'Mean Reciprocal Rank (MRR)',
    metricAvgLatency: 'Average Engine Latency',
    metricDeterministicAccuracy: 'Deterministic Verification Accuracy',
    confusionMatrixTitle: 'Confusion Matrix (Discrepancy Detection)',
    testCasesTitle: 'Synthetic Stress-Test Cases',
    searchQueriesTitle: 'Benchmark Grounding Test Queries',
  },
  splitViewer: {
    title: 'Multi-Document Split Screen Comparator',
    subtitle: 'Side-by-side evidence inspection with real-time text highlight and discrepancy formulas.',
    findingCounter: 'Finding',
    prevFinding: 'Previous Finding (J / ←)',
    nextFinding: 'Next Finding (K / →)',
    leftDocumentLabel: 'Primary Document (Contract / PO)',
    rightDocumentLabel: 'Comparison Document (Invoice / Policy)',
    evidenceHighlightLabel: 'Cited Evidence Passage',
    formulaReconciliation: 'Mathematical Reconciliation Difference',
    closeBtn: 'Close Viewer (Esc)',
    shortcutHint: 'Use Arrow Keys [←] [→] to cycle findings, [Esc] to exit',
  },
};

const viTranslations: Translations = {
  common: {
    appName: 'Doc Intelligence',
    tagline: 'Nền tảng Đối soát Hồ sơ Đa chứng từ & Kiểm toán Toàn vẹn',
    version: 'v1.4 Chuẩn Doanh nghiệp',
    statusReady: 'Sẵn sàng / Hoạt động',
    statusOffline: 'Ngoại tuyến / Gián đoạn',
    operational: 'Đang hoạt động',
    active: 'Đang mở',
    searchPlaceholder: 'Tìm kiếm hồ sơ, chứng từ, sai lệch đối chiếu...',
    searchShortcut: '⌘K / Ctrl+K',
    close: 'Đóng',
    cancel: 'Hủy bỏ',
    confirm: 'Xác nhận',
    save: 'Lưu thay đổi',
    refresh: 'Làm mới',
    delete: 'Xóa',
    edit: 'Chỉnh sửa',
    view: 'Xem chi tiết',
    copy: 'Sao chép',
    copied: 'Đã sao chép!',
    download: 'Tải về',
    export: 'Xuất dữ liệu',
    print: 'In Hồ sơ Kiểm toán',
    loading: 'Đang xử lý...',
    total: 'Tổng cộng',
    items: 'mục',
    documents: 'Chứng từ gốc',
    findings: 'Phát hiện kiểm toán',
    issues: 'Sai lệch đối soát',
    severityHigh: 'Mức độ Nghiêm trọng Cao',
    severityMedium: 'Mức độ Trung bình',
    severityLow: 'Mức độ Thấp / Nhỏ',
    statusApproved: 'Đã phê duyệt',
    statusRejected: 'Từ chối / Bác bỏ',
    statusPending: 'Chờ thẩm định',
    statusNeedsReview: 'Cần thẩm định',
    statusDraft: 'Hồ sơ nháp',
    switchTheme: 'Đổi giao diện Sáng / Tối',
    switchLanguage: 'Chuyển đổi ngôn ngữ',
    lightTheme: 'Chế độ Sáng',
    darkTheme: 'Chế độ Tối',
    english: 'English (US)',
    vietnamese: 'Tiếng Việt (VN)',
  },
  nav: {
    workspace: 'Không gian Làm việc',
    auditingSuite: 'Bộ công cụ Kiểm toán',
    home: 'Tổng quan & Chỉ số',
    cases: 'Hồ sơ & Gói Chứng từ',
    reviews: 'Thẩm định Sai lệch',
    auditTrail: 'Sổ cái & Nhật ký Bất biến',
    ask: 'Truy vấn Trợ lý AI',
    evaluation: 'Đo kiểm DocFlowBench',
    accountAndSettings: 'Cài đặt Kiểm toán viên',
    leadAuditor: 'Kiểm toán viên Trưởng',
    enterpriseAdmin: 'Quản trị viên Doanh nghiệp',
    engineDiagnostics: 'Thông số & Quy tắc AI',
    engineDiagnosticsDesc: 'Tham số Gemini & 12 bộ quy tắc xác định',
    rulesAndCurrency: 'Quy tắc & Tiền tệ Báo cáo',
    rulesAndCurrencyDesc: 'Thiết lập độ nhạy kiểm toán & loại tiền tệ',
    themeToggle: 'Giao diện hiển thị',
    refreshDemoCases: 'Tạo lại Hồ sơ Mẫu',
    signOut: 'Đăng xuất Phiên làm việc',
    collapseSidebar: 'Thu gọn thanh bên (Ctrl+B)',
    expandSidebar: 'Mở rộng thanh bên (Ctrl+B)',
  },
  home: {
    welcomeTitle: 'Trung tâm Kiểm toán & Đối soát Chứng từ',
    welcomeSubtitle: 'Đối soát chéo đa tài liệu, tính toán bất biến và lưu vết chuỗi khối chuẩn SOX-404 / ISO-27001.',
    heroBadge: 'Động cơ Đối soát Đạt chuẩn SOX-404 / ISO-27001',
    ctaNewCase: 'Tạo Hồ sơ Mới',
    ctaLoadSample: 'Tải Hồ sơ Mẫu',
    loadingSample: 'Đang tổng hợp chứng từ mẫu...',
    statReadinessTitle: 'Mức độ Hoàn thiện Hồ sơ',
    statReadinessDesc: 'Tỷ lệ sẵn sàng kiểm toán của toàn bộ gói chứng từ',
    statComplianceTitle: 'Tỷ lệ Chứng từ Hợp lệ Tuyệt đối',
    statComplianceDesc: 'Tỷ lệ hồ sơ vượt qua toàn bộ ràng buộc tài chính',
    statFindingsTitle: 'Sai lệch Cần Thẩm định',
    statFindingsDesc: 'Số lượng phát hiện chênh lệch chờ kiểm toán viên ký duyệt',
    statCasesTitle: 'Tổng số Hồ sơ Đang xử lý',
    statCasesDesc: 'Số gói chứng từ đang quản lý trong hệ thống',
    openFindingsAction: 'Xử lý Phát hiện Kiểm toán',
    recentCasesTitle: 'Hồ sơ Chứng từ Gần đây',
    viewAllCases: 'Xem Toàn bộ Hồ sơ',
    noCasesTitle: 'Chưa có Hồ sơ Kiểm toán',
    noCasesDesc: 'Hãy tạo mới một gói hồ sơ hoặc nhấn Tải Hồ sơ Mẫu để bắt đầu trải nghiệm.',
    tableColCaseName: 'Tên Hồ sơ / Gói Chứng từ',
    tableColStatus: 'Tình trạng Hoàn thiện',
    tableColDocs: 'Tài liệu',
    tableColFindings: 'Sai lệch',
    tableColLastUpdated: 'Thời gian Xác thực',
    tableColActions: 'Thao tác',
    actionOpen: 'Mở hồ sơ',
    actionRunAudit: 'Chạy đối soát',
    actionReview: 'Thẩm định phát hiện',
  },
  cases: {
    title: 'Quản lý Hồ sơ & Chứng từ Đối soát',
    subtitle: 'Tải lên hợp đồng, hóa đơn và đơn đặt hàng (PO) để đối soát chéo giá trị pháp lý và tính toán số học.',
    newCaseBtn: 'Tạo Hồ sơ',
    newCase: 'Tạo Hồ sơ',
    case: 'Hồ sơ',
    contract: 'Hợp đồng',
    invoice: 'Hóa đơn',
    purchaseOrder: 'Đơn đặt hàng (PO)',
    paymentPolicy: 'Chính sách thanh toán',
    searchPlaceholder: 'Tìm kiếm hồ sơ theo tên hoặc mã định danh...',
    filterAll: 'Toàn bộ hồ sơ',
    filterReady: 'Đã hoàn thiện',
    filterNeedsReview: 'Cần thẩm định',
    filterDraft: 'Hồ sơ nháp',
    noCasesFound: 'Không tìm thấy hồ sơ kiểm toán phù hợp.',
    createFirstCase: 'Tạo hồ sơ kiểm toán đầu tiên của bạn',
    detailTitle: 'Chi tiết Gói Hồ sơ Chứng từ',
    caseIdLabel: 'Mã Hồ sơ',
    createdLabel: 'Ngày tạo',
    updatedLabel: 'Cập nhật lần cuối',
    documentsTab: 'Danh sách Chứng từ Gốc',
    discrepanciesTab: 'Sai lệch Đối chiếu & Kết quả Số học',
    runDeepAuditBtn: 'Chạy Đối soát Toàn diện',
    runningAuditBtn: 'Đang phân tích đa chứng từ...',
    exportDossierBtn: 'Xuất Hồ sơ Kiểm toán (PDF/In)',
    downloadMarkdownBtn: 'Tải Báo cáo Tổng hợp (MD)',
    uploadAreaTitle: 'Tải lên Chứng từ Cần Đối soát',
    uploadAreaDesc: 'Kéo thả hợp đồng, hóa đơn VAT, đơn đặt hàng PO hoặc chính sách (PDF, TXT, MD, CSV)',
    browseFilesBtn: 'Chọn tệp từ máy tính',
    selectedFilesTitle: 'Tệp đã chọn & Tự động Nhận diện Loại',
    autoDetectedConfidence: 'Độ tin cậy Nhận diện',
    clearSelectedFiles: 'Hủy chọn tất cả',
    uploadFilesBtn: 'Tải lên & Tiếp nhận Chứng từ',
    docTypeContract: 'Hợp đồng / Thỏa thuận',
    docTypeInvoice: 'Hóa đơn VAT / Bảng kê',
    docTypePO: 'Đơn đặt hàng (PO)',
    docTypePolicy: 'Chính sách Thanh toán',
    docTypeOther: 'Tài liệu Khác',
    quickPeekTitle: 'Xem nhanh Văn bản & Trường Dữ liệu Trích xuất',
    sha256Hash: 'Mã băm SHA-256',
    copyHash: 'Sao chép mã SHA-256',
    formulaLabel: 'Công thức Đối soát Số học',
    evidenceSources: 'Căn cứ Trích dẫn Trực tiếp',
    deleteCaseBtn: 'Xóa Gói Hồ sơ',
    confirmDeletePrompt: 'Bạn có chắc chắn muốn xóa vĩnh viễn gói hồ sơ kiểm toán này không?',
    newCaseModalTitle: 'Tạo Gói Hồ sơ Kiểm toán Mới',
    caseNameInputPlaceholder: 'Ví dụ: Đối soát Hợp đồng Cơ sở Hạ tầng Quý 3 Acme Corp',
    createAndUploadBtn: 'Tạo Hồ sơ',
  },
  reviews: {
    title: 'Thẩm định & Phê duyệt Sai lệch Kiểm toán',
    subtitle: 'Xem xét các chênh lệch số học, phê duyệt điều chỉnh theo hợp đồng hoặc từ chối thanh toán sai quy định.',
    filterCaseLabel: 'Lọc theo Hồ sơ:',
    allCasesOption: 'Toàn bộ hồ sơ đang mở',
    filterSeverityLabel: 'Mức độ nghiêm trọng:',
    allSeverities: 'Tất cả mức độ',
    filterStatusLabel: 'Trạng thái thẩm định:',
    allStatuses: 'Tất cả trạng thái',
    batchSelectedCount: 'sai lệch đang chọn',
    batchApproveBtn: 'Phê duyệt Hàng loạt',
    batchRejectBtn: 'Từ chối Hàng loạt',
    batchClearSelection: 'Bỏ chọn',
    batchNotePlaceholder: 'Nhập ghi chú lý do kiểm toán hàng loạt...',
    batchApplyNote: 'Áp dụng Ghi chú',
    quickPresetsTitle: 'Mẫu Ghi chú Kiểm toán Nhanh',
    presetContractVariance: 'Phụ lục hợp đồng đã được phòng Pháp chế chấp thuận',
    presetReissueInvoice: 'Yêu cầu nhà cung cấp hủy và xuất lại hóa đơn VAT mới',
    presetFxTolerance: 'Chênh lệch tỷ giá quy đổi nằm trong ngưỡng cho phép (<0.2%)',
    presetMilestoneMet: 'Trưởng ban dự án đã nghiệm thu giai đoạn hoàn thành',
    presetAcceptedRisk: 'Sai lệch nhỏ nằm trong hạn mức phê duyệt của Giám đốc Tài chính',
    splitViewerBtn: 'Mở Bộ So sánh Đối chiếu',
    exportCsvBtn: 'Xuất Bảng Sai lệch (CSV)',
    findingCardHeader: 'Phát hiện Sai lệch Đối chiếu',
    formulaSection: 'Công thức Tính toán Chênh lệch',
    evidenceSection: 'Đoạn Văn bản Bằng chứng Gốc',
    auditorNotesLabel: 'Ghi chú & Lý lẽ của Kiểm toán viên',
    auditorNotesPlaceholder: 'Nhập lý lẽ nghiệp vụ kế toán/kiểm toán cho phát hiện này...',
    approveBtn: 'Phê duyệt Phát hiện',
    rejectBtn: 'Bác bỏ / Đánh dấu Vi phạm',
    saveNoteBtn: 'Lưu Ghi chú',
    noFindingsTitle: 'Không có Phát hiện Phù hợp',
    noFindingsDesc: 'Tất cả sai lệch đã được xử lý hoặc không có phát hiện nào khớp với bộ lọc.',
  },
  ask: {
    title: 'Trợ lý AI Truy vấn Chứng từ Gốc',
    subtitle: 'Đặt câu hỏi bằng ngôn ngữ tự nhiên, câu trả lời dựa 100% trên các trích dẫn chứng cứ thực tế.',
    copilotTitle: 'Trợ lý AI Truy vấn Chứng từ Gốc',
    copilotDesc: 'Hỏi đáp đa tài liệu với trích dẫn chứng cứ bảo đảm độ chính xác tuyệt đối 100%.',
    scopeToggleLabel: 'Phạm vi Truy vấn:',
    scopeAllCases: 'Toàn bộ Hồ sơ (Toàn hệ thống)',
    scopeCurrentCase: 'Chỉ trong Hồ sơ Đang chọn',
    scope: 'Phạm vi',
    allCasesScope: 'Toàn bộ Hồ sơ (Toàn hệ thống)',
    engine: 'Động cơ Truy xuất',
    activeFiles: 'Tài liệu Đang nạp',
    smartPromptsTitle: 'Câu hỏi Kiểm toán Gợi ý theo Hồ sơ',
    heroQuestion: 'Bạn muốn kiểm tra hoặc đối soát vấn đề gì trong hồ sơ?',
    heroSubtitle: 'Nhập câu hỏi bằng ngôn ngữ tự nhiên hoặc chọn các câu hỏi gợi ý bên dưới để đối chiếu chéo các chứng từ.',
    askThis: 'Hỏi ngay',
    groundedBadge: 'Đã Xác thực Căn cứ Gốc',
    unverifiedWarning: 'Cần Đối chiếu Lại Trích dẫn',
    groundedCitations: 'Trích dẫn Chứng cứ Cụ thể',
    filesLoadedCount: 'tài liệu đã nạp vào bộ nhớ',
    promptRateCap: 'Đối soát Đơn giá & Hạn mức',
    promptRateCapDesc: 'So sánh đơn giá giờ và hạn mức thanh toán tối đa theo Hợp đồng khung',
    promptArithmeticTax: 'Kiểm tra Số học & Thuế VAT',
    promptArithmeticTaxDesc: 'Xác minh phép nhân từng dòng, thuế suất VAT và tổng tiền thanh toán',
    promptExecutiveDossier: 'Tóm lược Nghĩa vụ & Mốc Bàn giao',
    promptExecutiveDossierDesc: 'Trích xuất các điều khoản cam kết, mốc tiến độ và thời hạn thanh toán',
    categoryCompliance: 'Tuân thủ & Pháp lý',
    categoryFinancial: 'Đối soát Tài chính & Thuế',
    categoryDelivery: 'Tiến độ & Mốc Nghiệm thu',
    inputPlaceholder: 'Nhập câu hỏi bất kỳ về hợp đồng, hóa đơn, đơn đặt hàng hoặc chính sách...',
    sendBtn: 'Truy vấn AI',
    evidenceInspector: 'Bảng Chứng cứ Gốc',
    evidenceInspectorTitle: 'Bảng Đối soát Chứng cứ Gốc',
    evidenceInspectorDesc: 'Các đoạn văn bản gốc được AI trích xuất làm căn cứ trả lời.',
    extractedEvidence: 'Đoạn Trích Chứng cứ Gốc',
    extractedDocumentText: 'Toàn bộ Văn bản Trích xuất',
    copyQuote: 'Sao chép Đoạn trích',
    compareSplitBtn: 'So sánh trong Bộ Chia màn hình',
    openInSplitViewer: 'Xem trong Bộ So sánh',
    copyBtn: 'Sao chép',
    copyAnswerBtn: 'Sao chép Câu trả lời',
    saveNoteBtn: 'Lưu Ghi chú',
    detailsBtn: 'Chi tiết',
    exportBtn: 'Xuất Hội thoại',
    clearBtn: 'Xóa Đoạn Hội thoại',
    discrepancyBadge: 'Phát hiện Sai lệch',
    clearChatBtn: 'Xóa Đoạn Hội thoại',
    noChatTitle: 'Hỏi Bất kỳ Điều gì Về Chứng từ Của Bạn',
    noChatDesc: 'Nhập câu hỏi hoặc chọn một trong các câu hỏi gợi ý ở trên để tiến hành đối soát thông minh.',
    analyzingDocs: 'Đang phân tích chứng từ & xác thực trích dẫn căn cứ...',
    suggestedFollowUp: 'Gợi ý Câu hỏi Tiếp theo',
    disclaimer: 'Kiểm toán xác định với 100% căn cứ trích dẫn chứng từ và toàn vẹn mã hóa.',
  },
  audit: {
    title: 'Sổ cái Kiểm toán & Bằng chứng Tuân thủ',
    subtitle: 'Nhật ký sự kiện được liên kết chuỗi khối mật mã, đảm bảo tính chống chối bỏ và tuân thủ chuẩn SOX-404.',
    recordSignOff: 'Ký Duyệt Biên bản',
    cryptoIntegrity: 'Toàn vẹn Mã hóa',
    chainValid: 'Chuỗi Khối Nguyên vẹn 100%',
    chainInvalid: 'Phát hiện Sai lệch Chuỗi Khối',
    totalEvents: 'Tổng số Sự kiện',
    complianceStandard: 'Tiêu chuẩn Tuân thủ',
    action: 'Hành động',
    actor: 'Chủ thể',
    allActions: 'Tất cả Thao tác',
    noEvents: 'Không tìm thấy sự kiện kiểm toán nào',
  },
  auditTrail: {
    title: 'Sổ cái Kiểm toán & Mã hóa Bất biến',
    subtitle: 'Nhật ký sự kiện được liên kết chuỗi khối SHA-256, đảm bảo tính chống chối bỏ và tuân thủ chuẩn SOX.',
    cryptoVerifiedBadge: 'Đã Xác thực Chuỗi Khối Toàn vẹn (Khớp 100% Hash)',
    chainIntegrityDesc: 'Tất cả các khối từ Khởi tạo đến Hiện tại đều nguyên vẹn. Không phát hiện dấu hiệu can thiệp.',
    signAttestationBtn: 'Lập Biên bản Ký duyệt',
    downloadLedgerCsv: 'Xuất Sổ cái (CSV)',
    exportReportMd: 'Xuất Báo cáo (MD)',
    filterActorLabel: 'Chủ thể:',
    allActors: 'Tất cả chủ thể',
    filterActionLabel: 'Loại thao tác:',
    allActions: 'Tất cả thao tác',
    searchEventsPlaceholder: 'Tìm kiếm nội dung sự kiện hoặc mã băm...',
    tableColTimestamp: 'Thời gian (UTC)',
    tableColActor: 'Chủ thể & Quyền hạn',
    tableColAction: 'Thao tác Thực hiện',
    tableColCaseName: 'Hồ sơ / Đối tượng',
    tableColEntryHash: 'Mã băm Khối (SHA-256)',
    tableColPrevHash: 'Mã băm Khối Trước',
    tableColDetails: 'Nội dung Chi tiết',
    attestationModalTitle: 'Ký Chứng thư Xác nhận Tuân thủ',
    attestationModalDesc: 'Cấp chứng thư số ràng buộc pháp lý cho kết quả kiểm toán hiện tại.',
    auditorNameLabel: 'Họ tên Kiểm toán viên Ký duyệt',
    signaturePasscodeLabel: 'Mã PIN Chữ ký Số',
    complianceStandardLabel: 'Chuẩn mực Tuân thủ',
    attestationNotesLabel: 'Tuyên bố Chứng nhận của Kiểm toán viên',
    certifyAndSealBtn: 'Ký số & Niêm phong Sổ cái',
  },
  evaluation: {
    title: 'Đo kiểm Chuẩn mực DocFlowBench',
    subtitle: 'Bộ chỉ số định lượng tiêu chuẩn đo lường độ chính xác, độ phủ và tỷ lệ loại bỏ hoàn toàn ảo giác.',
    runSuiteBtn: 'Chạy Toàn bộ Bộ Đo kiểm',
    runningSuiteBtn: 'Đang thực thi 120 truy vấn DocFlowBench...',
    metricRetrievalRecall: 'Độ phủ Truy xuất Recall@5',
    metricMRR: 'Thứ hạng Tương hỗ Trung bình (MRR)',
    metricAvgLatency: 'Độ trễ Động cơ Trung bình',
    metricDeterministicAccuracy: 'Độ chính xác Kiểm tra Xác định',
    confusionMatrixTitle: 'Ma trận Nhầm lẫn (Phát hiện Sai lệch)',
    testCasesTitle: 'Các Kịch bản Kiểm thử Mô phỏng',
    searchQueriesTitle: 'Tập Truy vấn Kiểm thử Trích xuất',
  },
  splitViewer: {
    title: 'Bộ So sánh Chứng từ Chia đôi Màn hình',
    subtitle: 'Đối chiếu song song hai tài liệu gốc với đoạn văn bản được đánh dấu trực quan và công thức đối soát.',
    findingCounter: 'Sai lệch số',
    prevFinding: 'Sai lệch trước (J / ←)',
    nextFinding: 'Sai lệch kế tiếp (K / →)',
    leftDocumentLabel: 'Chứng từ Gốc Chính (Hợp đồng / PO)',
    rightDocumentLabel: 'Chứng từ Đối chiếu (Hóa đơn / Bảng kê)',
    evidenceHighlightLabel: 'Đoạn Văn bản Bằng chứng Gốc',
    formulaReconciliation: 'Chênh lệch Tính toán Số học',
    closeBtn: 'Đóng (Esc)',
    shortcutHint: 'Dùng phím mũi tên [←] [→] để chuyển sai lệch, [Esc] để thoát',
  },
};

interface ThemeLanguageContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: Translations;
}

const ThemeLanguageContext = createContext<ThemeLanguageContextType | undefined>(undefined);

export function ThemeLanguageProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('doc_intel_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('doc_intel_lang');
    if (saved === 'vi' || saved === 'en') return saved;
    return navigator.language.startsWith('vi') ? 'vi' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('doc_intel_theme', theme);
    const root = document.documentElement;
    const body = document.body;
    
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
      
      if (body) {
        body.classList.add('dark');
        body.classList.remove('light');
        body.setAttribute('data-theme', 'dark');
      }
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
      
      if (body) {
        body.classList.remove('dark');
        body.classList.add('light');
        body.setAttribute('data-theme', 'light');
      }
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('doc_intel_lang', lang);
  }, [lang]);

  const setTheme = (newTheme: Theme) => setThemeState(newTheme);
  const toggleTheme = () => setThemeState(prev => (prev === 'light' ? 'dark' : 'light'));

  const setLang = (newLang: Language) => setLangState(newLang);
  const toggleLang = () => setLangState(prev => (prev === 'en' ? 'vi' : 'en'));

  const t = lang === 'vi' ? viTranslations : enTranslations;

  return (
    <ThemeLanguageContext.Provider value={{ theme, setTheme, toggleTheme, lang, setLang, toggleLang, t }}>
      {children}
    </ThemeLanguageContext.Provider>
  );
}

export function useThemeLanguage() {
  const context = useContext(ThemeLanguageContext);
  if (!context) {
    throw new Error('useThemeLanguage must be used within a ThemeLanguageProvider');
  }
  return context;
}
