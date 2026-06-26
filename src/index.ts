// Messo — Open-source email infrastructure for AI agents

export { MessoClient } from "./client.js";
export { parseEmail } from "./parse.js";
export { createTools } from "./tools.js";
export type { ToolDef } from "./tools.js";

export type {
  MessoConfig,
  Mailbox,
  Email,
  EmailSummary,
  InboxResult,
  SearchResult,
  SendOptions,
  ClaimOptions,
  ParsedEmail,
  EmailIntent,
} from "./types.js";

// ─── Convenience Factory ───────────────────────────────

import { MessoClient } from "./client.js";
import { createTools } from "./tools.js";
import type { MessoConfig } from "./types.js";

export function messo(config: MessoConfig): MessoClient & {
  tools: () => ReturnType<typeof createTools>;
} {
  const client = new MessoClient(config);
  return Object.assign(client, {
    tools: () => createTools(client),
  });
}
