import type {
  ScanResult,
  ScamWarningSign,
  SuspiciousPhrase,
  ScamStage,
  RiskLevel,
  CompanyVerificationResult,
} from '../types';

interface AnalyzeInput {
  inputType: 'job_post' | 'chat' | 'offer_letter';
  text: string;
  companyName?: string;
  jobUrl?: string;
  platform?: string;
  extractionMethod?: 'pdf' | 'ocr' | 'text';
}

const KNOWN_LEGIT_COMPANIES = ['tcs', 'wipro', 'infosys', 'accenture', 'hcl', 'ibm', 'cognizant', 'capgemini', 'tech mahindra', 'amazon', 'google', 'microsoft'];

const KEYWORD_WARNINGS: Array<{
  keywords: string[];
  warning: ScamWarningSign;
  scoreAdd: number;
  stage: ScamStage;
}> = [
  {
    keywords: ['deposit', 'pay ₹', 'registration fee', 'wallet activation'],
    warning: {
      id: 'w-deposit',
      label: 'Upfront Deposit Required',
      description: 'The offer requires payment before work can begin. Legitimate jobs never charge workers.',
      severity: 'high',
    },
    scoreAdd: 30,
    stage: 'deposit_demand',
  },
  {
    keywords: ['unlock'],
    warning: {
      id: 'w-unlock',
      label: 'Pay-to-Unlock Task Pattern',
      description: 'Asking you to pay to unlock tasks or earnings is a classic scam tactic.',
      severity: 'high',
    },
    scoreAdd: 25,
    stage: 'prepaid_task_escalation',
  },
  {
    keywords: ['prepay', 'pre-pay', 'prepaid'],
    warning: {
      id: 'w-prepay',
      label: 'Prepayment Demand',
      description: 'Requiring prepayment before tasks or earnings are released is a known fraud pattern.',
      severity: 'high',
    },
    scoreAdd: 30,
    stage: 'prepaid_task_escalation',
  },
  {
    keywords: ['telegram'],
    warning: {
      id: 'w-telegram',
      label: 'Move to Private Channel',
      description: 'Directing communication to Telegram avoids accountability and is a common scam tactic.',
      severity: 'medium',
    },
    scoreAdd: 20,
    stage: 'trust_building',
  },
  {
    keywords: ['whatsapp only', 'whatsapp number'],
    warning: {
      id: 'w-whatsapp',
      label: 'WhatsApp-Only Communication',
      description: 'Legitimate recruiters use official company email. WhatsApp-only contact is a red flag.',
      severity: 'medium',
    },
    scoreAdd: 15,
    stage: 'trust_building',
  },
  {
    keywords: ['earn ₹', 'earning ₹'],
    warning: {
      id: 'w-earn',
      label: 'Unrealistic Earning Claim',
      description: 'Promises of unusually high daily earnings are used to attract and deceive victims.',
      severity: 'medium',
    },
    scoreAdd: 15,
    stage: 'initial_attraction',
  },
  {
    keywords: ['daily', 'per day'],
    warning: {
      id: 'w-daily',
      label: 'Daily Earnings Bait',
      description: 'Framing income as high daily amounts inflates perception of earnings to lure victims.',
      severity: 'low',
    },
    scoreAdd: 10,
    stage: 'initial_attraction',
  },
  {
    keywords: ['home', 'work from home', 'wfh', 'from home'],
    warning: {
      id: 'w-wfh',
      label: 'Unverified WFH Claim',
      description: 'Fake WFH job offers are a very common scam vector, especially with high salary claims.',
      severity: 'low',
    },
    scoreAdd: 5,
    stage: 'initial_attraction',
  },
  {
    keywords: ['liking', 'like videos', 'like posts'],
    warning: {
      id: 'w-liking',
      label: 'Paid Social Media Liking Task',
      description: 'No legitimate company pays for liking videos or posts. This is always a scam.',
      severity: 'high',
    },
    scoreAdd: 35,
    stage: 'small_task_payment',
  },
  {
    keywords: ['simple task', 'easy task', 'simple work'],
    warning: {
      id: 'w-simple',
      label: 'Vague Simple Task Description',
      description: 'Vague "simple task" job descriptions are used to attract victims without revealing the scam.',
      severity: 'medium',
    },
    scoreAdd: 15,
    stage: 'initial_attraction',
  },
  {
    keywords: ['withdraw', 'withdrawal fee', 'withdrawal blocked'],
    warning: {
      id: 'w-withdraw',
      label: 'Withdrawal Restriction Pattern',
      description: 'Blocking withdrawals unless more money is paid is a classic deposit-to-withdraw scam.',
      severity: 'high',
    },
    scoreAdd: 30,
    stage: 'withdrawal_blockage',
  },
];

// ── Offer-letter specific keyword warnings ────────────────────────────────
const OFFER_LETTER_WARNINGS: Array<{
  keywords: string[];
  warning: ScamWarningSign;
  scoreAdd: number;
  stage: ScamStage;
}> = [
  {
    keywords: ['registration fee', 'registration charges', 'joining fee', 'joining charges'],
    warning: {
      id: 'ol-reg-fee',
      label: 'Registration / Joining Fee Demanded',
      description: 'Legitimate companies never charge candidates to join. Any registration or joining fee is a definitive scam signal.',
      severity: 'high',
    },
    scoreAdd: 40,
    stage: 'deposit_demand',
  },
  {
    keywords: ['training fee', 'training cost', 'training charges', 'training deposit'],
    warning: {
      id: 'ol-training-fee',
      label: 'Training Fee Demanded',
      description: 'Real employers pay you to train, they never charge you for it.',
      severity: 'high',
    },
    scoreAdd: 35,
    stage: 'deposit_demand',
  },
  {
    keywords: ['security deposit', 'security fee', 'refundable deposit', 'id card fee', 'kit fee', 'uniform fee', 'equipment fee', 'laptop deposit'],
    warning: {
      id: 'ol-security-deposit',
      label: 'Security / Equipment Deposit Required',
      description: 'Demanding a deposit before joining is a classic advance-fee fraud. Legitimate employers never require this.',
      severity: 'high',
    },
    scoreAdd: 35,
    stage: 'deposit_demand',
  },
  {
    keywords: ['document verification fee', 'verification charges', 'background check fee', 'bgv fee', 'police verification fee'],
    warning: {
      id: 'ol-doc-fee',
      label: 'Document Verification Fee',
      description: 'Background and document verification is always paid for by the employer, never the candidate.',
      severity: 'high',
    },
    scoreAdd: 35,
    stage: 'deposit_demand',
  },
  {
    keywords: ['pay before joining', 'pay before you join', 'deposit before joining', 'payment before joining', 'amount to be paid'],
    warning: {
      id: 'ol-pay-before',
      label: 'Payment Required Before Joining',
      description: 'Any payment demanded before your first day is a fraud. Stop all contact immediately.',
      severity: 'high',
    },
    scoreAdd: 40,
    stage: 'deposit_demand',
  },
  {
    keywords: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'rediffmail.com', 'ymail.com'],
    warning: {
      id: 'ol-personal-email',
      label: 'Personal / Free Email Domain Used',
      description: 'Genuine companies issue offer letters from official corporate email addresses (e.g. hr@company.com), never from Gmail, Yahoo or Hotmail.',
      severity: 'high',
    },
    scoreAdd: 30,
    stage: 'trust_building',
  },
  {
    keywords: ['accept within 24 hours', 'accept within 12 hours', 'respond within 24 hours', 'must accept today', 'respond immediately', 'accept by today', 'urgent joining', 'join within 2 days', 'join within 24 hours'],
    warning: {
      id: 'ol-urgency',
      label: 'Extreme Urgency / Pressure Tactics',
      description: 'Legitimate companies give candidates at least a week to review and accept an offer. Urgent deadlines are a manipulation tactic.',
      severity: 'high',
    },
    scoreAdd: 25,
    stage: 'trust_building',
  },
  {
    keywords: ['share otp', 'send otp', 'provide otp', 'bank account details', 'share bank account', 'net banking', 'upi id', 'share upi', 'aadhaar number', 'pan number', 'share pan', 'share aadhaar'],
    warning: {
      id: 'ol-sensitive-info',
      label: 'Requesting Sensitive Personal / Banking Information',
      description: 'No legitimate offer letter asks for OTPs, net banking credentials, or UPI IDs. This is identity theft or financial fraud.',
      severity: 'high',
    },
    scoreAdd: 45,
    stage: 'deposit_demand',
  },
  {
    keywords: ['no interview', 'without interview', 'selected without interview', 'direct selection', 'no test required', 'no assessment'],
    warning: {
      id: 'ol-no-interview',
      label: 'No Interview or Selection Process',
      description: 'Being selected with no interview, test, or formal process is a major red flag. Scammers do not screen — they just want your money.',
      severity: 'high',
    },
    scoreAdd: 25,
    stage: 'initial_attraction',
  },
  {
    keywords: ['10 lakh per month', '10,00,000 per month', '5 lakh per month', '50000 per week', '₹50000 per day', '₹1,00,000 per month entry level', 'earn unlimited', 'unlimited income'],
    warning: {
      id: 'ol-unrealistic-salary',
      label: 'Unrealistically High Salary for Entry-Level Role',
      description: 'Salaries far above market rate for entry-level positions are used to attract victims. Verify the CTC against industry benchmarks.',
      severity: 'medium',
    },
    scoreAdd: 20,
    stage: 'initial_attraction',
  },
  {
    keywords: ['work from home', 'wfh', 'remote job', 'home based job', 'part time online', 'online job from home'],
    warning: {
      id: 'ol-wfh-claim',
      label: 'Unverified Work-From-Home Claim',
      description: 'WFH offer letters without a verifiable company address are frequently used in job scams.',
      severity: 'low',
    },
    scoreAdd: 10,
    stage: 'initial_attraction',
  },
  {
    keywords: ['no cin', 'not registered', 'startup', 'newly established', 'newly incorporated'],
    warning: {
      id: 'ol-no-registration',
      label: 'Unregistered or Unverifiable Company',
      description: 'A company without a verifiable CIN or registered address on MCA21 should not be trusted with your personal information.',
      severity: 'medium',
    },
    scoreAdd: 15,
    stage: 'trust_building',
  },
  {
    keywords: ['bond amount', 'bond of ₹', 'bond payment', 'sign a bond', 'training bond', 'pay bond'],
    warning: {
      id: 'ol-bond',
      label: 'Suspicious Training Bond / Penalty Clause',
      description: 'Bonds requiring upfront payment or large financial penalties are coercive and often used to trap victims.',
      severity: 'medium',
    },
    scoreAdd: 20,
    stage: 'prepaid_task_escalation',
  },
];

const SUSPICIOUS_PHRASE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /pay\s*[₹rs\.]*\s*\d+/i,
    reason: 'Requesting payment of a specific amount before work begins.',
  },
  {
    pattern: /earn\s*[₹rs\.]*\s*\d+\s*(daily|per day|a day)/i,
    reason: 'Unrealistically high daily income claim used to attract victims.',
  },
  {
    pattern: /join.*telegram/i,
    reason: 'Moving to Telegram avoids accountability and is a common scam tactic.',
  },
  {
    pattern: /contact.*whatsapp.*only/i,
    reason: 'Legitimate recruiters use company email addresses, not personal WhatsApp.',
  },
  {
    pattern: /registration\s*fee/i,
    reason: 'Real employers never charge candidates to apply or start work.',
  },
  {
    pattern: /wallet\s*activation/i,
    reason: 'Wallet activation fees are a fabricated charge used to extract money from victims.',
  },
  {
    pattern: /unlock.*task/i,
    reason: 'Paying to unlock tasks is a hallmark of prepaid task scams.',
  },
  {
    pattern: /simple\s*task.*earn/i,
    reason: 'Vague simple task promises paired with high earnings are classic scam bait.',
  },
  // Offer-letter specific patterns
  {
    pattern: /(training|registration|security|joining|document|verification|kit|uniform|equipment)\s*(fee|charge|deposit|cost|amount)/i,
    reason: 'Legitimate employers never charge candidates fees of any kind before or after joining.',
  },
  {
    pattern: /pay\s*(before|prior to)\s*(joining|starting|onboarding)/i,
    reason: 'Payment demanded before joining is a definitive scam signal.',
  },
  {
    pattern: /(gmail|yahoo|hotmail|outlook|rediffmail)\.com/i,
    reason: 'Official offer letters are sent from company email domains, not free email services.',
  },
  {
    pattern: /accept\s*(within|by)\s*(24|12|48)\s*hours?/i,
    reason: 'Legitimate companies give candidates adequate time — artificial urgency is a pressure tactic.',
  },
  {
    pattern: /(share|send|provide|submit)\s*(your\s*)?(otp|bank\s*account|upi|aadhaar|pan\s*card|net\s*banking)/i,
    reason: 'Requesting banking credentials or OTPs in an offer letter is identity theft or financial fraud.',
  },
  {
    pattern: /ctc\s*(of\s*)?[₹rs\.]*\s*[1-9]\d\s*lakh\s*per\s*month/i,
    reason: 'A CTC of several lakhs per month for an entry-level role is unrealistic and likely fabricated.',
  },
  {
    pattern: /selected\s*without\s*(any\s*)?(interview|test|assessment)/i,
    reason: 'Selection without any screening is impossible at a legitimate company.',
  },
  {
    pattern: /refundable\s*(deposit|amount|fee)/i,
    reason: '"Refundable" deposits are never refunded — this is a common advance-fee fraud promise.',
  },
];

function detectSuspiciousPhrases(text: string): SuspiciousPhrase[] {
  const found: SuspiciousPhrase[] = [];
  const lowerText = text.toLowerCase();
  for (const { pattern, reason } of SUSPICIOUS_PHRASE_PATTERNS) {
    const match = lowerText.match(pattern);
    if (match) {
      found.push({ phrase: match[0], reason });
    }
  }
  return found;
}

function determineStage(stages: ScamStage[]): ScamStage {
  const priority: ScamStage[] = [
    'withdrawal_blockage',
    'deposit_demand',
    'prepaid_task_escalation',
    'small_task_payment',
    'trust_building',
    'initial_attraction',
  ];
  for (const s of priority) {
    if (stages.includes(s)) return s;
  }
  return 'initial_attraction';
}

function verifyCompanyQuick(companyName: string): CompanyVerificationResult {
  const lower = companyName.toLowerCase().trim();
  const isLegit = KNOWN_LEGIT_COMPANIES.some((c) => lower.includes(c));
  return {
    companyName,
    registryStatus: isLegit ? 'found' : 'unverified',
    domainStatus: isLegit ? 'verified' : 'not_checked',
    note: isLegit
      ? 'Known legitimate company — always verify offer letters on the official website.'
      : 'Company not found in known-legit list. Verify independently on MCA21 or the company website.',
  };
}

export function analyzeText(input: AnalyzeInput): ScanResult {
  const lowerText = input.text.toLowerCase();
  const detectedWarnings: ScamWarningSign[] = [];
  const detectedStages: ScamStage[] = [];
  let riskScore = 0;
  const addedWarningIds = new Set<string>();

  // ── Choose keyword set based on input type ────────────────────────
  const keywordSet =
    input.inputType === 'offer_letter'
      ? [...KEYWORD_WARNINGS, ...OFFER_LETTER_WARNINGS]
      : KEYWORD_WARNINGS;

  for (const { keywords, warning, scoreAdd, stage } of keywordSet) {
    if (keywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
      if (!addedWarningIds.has(warning.id)) {
        detectedWarnings.push(warning);
        addedWarningIds.add(warning.id);
        riskScore += scoreAdd;
        detectedStages.push(stage);
      }
    }
  }

  // ── For offer letters: apply baseline checks for missing legitimacy signals ──
  if (input.inputType === 'offer_letter' && input.text.length > 10) {
    const hasOfficialEmail = /[a-z0-9._%+-]+@(?!gmail|yahoo|hotmail|outlook|rediffmail)[a-z0-9.-]+\.[a-z]{2,}/i.test(input.text);
    const hasCIN = /[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}/i.test(input.text);
    const hasAddress = /(registered office|corporate office|head office|address\s*:)/i.test(input.text);
    const hasJobTitle = /(position|role|designation|post|job title)\s*[:\-]/i.test(input.text);
    const hasSalary = /(ctc|salary|compensation|package|lpa|per annum|per month)/i.test(input.text);

    if (!hasOfficialEmail && !addedWarningIds.has('ol-personal-email')) {
      detectedWarnings.push({
        id: 'ol-no-official-email',
        label: 'No Official Company Email Found',
        description: 'The document does not contain an official corporate email address. Legitimate offer letters always include an official company email.',
        severity: 'medium',
      });
      riskScore += 20;
      detectedStages.push('trust_building');
    }

    if (!hasCIN && !hasAddress) {
      detectedWarnings.push({
        id: 'ol-no-company-details',
        label: 'Missing Company Registration Details',
        description: 'No CIN number or registered office address found. Legitimate offer letters always include verifiable company details.',
        severity: 'medium',
      });
      riskScore += 15;
      detectedStages.push('trust_building');
    }

    // Incomplete document — very short or missing key fields
    if (!hasJobTitle && !hasSalary && input.text.length < 200) {
      detectedWarnings.push({
        id: 'ol-incomplete',
        label: 'Incomplete or Vague Offer Letter',
        description: 'This document is missing key details expected in a legitimate offer letter (job title, salary, company details). Incomplete offers are a red flag.',
        severity: 'medium',
      });
      riskScore += 20;
      detectedStages.push('initial_attraction');
    }
  }

  // Cap score at 100
  riskScore = Math.min(100, riskScore);

  const riskLevel: RiskLevel =
    riskScore >= 60 ? 'HIGH_RISK' : riskScore >= 25 ? 'SUSPICIOUS' : 'SAFE';

  const currentStage = determineStage(detectedStages);
  const suspiciousPhrases = detectSuspiciousPhrases(input.text);
  const companyVerification = input.companyName
    ? verifyCompanyQuick(input.companyName)
    : null;

  // ── Build summary ─────────────────────────────────────────────────
  let summary: string;
  if (input.inputType === 'offer_letter') {
    if (riskLevel === 'HIGH_RISK') {
      summary =
        'This offer letter contains multiple strong indicators of fraud. Do NOT pay any fees, share banking details, or sign any bond. Report to cybercrime.gov.in or call 1930 immediately.';
    } else if (riskLevel === 'SUSPICIOUS') {
      summary =
        'This offer letter has several suspicious characteristics. Verify the company independently on MCA21 (mca.gov.in) and never pay any money before your joining date.';
    } else {
      summary =
        'No major red flags detected in this offer letter. Still verify the company on MCA21, confirm the job role with the official HR email, and never pay any upfront fees.';
    }
  } else if (riskLevel === 'HIGH_RISK') {
    summary =
      'This offer matches multiple known scam patterns. High risk indicators detected — do not proceed, do not share personal information, and do not send any money. Report to cybercrime.gov.in or call 1930.';
  } else if (riskLevel === 'SUSPICIOUS') {
    summary =
      'Several suspicious characteristics were detected. While no definitive scam pattern was matched, exercise caution. Verify the company independently before proceeding.';
  } else {
    summary =
      'No major red flags detected in this offer. Always independently verify the company and never pay upfront fees before accepting any job.';
  }

  return {
    id: Date.now().toString(36),
    timestamp: Date.now(),
    inputType: input.inputType,
    riskLevel,
    riskScore,
    warningSignsDetected: detectedWarnings,
    suspiciousPhrases,
    currentStage,
    companyVerification,
    summary,
    isDemo: false,
  };
}
