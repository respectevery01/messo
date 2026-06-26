import type { Email, ParsedEmail, EmailIntent } from "./types.js";

// ─── Intent Detection Patterns ─────────────────────────

const INTENT_PATTERNS: { intent: EmailIntent; patterns: RegExp[] }[] = [
  {
    intent: "password_reset",
    patterns: [
      /password\s*reset/i,
      /reset\s*your\s*password/i,
      /change\s*password/i,
      /forgot\s*password/i,
    ],
  },
  {
    intent: "email_verification",
    patterns: [
      /verify\s*(your|this)\s*email/i,
      /confirm\s*(your|this)\s*email/i,
      /email\s*verification/i,
      /activate\s*your\s*account/i,
    ],
  },
  {
    intent: "security_alert",
    patterns: [
      /security\s*alert/i,
      /suspicious\s*activity/i,
      /unauthorized\s*(access|login)/i,
      /new\s*(device|login)\s*(from|detected)/i,
      /2fa|two.factor/i,
    ],
  },
  {
    intent: "meeting_invite",
    patterns: [
      /calendar\s*invitation/i,
      /meeting\s*invitation/i,
      /invites?\s*you\s*to/i,
      /schedule(d)?\s*(a\s*)?meeting/i,
      /google\s*calendar/i,
      /zoom\s*meeting/i,
    ],
  },
  {
    intent: "receipt",
    patterns: [
      /receipt\s*(for|of)/i,
      /invoice\s*#/i,
      /payment\s*(received|confirmed)/i,
      /order\s*(confirmed|complete|receipt)/i,
      /purchase\s*receipt/i,
    ],
  },
  {
    intent: "welcome",
    patterns: [
      /welcome\s*to/i,
      /get\s*started/i,
      /glad\s*to\s*have\s*you/i,
    ],
  },
  {
    intent: "newsletter",
    patterns: [
      /unsubscribe/i,
      /this\s*week\s*in/i,
      /monthly\s*digest/i,
      /newsletter/i,
    ],
  },
  {
    intent: "notification",
    patterns: [
      /you\s*(have|got)\s*a\s*new/i,
      /new\s*(comment|mention|follower|like)/i,
      /mentioned\s*you/i,
      /just\s*(posted|shared|uploaded)/i,
    ],
  },
  {
    intent: "reply",
    patterns: [/^re:/i],
  },
];

function detectIntent(subject: string, text: string): EmailIntent {
  const combined = `${subject}\n${text.slice(0, 500)}`;
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(combined))) return intent;
  }
  return "other";
}

// ─── Link Extraction ───────────────────────────────────

function extractLinks(html: string, text: string): string[] {
  const links = new Set<string>();

  // From HTML href attributes
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1];
    if (url.startsWith("http")) links.add(url);
  }

  // From plain text URLs
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  while ((match = urlRegex.exec(text)) !== null) {
    links.add(match[0]);
  }

  return [...links];
}

// ─── Action Items ──────────────────────────────────────

function extractActionItems(text: string): string[] {
  const items: string[] = [];
  const lines = text.split(/\n/);

  const actionPatterns = [
    /^(?:please\s+|kindly\s+)?(?:click|tap|visit|go to|open)\b/i,
    /(?:verify|confirm|activate|reset|update|complete)\s+(?:your|this|the)\b/i,
    /(?:reply|respond)\s+(?:to|within)\b/i,
    /(?:download|install|sign\s+up|register|subscribe)\b/i,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    if (actionPatterns.some((p) => p.test(trimmed))) {
      items.push(trimmed);
      if (items.length >= 5) break;
    }
  }

  return items;
}

// ─── Public API ────────────────────────────────────────

export function parseEmail(email: Email): ParsedEmail {
  const subject = email.subject || "";
  const text = email.text || "";
  const html = email.html || "";

  const intent = detectIntent(subject, text);
  const links = extractLinks(html, text);
  const actionItems = extractActionItems(text);

  return {
    from: {
      address: email.from,
      name: email.from_name || undefined,
    },
    subject,
    preview: text.slice(0, 200),
    intent,
    links,
    actionItems,
  };
}
