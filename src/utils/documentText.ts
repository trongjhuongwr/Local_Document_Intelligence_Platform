import { apiGet } from '../api';
import { DocumentChunk, DocumentDetail } from '../types';

export interface LoadedDocument {
  detail: DocumentDetail;
  chunks: DocumentChunk[];
  /** Parsed document text, reassembled from the indexed chunks. */
  text: string;
}

/**
 * The backend does not store or serve the raw extracted document body:
 * GET /api/documents/{id} returns metadata only. The parsed text lives in the
 * chunk rows, so reassemble it from GET /api/documents/{id}/chunks in
 * `order_index` order. Overlapping chunks are de-duplicated on exact repeats.
 */
export function chunksToText(chunks: DocumentChunk[]): string {
  const ordered = [...chunks].sort((a, b) => a.order_index - b.order_index);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const chunk of ordered) {
    const text = (chunk.text || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.join('\n\n');
}

export async function loadDocument(documentId: string, signal?: AbortSignal): Promise<LoadedDocument> {
  const [detail, chunks] = await Promise.all([
    apiGet<DocumentDetail>(`/api/documents/${documentId}`, signal),
    apiGet<DocumentChunk[]>(`/api/documents/${documentId}/chunks`, signal),
  ]);
  return { detail, chunks, text: chunksToText(chunks) };
}
