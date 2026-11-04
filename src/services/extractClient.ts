import { createWorker } from 'tesseract.js';

export interface ClientExtractionResult {
  text: string;
  method: 'ocr-client' | 'failed';
  progress: number;
  error?: string;
}

/**
 * Extracts text from an image file entirely in the browser using Tesseract.js.
 * No backend call needed — works offline and on mobile.
 */
export async function extractTextClientSide(
  file: File,
  onProgress: (pct: number) => void
): Promise<ClientExtractionResult> {
  let worker;
  try {
    worker = await createWorker('eng', 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          onProgress(Math.round(m.progress * 100));
        }
      },
    });

    const imageUrl = URL.createObjectURL(file);
    const { data: { text } } = await worker.recognize(imageUrl);
    URL.revokeObjectURL(imageUrl);
    await worker.terminate();

    const cleaned = text.trim();
    if (cleaned.length < 10) {
      return {
        text: '',
        method: 'failed',
        progress: 100,
        error: 'Could not extract readable text from this image. Please ensure the document is clear and well-lit.',
      };
    }
    return { text: cleaned, method: 'ocr-client', progress: 100 };
  } catch (err) {
    if (worker) { try { await worker.terminate(); } catch { /* ignore */ } }
    return {
      text: '',
      method: 'failed',
      progress: 0,
      error: 'Text extraction failed. Please try a clearer image.',
    };
  }
}
