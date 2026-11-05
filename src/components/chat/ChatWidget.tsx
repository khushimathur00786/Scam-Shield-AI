import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Minimize2, Send, Mic, MicOff, Volume2, VolumeX,
  Phone, Trash2, ChevronDown, ShieldCheck, Sparkles,
} from 'lucide-react';
import { sendChatMessage, type ChatMessage } from '../../api/chat';

// ── Types ─────────────────────────────────────────────────────────────────
interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  isEmergency?: boolean;
}

// ── Suggested prompts ─────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  '🔍 Is this job offer genuine?',
  '⚠️ How do I identify a task scam?',
  '💸 Someone is asking me for money',
  '📋 How do I report online fraud?',
  '🏢 How can I verify a company?',
];

// ── Welcome message ───────────────────────────────────────────────────────
const WELCOME: DisplayMessage = {
  role: 'assistant',
  text: "Hey there! 👋 I'm Shieldy — your ScamShield AI buddy!\n\nI'm here to help you stay safe from online scams, fake jobs, and cyber fraud. You can type or talk to me 🎙️\n\nHow can I help you today?",
  timestamp: Date.now(),
};

// ── Speech Recognition types ──────────────────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechRecognitionConstructor { new(): SpeechRecognitionInstance; }
declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── Cute AI Avatar SVG ────────────────────────────────────────────────────
function BotAvatar({ size = 32, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={animate ? 'animate-bounce' : ''}
      style={animate ? { animationDuration: '2s' } : {}}
    >
      {/* Body — dark graphite */}
      <rect x="10" y="28" width="44" height="28" rx="14" fill="#1E2130" />
      {/* Body highlight */}
      <rect x="10" y="28" width="44" height="14" rx="14" fill="#272B3A" />

      {/* Head — dark with amber border */}
      <rect x="14" y="6" width="36" height="30" rx="12" fill="#272B3A" />
      <rect x="14" y="6" width="36" height="30" rx="12" stroke="#F59E0B" strokeWidth="1.5" />

      {/* Antenna */}
      <line x1="32" y1="6" x2="32" y2="1" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="1" r="2" fill="#F59E0B" />

      {/* Eyes — white with colored pupils */}
      <circle cx="23" cy="18" r="5" fill="white" />
      <circle cx="41" cy="18" r="5" fill="white" />
      {/* Pupils — dark */}
      <circle cx="24" cy="19" r="2.8" fill="#111318" />
      <circle cx="42" cy="19" r="2.8" fill="#111318" />
      {/* Eye shine */}
      <circle cx="25" cy="18" r="1" fill="white" />
      <circle cx="43" cy="18" r="1" fill="white" />
      {/* Eye glow ring */}
      <circle cx="23" cy="18" r="5" stroke="#F59E0B" strokeWidth="0.8" strokeOpacity="0.4" />
      <circle cx="41" cy="18" r="5" stroke="#F59E0B" strokeWidth="0.8" strokeOpacity="0.4" />

      {/* Smile — amber */}
      <path d="M22 26 Q32 32 42 26" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* Cheeks — pink blush */}
      <ellipse cx="17" cy="25" rx="3.5" ry="2" fill="#F87171" opacity="0.5" />
      <ellipse cx="47" cy="25" rx="3.5" ry="2" fill="#F87171" opacity="0.5" />

      {/* Arms */}
      <rect x="2" y="30" width="10" height="7" rx="3.5" fill="#272B3A" stroke="#F59E0B" strokeWidth="1" />
      <rect x="52" y="30" width="10" height="7" rx="3.5" fill="#272B3A" stroke="#F59E0B" strokeWidth="1" />

      {/* Belly panel */}
      <rect x="18" y="36" width="28" height="14" rx="7" fill="#111318" />
      {/* Status dots */}
      <circle cx="26" cy="43" r="2.5" fill="#34D399" />
      <circle cx="32" cy="43" r="2.5" fill="#F59E0B" />
      <circle cx="38" cy="43" r="2.5" fill="#60A5FA" />

      {/* Ears / side bolts */}
      <circle cx="14" cy="21" r="2" fill="#F59E0B" />
      <circle cx="50" cy="21" r="2" fill="#F59E0B" />
    </svg>
  );
}

// ── Floating trigger with speech bubble ───────────────────────────────────
function FloatingTrigger({ onClick, unreadCount, showBubble }: {
  onClick: () => void;
  unreadCount: number;
  showBubble: boolean;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Speech bubble */}
      {showBubble && (
        <div className="bg-[#20232B] border border-amber-500/30 rounded-2xl rounded-br-sm px-4 py-2.5 shadow-lg max-w-[200px] animate-fade-in-up">
          <p className="text-xs text-[#F8FAFC] font-medium">Hi! 👋 I'm Shieldy</p>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">Ask me about scams!</p>
          {/* Arrow */}
          <div className="absolute -bottom-2 right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[#20232B]" />
        </div>
      )}

      {/* Main button */}
      <button
        onClick={onClick}
        aria-label="Open ScamShield AI Assistant"
        className="relative w-16 h-16 rounded-full bg-[#1E2130] border-2 border-amber-500/60 shadow-[0_4px_24px_rgba(245,158,11,0.4)] hover:shadow-[0_6px_36px_rgba(245,158,11,0.65)] hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center"
      >
        <BotAvatar size={44} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full border-2 border-amber-500/40 animate-ping" style={{ animationDuration: '2.5s' }} />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBubble, setShowBubble] = useState(false);

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    setTtsSupported('speechSynthesis' in window);
    // Show speech bubble after 3 seconds
    const t = setTimeout(() => setShowBubble(true), 3000);
    const t2 = setTimeout(() => setShowBubble(false), 8000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages, loading, isOpen, isMinimized]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (!isOpen || isMinimized) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && messages.length > 1) {
        setUnreadCount(c => c + 1);
      }
    }
  }, [messages]);

  const openChat = () => { setIsOpen(true); setIsMinimized(false); setUnreadCount(0); setShowBubble(false); };
  const closeChat = () => { setIsOpen(false); stopSpeaking(); };
  const minimizeChat = () => { setIsMinimized(true); stopSpeaking(); };

  function buildHistory(): ChatMessage[] {
    return messages
      .filter(m => m.text !== WELCOME.text)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'model' as 'user' | 'model', text: m.text }));
  }

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: DisplayMessage = { role: 'user', text: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const { reply, isEmergency } = await sendChatMessage(trimmed, buildHistory());
      setMessages(prev => [...prev, { role: 'assistant', text: reply, timestamp: Date.now(), isEmergency }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: err instanceof Error && err.message.includes('429')
          ? "Whoa, slow down! 😅 You're sending messages really fast. Give me a moment!"
          : "Oops! 😔 I'm having a little trouble connecting. If it's urgent, call 1930. Try again in a moment!",
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  const startRecording = useCallback(() => {
    if (!voiceSupported) return;
    setMicError(null);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      setInput(transcript);
      if (event.results[event.results.length - 1].isFinal) void send(transcript);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsRecording(false);
      if (event.error === 'not-allowed') setMicError('Microphone access denied. Allow it in browser settings.');
      else if (event.error === 'no-speech') setMicError('No speech detected. Try again!');
      else setMicError('Voice failed. Please type instead.');
      setTimeout(() => setMicError(null), 4000);
    };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, [voiceSupported, send]);

  const stopRecording = useCallback(() => { recognitionRef.current?.stop(); setIsRecording(false); }, []);

  const speak = useCallback((text: string, id: number) => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))) || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setSpeakingId(id);
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utterance);
  }, [ttsSupported]);

  const stopSpeaking = useCallback(() => { window.speechSynthesis?.cancel(); setSpeakingId(null); }, []);

  const clearChat = () => { stopSpeaking(); setMessages([WELCOME]); setInput(''); };

  return (
    <>
      {/* ── Floating trigger ── */}
      {!isOpen && (
        <FloatingTrigger onClick={openChat} unreadCount={unreadCount} showBubble={showBubble} />
      )}

      {/* ── Chat window ── */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 w-[360px] sm:w-[400px] flex flex-col rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(245,158,11,0.15)] transition-all duration-300 ${
            isMinimized ? 'h-16' : 'h-[600px] max-h-[92vh]'
          }`}
          style={{ background: 'linear-gradient(160deg, #1a1d26 0%, #171A21 100%)' }}
          role="dialog"
          aria-label="ScamShield AI Assistant"
        >
          {/* ── Gradient top bar ── */}
          <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 shrink-0" />

          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, transparent 100%)' }}
          >
            {/* Avatar with glow */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#1E2130] border border-amber-500/40 flex items-center justify-center shadow-[0_0_16px_rgba(245,158,11,0.3)]">
                <BotAvatar size={28} />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#171A21]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#F8FAFC]">Shieldy</span>
                <Sparkles className="w-3 h-3 text-amber-400" />
              </div>
              <div className="text-[10px] text-[#9CA3AF]">ScamShield AI · Always here to help</div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button onClick={clearChat} title="Clear chat"
                className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#F8FAFC] hover:bg-white/5 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={minimizeChat} aria-label="Minimize"
                className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#F8FAFC] hover:bg-white/5 transition-colors">
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={closeChat} aria-label="Close"
                className="p-1.5 rounded-lg text-[#6B7280] hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── Minimized bar ── */}
          {isMinimized && (
            <button onClick={() => { setIsMinimized(false); setUnreadCount(0); }}
              className="flex-1 flex items-center justify-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors">
              <ChevronDown className="w-4 h-4 rotate-180" />
              <span>Chat with Shieldy</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">{unreadCount}</span>
              )}
            </button>
          )}

          {!isMinimized && (
            <>
              {/* ── Messages ── */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">

                {/* Intro card — show only on welcome */}
                {messages.length === 1 && (
                  <div className="flex flex-col items-center text-center py-4 space-y-3">
                    <div className="w-20 h-20 rounded-full bg-[#1E2130] border-2 border-amber-500/40 flex items-center justify-center shadow-[0_0_24px_rgba(245,158,11,0.25)]">
                      <BotAvatar size={56} animate />
                    </div>
                    <div>
                      <p className="text-base font-bold text-[#F8FAFC]">Hi, I'm Shieldy! 👋</p>
                      <p className="text-xs text-[#9CA3AF] mt-1">Your AI scam protection buddy</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                      {SUGGESTED_PROMPTS.map(p => (
                        <button key={p} onClick={() => void send(p.replace(/^[^\s]+\s/, ''))}
                          className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                        <BotAvatar size={22} />
                      </div>
                    )}

                    <div className="max-w-[80%] space-y-1">
                      {msg.isEmergency && (
                        <a href="tel:1930"
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/25 transition-colors">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          🚨 Call 1930 — Cybercrime Helpline (24×7)
                        </a>
                      )}

                      <div className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-amber-500 to-amber-400 text-[#111318] font-medium rounded-2xl rounded-br-sm shadow-[0_2px_12px_rgba(245,158,11,0.3)]'
                          : 'bg-[#20232B] text-[#D1D5DB] rounded-2xl rounded-bl-sm border border-white/5'
                      }`}>
                        {msg.text}
                      </div>

                      <div className={`flex items-center gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-[#374151]">{formatTime(msg.timestamp)}</span>
                        {msg.role === 'assistant' && ttsSupported && (
                          <button
                            onClick={() => speakingId === msg.timestamp ? stopSpeaking() : speak(msg.text, msg.timestamp)}
                            className="p-1 rounded text-[#374151] hover:text-amber-400 transition-colors">
                            {speakingId === msg.timestamp ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 text-amber-400 font-bold text-xs">
                        You
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-8 h-8 rounded-full bg-[#1E2130] border border-amber-500/30 flex items-center justify-center shrink-0">
                      <BotAvatar size={22} />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-[#20232B] border border-white/5">
                      <div className="flex gap-1.5 items-center">
                        {[0, 150, 300].map(delay => (
                          <span key={delay} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce"
                            style={{ animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Errors */}
              {micError && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {micError}
                </div>
              )}

              {isRecording && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-amber-400 text-xs font-medium">Shieldy is listening... 🎙️</span>
                </div>
              )}

              {/* Safety notice */}
              <div className="mx-4 mb-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <ShieldCheck className="w-3 h-3 text-amber-500/50 shrink-0" />
                <span className="text-[10px] text-[#4B5563]">Never share OTPs, passwords or banking details</span>
              </div>

              {/* Input */}
              <div className="px-4 pb-4 shrink-0">
                <div className="flex items-center gap-2 bg-[#20232B] border border-white/8 rounded-2xl px-3 py-2.5 focus-within:border-amber-500/40 focus-within:shadow-[0_0_0_3px_rgba(245,158,11,0.08)] transition-all">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                    placeholder={isRecording ? '🎙️ Listening...' : 'Ask Shieldy anything...'}
                    disabled={loading || isRecording}
                    className="flex-1 bg-transparent text-sm text-[#F8FAFC] placeholder:text-[#374151] focus:outline-none disabled:opacity-50 min-w-0"
                  />

                  <button
                    onClick={!voiceSupported ? () => setMicError('Voice needs Chrome or Edge.') : isRecording ? stopRecording : startRecording}
                    disabled={loading}
                    title={!voiceSupported ? 'Needs Chrome/Edge' : isRecording ? 'Stop' : 'Voice input'}
                    className={`p-2 rounded-xl transition-all ${
                      isRecording
                        ? 'bg-red-500/20 text-red-400 animate-pulse'
                        : !voiceSupported
                        ? 'text-[#374151] cursor-not-allowed'
                        : 'text-[#6B7280] hover:text-amber-400 hover:bg-amber-500/10'
                    }`}>
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => void send(input)}
                    disabled={loading || !input.trim()}
                    className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-amber-400 text-[#111318] hover:from-amber-400 hover:to-amber-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-[0_2px_8px_rgba(245,158,11,0.4)]">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
