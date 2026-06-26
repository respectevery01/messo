import type { MessoClient } from "./client.js";

// ─── AI Tool Definitions ───────────────────────────────
//
// These are plain objects compatible with:
//   - Vercel AI SDK `tool()` from 'ai'
//   - LangChain `DynamicStructuredTool`
//   - Any framework that accepts { name, description, parameters, execute }
//
// Import the raw tool definitions and wrap with your framework,
// or use `messo.tools()` for the Vercel AI SDK pattern.

export interface ToolDef<TResult = unknown> {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (params: any) => Promise<TResult>;
}

export function createTools(client: MessoClient): Record<string, ToolDef> {
  return {
    check_inbox: {
      name: "check_inbox",
      description:
        "Check the email inbox for an agent. Returns recent emails with sender, subject, and preview.",
      parameters: {
        type: "object",
        properties: {
          mailbox_id: {
            type: "string",
            description: "The mailbox ID to check",
          },
          unread_only: {
            type: "boolean",
            description: "Only return unread emails",
            default: false,
          },
          limit: {
            type: "number",
            description: "Max emails to return (default 10)",
            default: 10,
          },
        },
        required: ["mailbox_id"],
      },
      execute: async (params: { mailbox_id: string; unread_only?: boolean; limit?: number }) => {
        const result = await client.inbox(params.mailbox_id, {
          unread: params.unread_only,
          limit: params.limit || 10,
        });
        return result.emails;
      },
    },

    read_email: {
      name: "read_email",
      description:
        "Read the full content of a specific email by ID. Returns the complete text and HTML body.",
      parameters: {
        type: "object",
        properties: {
          email_id: {
            type: "string",
            description: "The email ID to read",
          },
        },
        required: ["email_id"],
      },
      execute: async (params: { email_id: string }) => {
        return await client.getEmail(params.email_id);
      },
    },

    search_inbox: {
      name: "search_inbox",
      description:
        "Search emails across all mailboxes or within a specific mailbox. Useful for finding OTP codes, verification links, or specific messages.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (keyword or phrase)",
          },
          mailbox_id: {
            type: "string",
            description: "Optional: limit search to a specific mailbox",
          },
        },
        required: ["query"],
      },
      execute: async (params: { query: string; mailbox_id?: string }) => {
        const result = await client.search(params.query, params.mailbox_id);
        return result.results;
      },
    },

    send_email: {
      name: "send_email",
      description: "Send an email from a mailbox on behalf of an agent.",
      parameters: {
        type: "object",
        properties: {
          mailbox_id: {
            type: "string",
            description: "The mailbox ID to send from",
          },
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body (plain text)",
          },
        },
        required: ["mailbox_id", "to", "subject", "body"],
      },
      execute: async (params: {
        mailbox_id: string;
        to: string;
        subject: string;
        body: string;
      }) => {
        return await client.send(params.mailbox_id, {
          to: params.to,
          subject: params.subject,
          body: params.body,
        });
      },
    },
  };
}
