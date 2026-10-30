import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';

export interface ExtractionResult {
  text: string;
  method: 'pdf' | 'ocr' | 'failed';
  confidence?: number;
  error?: string;
}

/**
 * Extracts plain text from a PDF or image buffer.
 * PDF  → pdf-parse (fast, accurate for text-based PDFs)
 * Image → Tesseract OCR (for scanned/photographed documents)
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimetype: string
): Promise<ExtractionResult> {
  // ── PDF ───────────────────────────────────────────────────────────
  if (mimetype === 'application/pdf') {
    try {
      const data = await pdfParse(buffer);
      const text = data.text.trim();

      if (text.length < 30) {
        // PDF is likely scanned — fall through to OCR
        return runOCR(buffer);
      }

      return { text, method: 'pdf' };
    } catch (err) {
      console.error('pdf-parse failed, trying OCR:', err);
      return runOCR(buffer);
    }
  }

  // ── Image (JPG / PNG) ─────────────────────────────────────────────
  if (
    mimetype === 'image/jpeg' ||
    mimetype === 'image/jpg' ||
    mimetype === 'image/png'
  ) {
    return runOCR(buffer);
  }

  return {
    text: '',
    method: 'failed',
    error: `Unsupported file type: ${mimetype}`,
  };
}

async function runOCR(buffer: Buffer): Promise<ExtractionResult> {
  let worker;
  try {
    worker = await createWorker('eng');
    const {
      data: { text, confidence },
    } = await worker.recognize(buffer);
    await worker.terminate();

    const cleaned = text.trim();
    if (cleaned.length < 10) {
      return {
        text: '',
        method: 'failed',
        error: 'Could not extract readable text from the image. Please ensure the document is clear and well-lit.',
      };
    }

    return { text: cleaned, method: 'ocr', confidence };
  } catch (err) {
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore */ }
    }
    return {
      text: '',
      method: 'failed',
      error: 'OCR processing failed. Please try a clearer image or copy-paste the text manually.',
    };
  }
}
