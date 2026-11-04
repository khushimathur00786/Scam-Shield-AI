import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, X, Minimize2, Send, Mic, MicOff, Volume2, VolumeX,
  Phone, Trash2, ChevronDown, ShieldCheck,
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
  'Is this job offer genuine?',
  'How do I identify a task scam?',
  'Someone is asking me for money. What should I do?',
  'How do I report online fraud?',
  'How can I verify a company?',
];

// ── Welcome message ───────────────────────────────────────────────────────
const WELCOME: DisplayMessage = {
  role: 'assistant',
  text: "Hello! I'm your ScamShield AI Assistant. I can help you identify suspicious activities, understand online scams, and stay safe in the digital world. You can type or simply talk to me. How can I help you today?",
  timestamp: Date.now(),
};

// ── Speech Recognition type augment ──────────────────────────────────────
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

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── Main component ────────────────────────────────────────────────────────
export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Voice output state
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Check browser capabilities ──────────────────────────────────────────
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    setTtsSupported('speechSynthesis' in window);
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages, loading, isOpen, isMinimized]);

  // ── Focus input when opened ─────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // ── Unread counter ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || isMinimized) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && messages.length > 1) {
        setUnreadCount(c => c + 1);
      }
    }
  }, [messages]);

  const openChat = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setUnreadCount(0);
  };

  // ── Stop TTS if window closes ───────────────────────────────────────────
  const closeChat = () => {
    setIsOpen(false);
    stopSpeaking();
  };

  const minimizeChat = () => {
    setIsMinimized(true);
    stopSpeaking();
  };

  // ── Convert display history to API format ───────────────────────────────
  function buildHistory(): ChatMessage[] {
    return messages
      .filter(m => m.text !== WELCOME.text) // exclude welcome
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model' as 'user' | 'model',
        text: m.text,
      }));
  }

  // ── Send a message ──────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: DisplayMessage = { role: 'user', text: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = buildHistory();
      const { reply, isEmergency } = await sendChatMessage(trimmed, history);
      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        text: reply,
        timestamp: Date.now(),
        isEmergency,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: DisplayMessage = {
        role: 'assistant',
        text: err instanceof Error && err.message.includes('429')
          ? 'You\'ve sent a lot of messages! Please wait a moment before continuing.'
          : 'I\'m having trouble connecting right now. If this is urgent, please call 1930 (Cybercrime Helpline). Please try again in a moment.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  // ── Voice INPUT (Speech Recognition) ───────────────────────────────────
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
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');
      setInput(transcript);

      // Auto-send on final result
      if (event.results[event.results.length - 1].isFinal) {
        void send(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsRecording(false);
      if (event.error === 'not-allowed') {
        setMicError('Microphone access denied. Please allow microphone permissions in your browser settings.');
      } else if (event.error === 'no-speech') {
        setMicError('No speech detected. Please try again.');
      } else {
        setMicError('Voice input failed. Please type your message instead.');
      }
      setTimeout(() => setMicError(null), 4000);
    };

    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [voiceSupported, send]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  // ── Voice OUTPUT (Text-to-Speech) ────────────────────────────────────────
  const speak = useCallback((text: string, id: number) => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Prefer a natural-sounding voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))
    ) || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setSpeakingId(id);
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    window.speechSynthesis.speak(utterance);
  }, [ttsSupported]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
  }, []);

  const clearChat = () => {
    stopSpeaking();
    setMessages([WELCOME]);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating trigger button ── */}
      {!isOpen && (
        <button
          onClick={openChat}
          aria-label="Open ScamShield AI Assistant"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-amber-400 shadow-[0_4px_24px_rgba(245,158,11,0.5)] hover:shadow-[0_6px_32px_rgba(245,158,11,0.65)] hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center group"
        >
          <Bot className="w-7 h-7 text-[#111318]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* ── Chat window ── */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 w-[360px] sm:w-[400px] bg-[#171A21] border border-amber-500/20 rounded-2xl shadow-[0_8px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(245,158,11,0.1)] flex flex-col transition-all duration-300 ${
            isMinimized ? 'h-14' : 'h-[580px] max-h-[90vh]'
          }`}
          role="dialog"
          aria-label="ScamShield AI Assistant"
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-amber-500/10 shrink-0">
            <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[#F8FAFC] truncate">ScamShield AI Assistant</div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] text-[#9CA3AF]">Online — Ask me anything</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={clearChat}
                aria-label="Clear chat"
                title="Clear chat"
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-white/5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={minimizeChat}
                aria-label="Minimize chat"
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-white/5 transition-colors"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={closeChat}
                aria-label="Close chat"
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── Minimized restore bar ── */}
          {isMinimized && (
            <button
              onClick={() => { setIsMinimized(false); setUnreadCount(0); }}
              className="flex-1 flex items-center justify-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              <ChevronDown className="w-4 h-4 rotate-180" />
              <span>Open chat</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          )}

          {!isMinimized && (
            <>
              {/* ── Messages area ── */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">

                {/* Suggested prompts — only when at welcome state */}
                {messages.length === 1 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider font-semibold">Quick questions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTED_PROMPTS.map(p => (
                        <button
                          key={p}
                          onClick={() => void send(p)}
                          className="px-2.5 py-1.5 rounded-full border border-amber-500/20 text-[11px] text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/40 transition-colors text-left"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {/* Bot avatar */}
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                    )}

                    <div className="max-w-[82%] space-y-1">
                      {/* Emergency banner */}
                      {msg.isEmergency && (
                        <a
                          href="tel:1930"
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/25 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          🚨 Call 1930 — Cybercrime Helpline (24×7)
                        </a>
                      )}

                      {/* Message bubble */}
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-amber-500 text-[#111318] font-medium rounded-br-sm'
                            : 'bg-[#20232B] text-[#D1D5DB] rounded-bl-sm border border-amber-500/8'
                        }`}
                      >
                        {msg.text}
                      </div>

                      {/* Message footer */}
                      <div className={`flex items-center gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-[#4B5563]">{formatTime(msg.timestamp)}</span>

                        {/* TTS button — only on assistant messages */}
                        {msg.role === 'assistant' && ttsSupported && (
                          <button
                            onClick={() =>
                              speakingId === msg.timestamp
                                ? stopSpeaking()
                                : speak(msg.text, msg.timestamp)
                            }
                            aria-label={speakingId === msg.timestamp ? 'Stop speaking' : 'Read aloud'}
                            className="p-1 rounded text-[#4B5563] hover:text-amber-400 transition-colors"
                          >
                            {speakingId === msg.timestamp ? (
                              <VolumeX className="w-3 h-3" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* User avatar */}
                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 text-amber-400 font-bold text-xs">
                        U
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-[#20232B] border border-amber-500/8">
                      <div className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* ── Mic error ── */}
              {micError && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {micError}
                </div>
              )}

              {/* ── Recording indicator ── */}
              {isRecording && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-amber-400 text-xs font-medium">Listening... Speak now</span>
                </div>
              )}

              {/* ── Safety notice ── */}
              <div className="mx-4 mb-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-500/5">
                <ShieldCheck className="w-3 h-3 text-amber-500/60 shrink-0" />
                <span className="text-[10px] text-[#4B5563]">Never share OTPs, passwords, or banking details</span>
              </div>

              {/* ── Input area ── */}
              <div className="px-4 pb-4 shrink-0">
                <div className="flex items-center gap-2 bg-[#20232B] border border-amber-500/15 rounded-xl px-3 py-2 focus-within:border-amber-500/40 transition-colors">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isRecording ? 'Listening...' : 'Type or speak your message...'}
                    disabled={loading || isRecording}
                    aria-label="Chat message input"
                    className="flex-1 bg-transparent text-sm text-[#F8FAFC] placeholder:text-[#4B5563] focus:outline-none disabled:opacity-50 min-w-0"
                  />

                  {/* Mic button — always show, with fallback message for unsupported browsers */}
                  <button
                    onClick={
                      !voiceSupported
                        ? () => setMicError('Voice input requires Chrome or Edge browser.')
                        : isRecording
                        ? stopRecording
                        : startRecording
                    }
                    disabled={loading}
                    aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                    title={!voiceSupported ? 'Voice input requires Chrome or Edge' : isRecording ? 'Stop recording' : 'Voice input'}
                    className={`p-1.5 rounded-lg transition-all ${
                      isRecording
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse'
                        : !voiceSupported
                        ? 'text-[#4B5563] cursor-not-allowed'
                        : 'text-[#9CA3AF] hover:text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  {/* Send button */}
                  <button
                    onClick={() => void send(input)}
                    disabled={loading || !input.trim()}
                    aria-label="Send message"
                    className="p-1.5 rounded-lg bg-amber-500 text-[#111318] hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
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
