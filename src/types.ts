// ─── Shared Types ──────────────────────────────────────

export interface Mailbox {
  id: string;
  address: string;
  agent_name: string;
  webhook_url?: string;
  created_at: number;
}

export interface EmailSummary {
  id: string;
  mailbox_id: string;
  from: string;
  from_name: string;
  subject: string;
  preview: string;
  received_at: number;
  is_read: boolean;
}

export interface Email extends EmailSummary {
  to: string;
  text: string;
  html: string;
  raw_size: number;
}

export interface InboxResult {
  page: number;
  limit: number;
  emails: EmailSummary[];
}

export interface SearchResult {
  query: string;
  results: EmailSummary[];
}

export interface SendOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface ClaimOptions {
  agent_name: string;
  address?: string;
}

export interface MessoConfig {
  apiUrl: string;
  apiKey?: string;
}

// ─── Email Parsing Types ───────────────────────────────

export type EmailIntent =
  | "password_reset"
  | "email_verification"
  | "welcome"
  | "notification"
  | "receipt"
  | "meeting_invite"
  | "newsletter"
  | "security_alert"
  | "reply"
  | "other";

export interface ParsedEmail {
  from: { address: string; name?: string };
  subject: string;
  preview: string;
  intent: EmailIntent;
  links: string[];
  actionItems: string[];
}
