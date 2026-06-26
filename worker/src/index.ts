import PostalMime from "postal-mime";

// ─── Types ─────────────────────────────────────────────

interface MailboxRow {
  id: string;
  address: string;
  agent_name: string;
  webhook_url: string;
  webhook_secret: string;
  created_at: number;
}

interface EmailRow {
  id: string;
  mailbox_id: string;
  from_address: string;
  from_name: string;
  to_address: string;
  subject: string;
  text_body: string;
  html_body: string;
  raw_size: number;
  received_at: number;
  is_read: number;
}

export interface Env {
  DB: D1Database;
  DOMAIN: string;
  API_KEY: string;
}

// ─── Webhook Delivery ──────────────────────────────────

async function fireWebhook(
  mailbox: MailboxRow,
  emailSummary: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<void> {
  if (!mailbox.webhook_url) return;

  const payload = {
    event: "email.received",
    mailbox_id: mailbox.id,
    address: mailbox.address,
    email: emailSummary,
    timestamp: Date.now(),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Messo-Webhook/1.0",
  };

  // HMAC-SHA256 signature if secret is set
  if (mailbox.webhook_secret) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(mailbox.webhook_secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(JSON.stringify(payload))
    );
    const hex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    headers["X-Messo-Signature"] = `sha256=${hex}`;
  }

  // Fire-and-forget via waitUntil
  ctx.waitUntil(
    fetch(mailbox.webhook_url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }).catch(() => {
      // Swallow webhook errors — email is already stored
    })
  );
}

// ─── Helpers ───────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function uuid(): string {
  return crypto.randomUUID();
}

function authed(request: Request, env: Env): boolean {
  if (!env.API_KEY) return true;
  const header = request.headers.get("Authorization");
  return header === `Bearer ${env.API_KEY}`;
}

function route(path: string, prefix: string): { match: boolean; rest?: string } {
  if (path === prefix) return { match: true };
  if (path.startsWith(prefix + "/")) return { match: true, rest: path.slice(prefix.length + 1) };
  return { match: false };
}

// ─── Inbound Email Handler ─────────────────────────────

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // Find the destination mailbox
    const mailbox = await env.DB.prepare(
      "SELECT * FROM mailboxes WHERE address = ?"
    )
      .bind(message.to)
      .first<MailboxRow>();

    if (!mailbox) {
      message.setReject("Mailbox not found");
      return;
    }

    // Parse raw MIME
    const rawBuf = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(rawBuf);

    const id = uuid();
    const ts = Date.now();
    await env.DB.prepare(
      `INSERT INTO emails (id, mailbox_id, from_address, from_name, to_address, subject, text_body, html_body, raw_size, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        mailbox.id,
        message.from,
        parsed.from?.name || "",
        message.to,
        parsed.subject || "(no subject)",
        parsed.text || "",
        parsed.html || "",
        message.rawSize,
        ts
      )
      .run();

    // Fire webhook if configured
    await fireWebhook(mailbox, {
      id,
      from: message.from,
      from_name: parsed.from?.name || "",
      to: message.to,
      subject: parsed.subject || "(no subject)",
      preview: (parsed.text || "").slice(0, 200),
      received_at: ts,
    }, ctx);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (!authed(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── Health ──────────────────────────────────────────
    if (path === "/" || path === "/health") {
      return json({ status: "ok", service: "messo", domain: env.DOMAIN });
    }

    // ── Mailboxes ───────────────────────────────────────

    if (path === "/api/mailboxes") {
      // List
      if (method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM mailboxes ORDER BY created_at DESC"
        ).all<MailboxRow>();
        return json(result.results);
      }

      // Create / claim
      if (method === "POST") {
        const body = await request.json<{
          agent_name: string;
          address?: string;
        }>();

        if (!body.agent_name) {
          return json({ error: "agent_name is required" }, 400);
        }

        const id = uuid();
        const address = body.address || `${body.agent_name}@${env.DOMAIN}`;

        try {
          await env.DB.prepare(
            "INSERT INTO mailboxes (id, address, agent_name) VALUES (?, ?, ?)"
          )
            .bind(id, address, body.agent_name)
            .run();
        } catch {
          return json({ error: "Address already claimed" }, 409);
        }

        return json({ id, address, agent_name: body.agent_name, created_at: Date.now() }, 201);
      }
    }

    // Single mailbox: /api/mailboxes/:id
    const mbRoute = route(path, "/api/mailboxes");
    if (mbRoute.match && mbRoute.rest) {
      const segments = mbRoute.rest.split("/");
      const mailboxId = segments[0];
      const subResource = segments[1]; // "emails" | undefined

      // ── Emails within mailbox ─────────────────────────
      if (subResource === "emails") {
        if (method === "GET") {
          const page = parseInt(url.searchParams.get("page") || "1");
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
          const unreadOnly = url.searchParams.get("unread") === "true";
          const offset = (page - 1) * limit;

          const where = unreadOnly
            ? "WHERE mailbox_id = ? AND is_read = 0"
            : "WHERE mailbox_id = ?";
          const result = await env.DB.prepare(
            `${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`
          )
            .bind(mailboxId, limit, offset)
            .all<EmailRow>();

          const emails = result.results?.map(toSummary) || [];
          return json({ page, limit, emails });
        }

        // Send email from this mailbox
        if (method === "POST") {
          const body = await request.json<{
            to: string;
            subject: string;
            body: string;
            html?: string;
          }>();

          // Get the mailbox address for "from"
          const mailbox = await env.DB.prepare(
            "SELECT address FROM mailboxes WHERE id = ?"
          )
            .bind(mailboxId)
            .first<{ address: string }>();

          if (!mailbox) {
            return json({ error: "Mailbox not found" }, 404);
          }

          // Store as sent email
          const emailId = uuid();
          await env.DB.prepare(
            `INSERT INTO emails (id, mailbox_id, from_address, to_address, subject, text_body, html_body, received_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              emailId,
              mailboxId,
              mailbox.address,
              body.to,
              body.subject,
              body.body,
              body.html || "",
              Date.now()
            )
            .run();

          // Try to send via CF email service (if available)
          // Falls back gracefully — email is stored regardless
          return json({ id: emailId, status: "stored", from: mailbox.address }, 201);
        }
      }

      // Webhook management: /api/mailboxes/:id/webhook
      if (subResource === "webhook" && method === "PUT") {
        const body = await request.json<{
          url: string;
          secret?: string;
        }>();

        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }

        await env.DB.prepare(
          "UPDATE mailboxes SET webhook_url = ?, webhook_secret = ? WHERE id = ?"
        )
          .bind(body.url, body.secret || "", mailboxId)
          .run();

        return json({ status: "webhook_updated", url: body.url });
      }

      // Single mailbox operations
      if (!subResource) {
        if (method === "GET") {
          const mb = await env.DB.prepare("SELECT * FROM mailboxes WHERE id = ?")
            .bind(mailboxId)
            .first<MailboxRow>();
          if (!mb) return json({ error: "Not found" }, 404);
          return json(mb);
        }

        if (method === "DELETE") {
          await env.DB.prepare("DELETE FROM mailboxes WHERE id = ?")
            .bind(mailboxId)
            .run();
          return json({ status: "deleted" });
        }
      }
    }

    // ── Single email ────────────────────────────────────
    const emailRoute = route(path, "/api/emails");
    if (emailRoute.match && emailRoute.rest) {
      const emailId = emailRoute.rest.split("/")[0];

      if (method === "GET") {
        const email = await env.DB.prepare("SELECT * FROM emails WHERE id = ?")
          .bind(emailId)
          .first<EmailRow>();
        if (!email) return json({ error: "Not found" }, 404);

        // Mark as read
        await env.DB.prepare("UPDATE emails SET is_read = 1 WHERE id = ?")
          .bind(emailId)
          .run();

        return json(toFull(email));
      }

      if (method === "DELETE") {
        await env.DB.prepare("DELETE FROM emails WHERE id = ?")
          .bind(emailId)
          .run();
        return json({ status: "deleted" });
      }

      if (method === "PATCH") {
        const body = await request.json<{ is_read?: boolean }>();
        if (typeof body.is_read === "boolean") {
          await env.DB.prepare("UPDATE emails SET is_read = ? WHERE id = ?")
            .bind(body.is_read ? 1 : 0, emailId)
            .run();
        }
        return json({ status: "updated" });
      }
    }

    // ── Search ──────────────────────────────────────────
    if (path === "/api/search" && method === "GET") {
      const q = url.searchParams.get("q") || "";
      const mailboxId = url.searchParams.get("mailbox_id");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

      if (!q) return json({ error: "Query parameter 'q' is required" }, 400);

      const pattern = `%${q}%`;
      const where = mailboxId
        ? "WHERE mailbox_id = ? AND (subject LIKE ? OR text_body LIKE ? OR from_address LIKE ?)"
        : "WHERE subject LIKE ? OR text_body LIKE ? OR from_address LIKE ?";
      const binds = mailboxId
        ? [mailboxId, pattern, pattern, pattern, limit]
        : [pattern, pattern, pattern, limit];

      const result = await env.DB.prepare(
        `${where} ORDER BY received_at DESC LIMIT ?`
      )
        .bind(...binds)
        .all<EmailRow>();

      return json({ query: q, results: (result.results || []).map(toSummary) });
    }

    return json({ error: "Not found" }, 404);
  },
};

// ─── Mappers ───────────────────────────────────────────

function toSummary(e: EmailRow) {
  return {
    id: e.id,
    mailbox_id: e.mailbox_id,
    from: e.from_address,
    from_name: e.from_name,
    subject: e.subject,
    preview: (e.text_body || "").slice(0, 200),
    received_at: e.received_at,
    is_read: e.is_read === 1,
  };
}

function toFull(e: EmailRow) {
  return {
    id: e.id,
    mailbox_id: e.mailbox_id,
    from: e.from_address,
    from_name: e.from_name,
    to: e.to_address,
    subject: e.subject,
    text: e.text_body,
    html: e.html_body,
    raw_size: e.raw_size,
    received_at: e.received_at,
    is_read: e.is_read === 1,
  };
}
