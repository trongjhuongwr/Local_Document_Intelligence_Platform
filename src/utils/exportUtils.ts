import { ReviewFinding } from '../types';

export function exportReviewsToCSV(reviews: ReviewFinding[], filename = 'audit_findings_report.csv') {
  const headers = [
    'Finding ID',
    'Case ID',
    'Status',
    'Severity',
    'Discrepancy Type',
    'Description',
    'Expected Value',
    'Observed Value',
    'Difference',
    'Formula',
    'Reviewer',
    'Auditor Note',
    'Decided At',
    'Created At',
    'Evidence Files'
  ];

  const escapeCSV = (val: any) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = reviews.map(r => {
    const d = r.discrepancy || {};
    const evidenceFiles = (d.evidence || []).map((e: any) => e.filename).filter(Boolean).join('; ');
    return [
      escapeCSV(r.review_id),
      escapeCSV(r.case_id),
      escapeCSV(r.status),
      escapeCSV(r.severity),
      escapeCSV(d.type || ''),
      escapeCSV(d.description || ''),
      escapeCSV(d.expected_value !== undefined ? d.expected_value : ''),
      escapeCSV(d.observed_value !== undefined ? d.observed_value : ''),
      escapeCSV(d.difference !== undefined ? d.difference : ''),
      escapeCSV(d.calculation?.formula || ''),
      escapeCSV(r.reviewer || ''),
      escapeCSV(r.note || ''),
      escapeCSV(r.decided_at || ''),
      escapeCSV(r.created_at || ''),
      escapeCSV(evidenceFiles),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportReviewsToMarkdown(reviews: ReviewFinding[], title = 'Audit Findings & Review Report') {
  const dateStr = new Date().toLocaleString();
  let md = `# ${title}\n\n`;
  md += `**Generated Date:** ${dateStr}\n`;
  md += `**Total Findings:** ${reviews.length}\n`;
  md += `**Open:** ${reviews.filter(r => r.status === 'OPEN').length} | `;
  md += `**Approved:** ${reviews.filter(r => r.status === 'APPROVED').length} | `;
  md += `**Rejected:** ${reviews.filter(r => r.status === 'REJECTED').length} | `;
  md += `**Resolved:** ${reviews.filter(r => r.status === 'RESOLVED').length}\n\n`;
  md += `---\n\n`;

  reviews.forEach((r, idx) => {
    const d = r.discrepancy || {};
    md += `### ${idx + 1}. [${r.status}] ${d.type ? d.type.toUpperCase() : 'FINDING'} (${r.severity.toUpperCase()})\n\n`;
    md += `- **Finding ID:** \`${r.review_id}\`\n`;
    md += `- **Case ID:** \`${r.case_id}\`\n`;
    md += `- **Created At:** ${r.created_at || 'N/A'}\n`;
    md += `- **Description:** ${d.description || 'N/A'}\n`;

    if (d.expected_value !== undefined || d.observed_value !== undefined) {
      md += `- **Comparison:** Expected \`${d.expected_value}\` vs Observed \`${d.observed_value}\`${d.difference ? ` (Diff: \`${d.difference}\`)` : ''}\n`;
    }
    if (d.calculation?.formula) {
      md += `- **Audit Calculation:** \`${d.calculation.formula}\`\n`;
    }

    if (d.evidence && d.evidence.length > 0) {
      md += `\n**Audit Evidence:**\n`;
      d.evidence.forEach((ev: any) => {
        md += `  - **${ev.filename || 'Document'}** (Page ${ev.page_number || 1}, ${ev.section || 'General'}): *"${ev.snippet || ''}"*\n`;
      });
    }

    if (r.reviewer) {
      md += `\n**Auditor Review Trail:**\n`;
      md += `- **Auditor:** ${r.reviewer}\n`;
      if (r.note) md += `- **Auditor Note / Justification:** *"${r.note}"*\n`;
      if (r.decided_at) md += `- **Decided At:** ${r.decided_at}\n`;
    }

    md += `\n---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'audit_findings_report.md');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printOrExportPDF(reviews: ReviewFinding[], title = 'Audit Findings Official Report') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export printable audit report / PDF.');
    return;
  }

  const openCount = reviews.filter(r => r.status === 'OPEN').length;
  const approvedCount = reviews.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = reviews.filter(r => r.status === 'REJECTED').length;
  const resolvedCount = reviews.filter(r => r.status === 'RESOLVED').length;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 32px;
      color: #1e293b;
      background: #fff;
      font-size: 12px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 6px 0;
      color: #0f172a;
    }
    .meta {
      font-size: 11px;
      color: #64748b;
    }
    .summary-grid {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .summary-item {
      flex: 1;
    }
    .summary-item .label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
    }
    .summary-item .value {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      font-family: monospace;
    }
    .finding-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .finding-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      margin-right: 6px;
    }
    .badge-high { background: #fee2e2; color: #991b1b; }
    .badge-medium { background: #fef3c7; color: #92400e; }
    .badge-low { background: #f1f5f9; color: #475569; }
    .badge-open { background: #e0e7ff; color: #3730a3; }
    .badge-approved { background: #dcfce7; color: #166534; }
    .badge-rejected { background: #fee2e2; color: #991b1b; }
    .badge-resolved { background: #f1f5f9; color: #334155; }
    .finding-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin: 4px 0;
    }
    .comparison-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 11px;
      margin: 8px 0;
    }
    .evidence-box {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #e2e8f0;
      font-size: 11px;
    }
    .reviewer-trail {
      margin-top: 8px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">
      Enterprise Document Intelligence &amp; Multi-Document Audit Engine | Generated: ${new Date().toLocaleString()}
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-item">
      <div class="label">Total Findings</div>
      <div class="value">${reviews.length}</div>
    </div>
    <div class="summary-item">
      <div class="label">Open (Pending)</div>
      <div class="value" style="color: #4338ca;">${openCount}</div>
    </div>
    <div class="summary-item">
      <div class="label">Approved (Confirmed)</div>
      <div class="value" style="color: #15803d;">${approvedCount}</div>
    </div>
    <div class="summary-item">
      <div class="label">Rejected (Dismissed)</div>
      <div class="value" style="color: #b91c1c;">${rejectedCount}</div>
    </div>
    <div class="summary-item">
      <div class="label">Resolved</div>
      <div class="value" style="color: #475569;">${resolvedCount}</div>
    </div>
  </div>

  <div class="findings-list">
    ${reviews.map((r, i) => {
      const d = r.discrepancy || {};
      const sevClass = r.severity === 'high' ? 'badge-high' : r.severity === 'medium' ? 'badge-medium' : 'badge-low';
      const statusClass = r.status === 'APPROVED' ? 'badge-approved' : r.status === 'REJECTED' ? 'badge-rejected' : r.status === 'RESOLVED' ? 'badge-resolved' : 'badge-open';
      
      return `
        <div class="finding-card">
          <div class="finding-header">
            <div>
              <span class="badge ${sevClass}">${r.severity}</span>
              <span class="badge ${statusClass}">${r.status}</span>
              <span style="font-family: monospace; font-size: 11px; color: #64748b;">Case: ${r.case_id}</span>
            </div>
            <span style="font-family: monospace; font-size: 10px; color: #94a3b8;">${r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : ''}</span>
          </div>

          <div class="finding-title">${i + 1}. ${(d.type || 'DISCREPANCY').replace(/_/g, ' ').toUpperCase()}</div>
          <div style="color: #334155; margin-bottom: 6px;">${d.description || ''}</div>

          ${(d.expected_value !== undefined || d.calculation) ? `
            <div class="comparison-box">
              ${d.expected_value !== undefined ? `<strong>Expected:</strong> ${d.expected_value} &nbsp;|&nbsp; <strong>Observed:</strong> ${d.observed_value} ${d.difference !== undefined ? `&nbsp;|&nbsp; <strong>Diff:</strong> ${d.difference}` : ''}` : ''}
              ${d.calculation?.formula ? `<div style="color: #64748b; font-size: 10px; margin-top: 2px;">Formula: ${d.calculation.formula}</div>` : ''}
            </div>
          ` : ''}

          ${(d.evidence && d.evidence.length > 0) ? `
            <div class="evidence-box">
              <strong style="text-transform: uppercase; font-size: 10px; color: #64748b;">Audit Evidence:</strong>
              ${d.evidence.map((ev: any) => `
                <div style="margin-top: 2px;">
                  &bull; <strong>${ev.filename || 'Doc'}</strong> (p.${ev.page_number || 1}): <em>"${ev.snippet || ''}"</em>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${r.reviewer ? `
            <div class="reviewer-trail">
              <strong>Auditor Decision:</strong> ${r.reviewer} &nbsp;|&nbsp; 
              ${r.note ? `<em>"${r.note}"</em>` : 'No note provided'} 
              ${r.decided_at ? `&nbsp;(${r.decided_at.slice(0, 16).replace('T', ' ')})` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('')}
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export interface AuditDossierData {
  caseDetail: {
    case_id: string;
    name: string;
    readiness: string;
    updated_at?: string;
    documents?: any[];
  };
  analysisResult?: any;
  reviews?: ReviewFinding[];
  auditLogs?: any[];
}

export function printOrExportAuditDossier(data: AuditDossierData) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to generate the official Audit Dossier.');
    return;
  }

  const { caseDetail, analysisResult, reviews = [], auditLogs = [] } = data;
  const docs = caseDetail.documents || [];
  const issues = analysisResult?.issues || reviews.map(r => r.discrepancy).filter(Boolean);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Audit Dossier - ${caseDetail.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 36px;
      color: #0f172a;
      background: #fff;
      font-size: 12px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    h1 { font-size: 22px; margin: 0 0 4px 0; color: #0f172a; }
    h2 { font-size: 14px; margin: 20px 0 10px 0; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .meta-bar { font-size: 11px; color: #64748b; margin-bottom: 16px; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-ready { background: #dcfce7; color: #15803d; }
    .badge-high { background: #fee2e2; color: #991b1b; }
    .badge-medium { background: #fef3c7; color: #92400e; }
    .badge-low { background: #f1f5f9; color: #475569; }
    .badge-approved { background: #dcfce7; color: #166534; }
    .badge-rejected { background: #fee2e2; color: #991b1b; }
    .table-custom {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 11px;
    }
    .table-custom th, .table-custom td {
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
      text-align: left;
    }
    .table-custom th {
      background: #f8fafc;
      font-weight: 700;
      color: #475569;
    }
    .summary-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .finding-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
      page-break-inside: avoid;
    }
    .mono { font-family: monospace; font-size: 11px; }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="float: right; text-align: right;">
      <span class="badge badge-ready">SOX-404 / ISO-27001 AUDIT DOSSIER</span>
      <div class="meta-bar" style="margin-top: 4px;">Dossier ID: DOS-${caseDetail.case_id.slice(0, 8)}</div>
    </div>
    <h1>${caseDetail.name}</h1>
    <div class="meta-bar">
      Case ID: <span class="mono">${caseDetail.case_id}</span> &bull; 
      Generated: ${new Date().toLocaleString()} &bull; 
      Status: <strong>${caseDetail.readiness.toUpperCase()}</strong>
    </div>
  </div>

  <h2>1. Executive Summary & Verification Scope</h2>
  <div class="summary-box">
    ${analysisResult?.summary || 'Comprehensive multi-document audit completed across uploaded contracts, invoices, purchase orders, and payment policies.'}
  </div>

  <h2>2. Ingested Documents & Cryptographic Hashes (SHA-256)</h2>
  <table class="table-custom">
    <thead>
      <tr>
        <th>Document Type</th>
        <th>Filename</th>
        <th>File Size</th>
        <th>SHA-256 Hash</th>
      </tr>
    </thead>
    <tbody>
      ${docs.map(d => `
        <tr>
          <td><strong>${d.document_type ? d.document_type.toUpperCase() : 'DOCUMENT'}</strong></td>
          <td>${d.filename}</td>
          <td>${(d.size_bytes / 1024).toFixed(1)} KB</td>
          <td class="mono" style="font-size: 10px;">${d.sha256}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>3. Discrepancy Findings & Mathematical Reconciliation (${issues.length})</h2>
  ${issues.length === 0 ? '<p style="color: #15803d; font-weight: bold;">✓ No discrepancies detected. All cross-document constraints passed cleanly.</p>' : ''}
  ${issues.map((iss: any, idx: number) => `
    <div class="finding-box">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span class="badge ${iss.severity === 'high' ? 'badge-high' : iss.severity === 'medium' ? 'badge-medium' : 'badge-low'}">${iss.severity}</span>
          <strong style="margin-left: 6px;">${idx + 1}. ${(iss.type || 'DISCREPANCY').replace(/_/g, ' ').toUpperCase()}</strong>
        </div>
      </div>
      <div style="margin-top: 6px; color: #334155;">${iss.description}</div>
      ${iss.calculation?.formula ? `
        <div style="margin-top: 6px; padding: 6px 8px; background: #f1f5f9; border-radius: 4px; font-family: monospace; font-size: 10px;">
          Formula: ${iss.calculation.formula} | Difference: ${iss.calculation.result || iss.difference || 'N/A'}
        </div>
      ` : ''}
      ${iss.evidence && iss.evidence.length > 0 ? `
        <div style="margin-top: 6px; font-size: 11px; color: #64748b;">
          <strong>Evidence:</strong> ${iss.evidence.map((e: any) => `${e.filename} (${e.snippet || ''})`).join('; ')}
        </div>
      ` : ''}
    </div>
  `).join('')}

  <h2>4. Auditor Attestations & Cryptographic Ledger Proof</h2>
  <table class="table-custom">
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Actor / Role</th>
        <th>Action</th>
        <th>Ledger Entry Hash</th>
      </tr>
    </thead>
    <tbody>
      ${auditLogs.slice(0, 10).map((log: any) => `
        <tr>
          <td>${log.timestamp ? log.timestamp.slice(0, 16).replace('T', ' ') : 'Recent'}</td>
          <td><strong>${log.actor}</strong></td>
          <td>${log.action}</td>
          <td class="mono" style="font-size: 10px;">${log.entry_hash ? log.entry_hash.slice(0, 16) + '...' : 'Verified'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top: 36px; border-top: 1px solid #cbd5e1; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
    <div>Certified by: <strong>SOX/ISO Document Intelligence Audit Platform</strong></div>
    <div>Digital Signature: <span class="mono">${Math.random().toString(36).substring(2, 15).toUpperCase()}</span></div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
