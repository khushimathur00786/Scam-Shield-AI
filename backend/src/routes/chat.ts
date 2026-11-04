import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { chat, type ChatMessage } from '../services/chatService';

const router = Router();

// Stricter rate limit for AI chat — 40 messages per 10 minutes per IP
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please wait a moment before continuing.', status: 429 },
});

/**
 * POST /api/chat
 * Body: { message: string, history: Array<{ role: 'user'|'model', text: string }> }
 * Returns: { reply: string, isEmergency: boolean }
 */
router.post(
  '/',
  chatLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { message, history } = req.body as {
        message?: string;
        history?: ChatMessage[];
      };

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }

      if (message.trim().length > 2000) {
        res.status(400).json({ error: 'Message is too long. Please keep it under 2000 characters.' });
        return;
      }

      const safeHistory = Array.isArray(history)
        ? history.slice(-20) // Keep last 20 messages for context (10 turns)
        : [];

      const result = await chat(message.trim(), safeHistory);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
