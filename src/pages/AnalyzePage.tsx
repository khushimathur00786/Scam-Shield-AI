import { useState, useRef, useEffect } from 'react';
import { Upload, AlertTriangle, CheckCircle, FileText, Edit3 } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ScanResult } from '../components/analysis/ScanResult';
import { analyzeContent } from '../api/analyze';
import type { ScanResult as ScanResultType } from '../types';

type InputTab = 'job_post' | 'chat' | 'offer_letter';
type Platform = 'telegram' | 'whatsapp' | 'other';

const LOADING_MESSAGES = [
  'Reading content…',
  'Extracting text from document…',
  'Checking scam patterns…',
  'Verifying company details…',
  'Generating report…',
];

const inputClass =
  'w-full bg-card/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-primary placeholder-muted focus:border-amber-500/50 focus:outline-none transition-colors';

interface AnalyzeSectionProps {
  onViewSafety?: () => void;
  onReport?: () => void;
}

export function AnalyzeSection({ onViewSafety, onReport }: AnalyzeSectionProps) {
  const [activeTab, setActiveTab] = useState<InputTab>('job_post');
  const [jobPostText, setJobPostText] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [chatText, setChatText] = useState('');
  const [platform, setPlatform] = useState<Platform>('telegram');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [result, setResult] = useState<ScanResultType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Offer letter extraction state
  const [extractionState, setExtractionState] = useState<'idle' | 'extracting' | 'done'>('idle');
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractedText, setExtractedText] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMsg((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 600);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Ping backend on mount so Render wakes up before user uploads
  useEffect(() => {
    fetch('/api/health').catch(() => { /* silent — just warming up */ });
  }, []);

  const handleAnalyze = async () => {
    setIsLoading(true);
    setLoadingMsg(0);
    setError(null);

    try {
      // ── Offer letter: extract text first, show preview, then analyze ──
      if (activeTab === 'offer_letter') {
        if (!uploadedFile) {
          setError('Please upload an offer letter file first.');
          setIsLoading(false);
          return;
        }

        // If text already extracted and confirmed, analyze directly
        if (extractionState === 'done' && extractedText.trim()) {
          const scanResult = await analyzeContent({
            inputType: 'offer_letter',
            text: extractedText,
            companyName: companyName || undefined,
          });
          setResult(scanResult);
          setIsLoading(false);
          return;
        }

        // Start extraction with progress simulation
        setExtractionState('extracting');
        setExtractionProgress(0);
        setIsLoading(false);

        const progressInterval = setInterval(() => {
          setExtractionProgress(prev => {
            if (prev >= 90) { clearInterval(progressInterval); return 90; }
            return prev + Math.floor(Math.random() * 15) + 5;
          });
        }, 400);

        try {
          const formData = new FormData();
          formData.append('file', uploadedFile);
          if (companyName) formData.append('companyName', companyName);

          // Use a 60 second timeout — Render free tier may take 30-50s to wake up
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 60000);

          const res = await fetch('/api/analyze/file', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          clearInterval(progressInterval);
          setExtractionProgress(100);

          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as { error?: string };
            setExtractionState('idle');
            setError(body.error ?? 'Text extraction failed. Please try a clearer image or PDF.');
            return;
          }

          const scanResult = await res.json() as ScanResultType & { extractedTextLength?: number };
          clearInterval(progressInterval);
          setExtractionProgress(100);

          // Show extracted text preview before displaying result
          // We'll show the result directly since backend already analyzed
          setExtractionState('done');
          setExtractedText(`Extracted ${scanResult.extractedTextLength ?? '?'} characters from document.`);
          setResult(scanResult);
        } catch (err) {
          clearInterval(progressInterval);
          setExtractionState('idle');
          if (err instanceof Error && err.name === 'AbortError') {
            setError('Request timed out. The server may be waking up — please wait 30 seconds and try again.');
          } else if (err instanceof Error && err.message.toLowerCase().includes('fetch')) {
            setError('Connection failed. Please check your internet and try again. If the problem persists, the server may be starting up — wait 30 seconds and retry.');
          } else {
            setError(err instanceof Error ? err.message : 'Extraction failed. Please try again.');
          }
        }
        return;
      }

      // ── Job post / chat: send text directly ───────────────────────
      const text = activeTab === 'job_post' ? jobPostText : chatText;

      const scanResult = await analyzeContent({
        inputType: activeTab,
        text,
        companyName: companyName || undefined,
        jobUrl: jobUrl || undefined,
        platform: activeTab === 'chat' ? platform : undefined,
      });
      setResult(scanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setJobPostText('');
    setCompanyName('');
    setJobUrl('');
    setChatText('');
    setUploadedFile(null);
    setIsLoading(false);
    setError(null);
    setExtractionState('idle');
    setExtractionProgress(0);
    setExtractedText('');
    setIsEditingText(false);
  };

  const canAnalyze =
    activeTab === 'job_post'
      ? jobPostText.trim().length > 0
      : activeTab === 'chat'
        ? chatText.trim().length > 0
        : uploadedFile !== null;

  const tabs: { id: InputTab; label: string }[] = [
    { id: 'job_post', label: 'Job Post' },
    { id: 'chat', label: 'Chat Conversation' },
    { id: 'offer_letter', label: 'Offer Letter' },
  ];

  if (result && !isLoading) {
    return (
      <ScanResult
        result={result}
        onAnalyzeAnother={handleReset}
        onViewSafety={onViewSafety ?? (() => {})}
        onReport={onReport ?? (() => {})}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-card rounded-xl">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setResult(null); setError(null); }}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              activeTab === id
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-muted hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'job_post' && (
        <div className="space-y-4">
          <textarea
            rows={8}
            className={`${inputClass} resize-none`}
            placeholder="Paste the job description here…&#10;&#10;Example: Earn ₹5000 daily from home, simple tasks, join our Telegram group, pay ₹500 to unlock your tasks…"
            value={jobPostText}
            onChange={(e) => setJobPostText(e.target.value)}
          />
          <input
            type="text"
            className={inputClass}
            placeholder="Company Name (optional)"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <input
            type="url"
            className={inputClass}
            placeholder="Job Application URL (optional)"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="space-y-4">
          <textarea
            rows={10}
            className={`${inputClass} resize-none`}
            placeholder={`Paste the conversation here…\n\nExample:\nRecruiter: Congratulations! You have been selected for our home-based job.\nYou: What is the work?\nRecruiter: Simple task of liking videos. Earn ₹500 per task.\nRecruiter: First pay ₹500 to activate your wallet and receive tasks.`}
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
          />
          <div className="flex gap-2">
            {(['telegram', 'whatsapp', 'other'] as Platform[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  platform === p
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'border-white/10 text-muted hover:text-primary hover:border-white/20'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'offer_letter' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => { fileRef.current?.click(); setExtractionState('idle'); setExtractedText(''); }}
            className="w-full border-2 border-dashed border-white/20 rounded-2xl p-12 text-center hover:border-amber-500/40 transition-colors cursor-pointer"
          >
            <Upload className="w-10 h-10 text-muted mx-auto mb-4" />
            {uploadedFile ? (
              <div>
                <div className="text-amber-400 font-medium">{uploadedFile.name}</div>
                <div className="text-muted text-xs mt-1">
                  {extractionState === 'done' ? 'Text extracted — click to change file' : 'File selected — click Analyze to continue'}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-primary font-medium mb-1">Drag and drop your offer letter</div>
                <div className="text-muted text-sm">Supports PDF, JPG, JPEG and PNG</div>
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => { setUploadedFile(e.target.files?.[0] ?? null); setExtractionState('idle'); setExtractedText(''); }}
          />

          {/* Extraction progress */}
          {extractionState === 'extracting' && (
            <div className="space-y-2 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                <Spinner size="sm" />
                Extracting text from offer letter...
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${extractionProgress}%` }}
                />
              </div>
              <div className="text-muted text-xs">Reading text from image... {extractionProgress}%</div>
            </div>
          )}

          {/* Extracted text preview */}
          {extractionState === 'done' && extractedText && !result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Text extracted successfully — ready to analyze!
              </div>
              <div className="bg-[#20232B] border border-amber-500/15 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted font-semibold uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" />
                  Extracted Text Preview
                </div>
                {isEditingText ? (
                  <textarea
                    rows={6}
                    value={extractedText}
                    onChange={e => setExtractedText(e.target.value)}
                    className="w-full bg-transparent text-xs text-[#D1D5DB] leading-relaxed focus:outline-none resize-none"
                  />
                ) : (
                  <p className="text-xs text-[#D1D5DB] leading-relaxed line-clamp-4">{extractedText}</p>
                )}
              </div>
              <button
                onClick={() => setIsEditingText(v => !v)}
                className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Edit3 className="w-3 h-3" />
                {isEditingText ? 'Done editing' : 'Edit extracted text manually'}
              </button>
            </div>
          )}

          <input
            type="text"
            className={inputClass}
            placeholder="Company Name (optional — helps with verification)"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Analyze button */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-4 py-6">
          <Spinner size="lg" />
          <p className="text-amber-400 text-sm animate-pulse">{LOADING_MESSAGES[loadingMsg]}</p>
        </div>
      ) : (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
        >
          Analyze for Scam
        </Button>
      )}
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <div className="min-h-screen flex flex-col bg-midnight">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-primary mb-3">Job Scam Analyzer</h1>
          <p className="text-muted">
            Paste a job post, chat conversation, or upload an offer letter to check for scam
            patterns.
          </p>
        </div>
        <AnalyzeSection />
      </main>
      <Footer />
    </div>
  );
}
