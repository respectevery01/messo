# Messo

Open-source email infrastructure for AI agents.

Give your agents their own mailboxes — send, receive, search, and **parse** emails programmatically. Self-hosted on Cloudflare, zero vendor lock-in.

## Why Messo?

AI agents need email: OTP verification, account registration, notifications, report delivery. Existing solutions are either closed-source SaaS or bare-bones CLIs.

Messo is the **developer-first** alternative:

| | mails.dev | **Messo** |
|---|---|---|
| SDK | CLI only | **TypeScript SDK + CLI** |
| Email parsing | Raw text | **Structured JSON + intent detection** |
| Multi-mailbox | Single inbox | **Multiple agent mailboxes** |
| Deploy | Manual wrangler config | **One command: `messo setup`** |
| AI integration | None | **Pre-built tool definitions** |
| Hosting | Their server or DIY | **Self-hosted on your CF account** |

## Quick Start

```bash
# 1. Create config
npx messo init --domain yourdomain.com

# 2. Deploy backend to your Cloudflare account
npx messo setup

# 3. Claim a mailbox for your agent
npx messo claim my-agent
# → my-agent@yourdomain.com

# 4. Check inbox
npx messo inbox

# 5. Search for that OTP code
npx messo search "verification code"
```

## SDK Usage

```typescript
import { messo, parseEmail } from "messo";

const m = messo({
  apiUrl: "https://messo.your-subdomain.workers.dev",
  apiKey: "your-api-key",
});

// Claim a mailbox
const mailbox = await m.claim({ agent_name: "support-bot" });

// Check inbox
const { emails } = await m.inbox(mailbox.id);

// Read and parse an email
const email = await m.getEmail(emails[0].id);
const parsed = parseEmail(email);

console.log(parsed.intent);    // → "password_reset"
console.log(parsed.links);     // → ["https://example.com/reset?token=abc"]
console.log(parsed.actionItems); // → ["Click here to reset your password"]

// Send an email
await m.send(mailbox.id, {
  to: "user@example.com",
  subject: "Report ready",
  body: "Your weekly report is ready to download.",
});
```

## AI Tool Integration

Messo ships with pre-built tool definitions compatible with Vercel AI SDK, LangChain, and any framework that accepts `{ name, description, parameters, execute }`:

```typescript
import { messo } from "messo";

const m = messo({ apiUrl: "...", apiKey: "..." });
const tools = m.tools();

// tools.check_inbox   — "Check the email inbox for an agent"
// tools.read_email    — "Read the full content of a specific email"
// tools.search_inbox  — "Search emails (find OTP codes, verification links)"
// tools.send_email    — "Send an email from a mailbox"
```

### Vercel AI SDK

```typescript
import { tool } from "ai";
import { z } from "zod";

const messoTools = m.tools();
const aiTools = {
  check_inbox: tool({
    description: messoTools.check_inbox.description,
    parameters: z.object({ mailbox_id: z.string() }),
    execute: messoTools.check_inbox.execute,
  }),
};
```

### LangChain

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const checkInbox = new DynamicStructuredTool({
  name: messoTools.check_inbox.name,
  description: messoTools.check_inbox.description,
  schema: z.object({ mailbox_id: z.string() }),
  func: async ({ mailbox_id }) => JSON.stringify(
    await messoTools.check_inbox.execute({ mailbox_id })
  ),
});
```

## Email Parsing

The `parseEmail()` function extracts structured data from raw emails — no LLM needed, pure heuristics:

```typescript
const parsed = parseEmail(email);
// {
//   from: { address: "noreply@github.com", name: "GitHub" },
//   subject: "Reset your password",
//   preview: "Click the link below to reset...",
//   intent: "password_reset",
//   links: ["https://github.com/reset/abc123"],
//   actionItems: ["Click here to reset your password"]
// }
```

Detected intents: `password_reset`, `email_verification`, `welcome`, `notification`, `receipt`, `meeting_invite`, `newsletter`, `security_alert`, `reply`, `other`.

## Webhooks (Real-Time Delivery)

Don't poll — get notified instantly when emails arrive:

```typescript
// Register a webhook for push notifications
await m.setWebhook(mailbox.id, "https://your-agent.com/webhook", "webhook-secret");

// Your endpoint receives:
// POST /webhook
// X-Messo-Signature: sha256=<HMAC>
// { "event": "email.received", "email": { "id": "...", "from": "...", ... } }
```

The `X-Messo-Signature` header is HMAC-SHA256 of the body, keyed by your `webhook_secret`. Verify it on your end to prevent spoofing.

## Architecture

```
                    ┌─────────────┐
  Inbound Email ──→ │  CF Worker  │ ──→ D1 (SQLite)
  (Email Worker)    │  (messo)    │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  REST API   │ ←── SDK / CLI
                    └─────────────┘
```

- **Backend**: Cloudflare Worker (Email Workers for inbound, REST API for everything else)
- **Storage**: Cloudflare D1 (SQLite at the edge)
- **SDK**: TypeScript, zero dependencies, works in Node 18+ and browsers
- **CLI**: Single binary, zero dependencies

## Self-Hosting

Everything runs on **your** Cloudflare account. No third party sees your emails.

**Requirements:**
- Cloudflare account (free tier works)
- A domain configured on Cloudflare
- Node.js 18+

```bash
git clone https://github.com/respectevery01/messo.git
cd messo
npm install && npm run build
npm link  # makes `messo` command available globally

messo init --domain yourdomain.com
messo setup
```

After `messo setup`, enable Email Routing in your Cloudflare dashboard:
1. Dashboard → your domain → Email → Email Routing
2. Enable (adds MX records automatically)
3. Catch-All rule → Send to Worker → `messo`

## License

MIT © [Jask](https://github.com/respectevery01)
