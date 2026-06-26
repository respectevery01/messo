import type {
  MessoConfig,
  Mailbox,
  Email,
  EmailSummary,
  InboxResult,
  SearchResult,
  SendOptions,
  ClaimOptions,
} from "./types.js";

// ─── Messo Client ──────────────────────────────────────

export class MessoClient {
  private apiUrl: string;
  private apiKey?: string;

  constructor(config: MessoConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: this.headers(!!body),
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = (data as { error?: string }).error || `HTTP ${res.status}`;
      throw new Error(`Messo: ${msg}`);
    }

    return data as T;
  }

  // ── Mailboxes ────────────────────────────────────────

  async claim(opts: ClaimOptions): Promise<Mailbox> {
    return this.request("POST", "/api/mailboxes", opts);
  }

  async listMailboxes(): Promise<Mailbox[]> {
    return this.request("GET", "/api/mailboxes");
  }

  async getMailbox(id: string): Promise<Mailbox> {
    return this.request("GET", `/api/mailboxes/${id}`);
  }

  async deleteMailbox(id: string): Promise<void> {
    await this.request("DELETE", `/api/mailboxes/${id}`);
  }

  // ── Webhooks ─────────────────────────────────────────

  async setWebhook(mailboxId: string, url: string, secret?: string): Promise<void> {
    await this.request("PUT", `/api/mailboxes/${mailboxId}/webhook`, { url, secret });
  }

  // ── Emails ───────────────────────────────────────────

  async inbox(
    mailboxId: string,
    opts?: { page?: number; limit?: number; unread?: boolean }
  ): Promise<InboxResult> {
    const params = new URLSearchParams();
    if (opts?.page) params.set("page", String(opts.page));
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.unread) params.set("unread", "true");
    return this.request("GET", `/api/mailboxes/${mailboxId}/emails?${params}`);
  }

  async getEmail(id: string): Promise<Email> {
    return this.request("GET", `/api/emails/${id}`);
  }

  async deleteEmail(id: string): Promise<void> {
    await this.request("DELETE", `/api/emails/${id}`);
  }

  async markRead(id: string, isRead = true): Promise<void> {
    await this.request("PATCH", `/api/emails/${id}`, { is_read: isRead });
  }

  // ── Send ─────────────────────────────────────────────

  async send(mailboxId: string, opts: SendOptions): Promise<{ id: string; status: string }> {
    return this.request("POST", `/api/mailboxes/${mailboxId}/emails`, opts);
  }

  // ── Search ───────────────────────────────────────────

  async search(query: string, mailboxId?: string): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query });
    if (mailboxId) params.set("mailbox_id", mailboxId);
    return this.request("GET", `/api/search?${params}`);
  }
}
