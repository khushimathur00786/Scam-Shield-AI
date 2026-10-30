import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { extractTextFromFile } from '../services/extractService';
import { analyzeText } from '../services/analyzeService';
import { recordScan } from '../services/scanTracker';

const router = Router();

// Accept files up to 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG and PNG files are supported.'));
    }
  },
});

/**
 * POST /api/analyze/file
 * Accepts a multipart form upload of an offer letter (PDF/image),
 * extracts text via pdf-parse or OCR, then runs the scam detection engine.
 */
router.post(
  '/file',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Please attach a PDF, JPG or PNG.' });
        return;
      }

      // Step 1: Extract text from the uploaded file
      const extraction = await extractTextFromFile(req.file.buffer, req.file.mimetype);

      // If extraction completely failed, return a clear error — never return SAFE on failure
      if (extraction.method === 'failed' || extraction.text.length < 10) {
        res.status(422).json({
          error:
            extraction.error ??
            'Could not extract text from this document. Please ensure it is readable and try again, or copy-paste the text into the Job Post tab instead.',
          extractionFailed: true,
        });
        return;
      }

      const companyName = (req.body.companyName as string | undefined) || undefined;

      // Step 2: Run full scam detection on extracted text
      const result = analyzeText({
        inputType: 'offer_letter',
        text: extraction.text,
        companyName,
        extractionMethod: extraction.method,
      });

      // Step 3: Record scan asynchronously
      void recordScan({
        inputType: result.inputType,
        riskLevel: result.riskLevel,
        riskScore: result.riskScore,
        summary: result.summary,
        companyName,
      });

      // Step 4: Return enriched result with extraction metadata
      res.json({
        ...result,
        extractedTextLength: extraction.text.length,
        extractionMethod: extraction.method,
        ocrConfidence: extraction.confidence,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
