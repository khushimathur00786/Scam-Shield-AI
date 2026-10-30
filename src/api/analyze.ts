import { api } from './client';
import type { ScanResult } from '../types';

export interface AnalyzeRequest {
  inputType: 'job_post' | 'chat' | 'offer_letter';
  text: string;
  companyName?: string;
  jobUrl?: string;
  platform?: string;
}

export function analyzeContent(body: AnalyzeRequest): Promise<ScanResult> {
  return api.post<ScanResult>('/analyze', body);
}

/**
 * Uploads an offer letter file (PDF/JPG/PNG) to the backend for
 * text extraction + scam analysis. Never sends just the filename.
 */
export async function analyzeOfferLetterFile(
  file: File,
  companyName?: string
): Promise<ScanResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (companyName) formData.append('companyName', companyName);

  const res = await fetch('/api/analyze/file', {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type manually — browser sets it with the boundary
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; extractionFailed?: boolean };
    throw new Error(body.error ?? `Analysis failed (${res.status})`);
  }

  return res.json() as Promise<ScanResult>;
}
