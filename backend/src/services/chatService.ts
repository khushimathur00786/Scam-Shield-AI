import { GoogleGenerativeAI } from '@google/generative-ai';

// ── System prompt — defines the chatbot's identity and knowledge ──────────
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
7. Keep responses concise (2-4 paragraphs max) unless the user asks for more detail

INTEGRATION WITH SCAMSHIELD FEATURES:
- If a user wants to analyze a job post or offer letter → suggest: "You can paste it directly in our Job Scam Analyzer on the Analyze page for an instant risk score."
- If a user wants to check a company → suggest: "Try our Company Verify feature — it checks the company name against known registries."
- If a user wants to check a suspicious link → suggest: "Our Link Inspector tool can analyze that URL for phishing patterns."
- If a user wants to report → always give them the official channels.

SAFETY RULES — NEVER VIOLATE:
- NEVER ask users for passwords, OTPs, UPI PINs, or banking credentials
- NEVER ask users to share sensitive personal information
- NEVER encourage clicking suspicious links or making payments
- NEVER claim to have verified a company or website unless ScamShield actually did it
- NEVER guarantee something is safe without actual verification
- ALWAYS clearly distinguish between "suspicious indicators" and "confirmed fraud"
- ALWAYS give emergency reporting guidance when someone reports active financial fraud

INDIA-SPECIFIC EMERGENCY INFORMATION:
- Cybercrime Helpline: 1930 (24×7, free to call)
- Official Portal: https://cybercrime.gov.in
- If someone has already sent money → tell them to call 1930 IMMEDIATELY — faster action = better chance of recovery

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

RESPONSE FORMAT:
- Use short paragraphs, not walls of text
- Use numbered steps when giving instructions
- Use bullet points for lists of warning signs
- End responses with a relevant follow-up question when appropriate
- For emergencies (user already lost money): put 1930 at the TOP of your response`;

// ── Types ─────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ChatResponse {
  reply: string;
  isEmergency: boolean;
}

// ── Gemini client (lazy-init) ─────────────────────────────────────────────
let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables.');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
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

// ── Fallback responses when Gemini is unavailable ─────────────────────────
const FALLBACK_RESPONSES: Record<string, string> = {
  default: "I'm having trouble connecting right now. If this is an emergency and you've lost money, please call 1930 immediately — India's 24×7 Cybercrime Helpline. Otherwise, please try again in a moment.",
  emergency: "🚨 URGENT: Call 1930 RIGHT NOW — India's National Cybercrime Helpline (24×7, free). The faster you call, the better the chance of recovering your funds. Also file a complaint at cybercrime.gov.in. Do NOT pay any more money to anyone claiming they can return your funds.",
};

// ── Main chat function ────────────────────────────────────────────────────
export async function chat(
  userMessage: string,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const isEmergency = detectEmergency(userMessage);

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Convert our history format to Gemini's format
    const geminiHistory = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    }));

    const chatSession = model.startChat({
      history: geminiHistory,
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const result = await chatSession.sendMessage(userMessage);
    const reply = result.response.text();

    return { reply, isEmergency };
  } catch (err) {
    console.error('Gemini API error:', err);
    // Return a useful fallback — never return empty or confusing errors to user
    return {
      reply: isEmergency ? FALLBACK_RESPONSES.emergency : FALLBACK_RESPONSES.default,
      isEmergency,
    };
  }
}
