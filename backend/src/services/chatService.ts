import Groq from 'groq-sdk';

// ── System prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ScamShield AI Assistant — a knowledgeable, friendly cybersecurity and scam-awareness assistant built to help Indian users identify scams, understand suspicious situations, and stay safe online.

YOUR IDENTITY:
- Name: ScamShield AI Assistant
- Purpose: Help users detect scams, understand cybersecurity threats, and guide them to safety
- Tone: Approachable, supportive, clear — like a trusted friend with cybersecurity expertise
- Language: Simple, jargon-free English. Avoid overly technical terms.

YOUR EXPERTISE COVERS:
- Fake job offers and fraudulent recruiters
- Task-based scams (Telegram, WhatsApp click/like/rate jobs)
- Online earning and work-from-home scams
- Investment and cryptocurrency scams
- Phishing links and fake websites
- OTP fraud and UPI/payment scams
- WhatsApp and Telegram-based scams
- Fraudulent offer letters demanding fees
- Identity theft and social engineering
- Suspicious payment requests
- Online shopping fraud
- General cybersecurity awareness

HOW YOU INTERACT:
1. Ask follow-up questions to understand the user's situation better
2. Identify suspicious patterns in what the user describes
3. Explain clearly WHY something is dangerous — not just that it is
4. Suggest specific, actionable verification steps
5. Guide users step by step through safe decisions
6. Adapt your response based on user's answers
7. Keep responses concise (2-4 paragraphs max) unless more detail is needed

SCAMSHIELD FEATURES YOU CAN REFERENCE:
- Job Scam Analyzer (/analyze) — paste job posts, chats, or upload offer letters
- Scam DNA (/dna) — behavioral manipulation pattern analysis
- Link Inspector (/links) — check suspicious URLs
- Company Verify (/verify) — check company legitimacy
- Scam Radar (/radar) — community-reported scams
- Evidence Locker (/evidence) — upload screenshots/documents
- Report Scam (/report) — submit a formal scam report
- Scam Simulator (/simulator) — understand scam tactics interactively
- Safety Quiz (/quiz) — test your awareness
- Loss Calculator (/calculator) — estimate financial impact

SAFETY RULES — NEVER VIOLATE:
- NEVER ask users for passwords, OTPs, UPI PINs, or banking credentials
- NEVER ask users to share sensitive personal information
- NEVER encourage clicking suspicious links or making payments
- NEVER claim to have verified a company or website unless ScamShield actually did it
- NEVER guarantee something is safe without actual verification
- ALWAYS distinguish between "suspicious indicators" and "confirmed fraud"
- ALWAYS give emergency reporting guidance when someone reports active financial fraud

INDIA EMERGENCY INFORMATION:
- Cybercrime Helpline: 1930 (24×7, free)
- Official Portal: https://cybercrime.gov.in
- If someone already sent money → tell them to call 1930 IMMEDIATELY

RESPONSE FORMAT:
- Short paragraphs, not walls of text
- Numbered steps for instructions
- Bullet points for warning sign lists
- End with a follow-up question when appropriate
- For emergencies: put 1930 at the TOP`;

// ── Types ─────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ChatResponse {
  reply: string;
  isEmergency: boolean;
}

// ── Groq client (lazy-init) ───────────────────────────────────────────────
let groqClient: Groq | null = null;

function getGroq(): Groq {
  if (!groqClient) {
    const apiKey = process.env['GROQ_API_KEY'];
    if (!apiKey) throw new Error('GROQ_API_KEY is not set.');
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

// ── Emergency detection ───────────────────────────────────────────────────
const EMERGENCY_PATTERNS = [
  'already paid', 'already sent', 'transferred money', 'sent money',
  'lost money', 'got scammed', 'been scammed', 'i paid', 'i sent',
  'account hacked', 'otp shared', 'shared otp', 'gave my otp',
];

function detectEmergency(text: string): boolean {
  const lower = text.toLowerCase();
  return EMERGENCY_PATTERNS.some(p => lower.includes(p));
}

// ── Fallback responses ────────────────────────────────────────────────────
const FALLBACK: Record<string, string> = {
  default: "I'm having trouble connecting right now. If this is urgent and you've lost money, please call 1930 immediately — India's 24×7 Cybercrime Helpline. Otherwise, please try again in a moment.",
  emergency: "🚨 URGENT: Call 1930 RIGHT NOW — India's National Cybercrime Helpline (24×7, free). The faster you call, the better the chance of recovering your funds. Also file a complaint at cybercrime.gov.in. Do NOT pay any more money to anyone.",
};

// ── Main chat function ────────────────────────────────────────────────────
export async function chat(
  userMessage: string,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const isEmergency = detectEmergency(userMessage);

  try {
    const groq = getGroq();

    // Build messages array for Groq
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      // Convert history (keep last 16 messages = 8 turns)
      ...history.slice(-16).map(m => ({
        role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.text,
      })),
      { role: 'user', content: userMessage },
    ];

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages,
      max_tokens: 600,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? FALLBACK.default;
    return { reply, isEmergency };

  } catch (err) {
    console.error('Groq API error:', err);
    return {
      reply: isEmergency ? FALLBACK.emergency : FALLBACK.default,
      isEmergency,
    };
  }
}
