// Messo CLI — email infrastructure for AI agents

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MessoClient } from "./index.js";
import type { MessoConfig } from "./types.js";

// ─── Config ────────────────────────────────────────────

const CONFIG_PATH = join(process.cwd(), ".messo.json");

interface MessoFileConfig extends MessoConfig {
  domain?: string;
  database_id?: string;
}

async function loadConfig(): Promise<MessoFileConfig> {
  if (!existsSync(CONFIG_PATH)) {
    console.error("No .messo.json found. Run `messo init` first.");
    process.exit(1);
  }
  const raw = await readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

async function saveConfig(config: MessoFileConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function client(config: MessoFileConfig): MessoClient {
  return new MessoClient({ apiUrl: config.apiUrl, apiKey: config.apiKey });
}

// ─── Helpers ───────────────────────────────────────────

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function flagBool(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function positionals(args: string[]): string[] {
  return args.filter((a) => !a.startsWith("--"));
}

function generateApiKey(): string {
  return randomBytes(24).toString("hex");
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Commands ──────────────────────────────────────────

async function cmdInit(args: string[]): Promise<void> {
  if (existsSync(CONFIG_PATH)) {
    console.log(".messo.json already exists.");
    return;
  }

  const domain = flag(args, "domain");
  const apiUrl = flag(args, "api-url") || "";
  const apiKey = flag(args, "api-key") || generateApiKey();

  console.log("\n  Messo — initializing config\n");

  const config: MessoFileConfig = {
    apiUrl: apiUrl || "https://messo.YOUR-SUBDOMAIN.workers.dev",
    apiKey,
    domain: domain || "yourdomain.com",
  };

  await saveConfig(config);
  console.log(`  ✓ Created .messo.json`);
  console.log(`  ✓ API key: ${apiKey}`);
  console.log(`\n  Next: run \`messo setup\` to deploy the backend.\n`);
}

async function cmdSetup(args: string[]): Promise<void> {
  const config = await loadConfig();

  if (!config.domain || config.domain === "yourdomain.com") {
    console.error("Set your domain in .messo.json first.");
    process.exit(1);
  }

  console.log("\n  Messo — deploying backend to Cloudflare\n");
  console.log(`  Domain: ${config.domain}`);

  const workerDir = join(new URL("..", import.meta.url).pathname, "worker");

  // Step 1: Create D1 database
  console.log("\n  [1/4] Creating D1 database...");
  try {
    const output = execSync("npx wrangler d1 create messo-db", {
      cwd: workerDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const idMatch = output.match(/database_id\s*=\s*"([^"]+)"/);
    if (idMatch) {
      config.database_id = idMatch[1];
      console.log(`  ✓ Database ID: ${config.database_id}`);
    }
  } catch {
    // Database might already exist
    console.log("  ⚠ Database may already exist. Check wrangler.toml manually.");
  }

  // Step 2: Write wrangler.toml
  console.log("\n  [2/4] Writing wrangler.toml...");
  const toml = [
    `name = "messo"`,
    `main = "src/index.ts"`,
    `compatibility_date = "2024-09-01"`,
    ``,
    `[[d1_databases]]`,
    `binding = "DB"`,
    `database_name = "messo-db"`,
    `database_id = "${config.database_id || "FILL_ME_IN"}"`,
    ``,
    `[vars]`,
    `DOMAIN = "${config.domain}"`,
    `API_KEY = "${config.apiKey}"`,
    ``,
  ].join("\n");
  await writeFile(join(workerDir, "wrangler.toml"), toml);
  console.log("  ✓ wrangler.toml written");

  // Step 3: Apply schema
  console.log("\n  [3/4] Applying database schema...");
  try {
    execSync('npx wrangler d1 execute messo-db --remote --file=schema.sql', {
      cwd: workerDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log("  ✓ Schema applied");
  } catch {
    console.log("  ⚠ Schema apply failed. Run manually in worker/ directory.");
  }

  // Step 4: Deploy
  console.log("\n  [4/4] Deploying worker...");
  try {
    const output = execSync("npx wrangler deploy", {
      cwd: workerDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/);
    if (urlMatch) {
      config.apiUrl = urlMatch[0];
      console.log(`  ✓ Deployed: ${config.apiUrl}`);
    }
  } catch {
    console.log("  ⚠ Deploy failed. Run `npx wrangler deploy` in worker/ directory.");
  }

  await saveConfig(config);
  console.log(`\n  ✓ Config saved to .messo.json`);
  console.log(`\n  ── Email Routing Setup ──`);
  console.log(`  1. Go to Cloudflare Dashboard → ${config.domain} → Email → Email Routing`);
  console.log(`  2. Enable Email Routing (add MX records)`);
  console.log(`  3. Add a Catch-All rule → Send to Worker → "messo"`);
  console.log(`  4. Run: messo claim my-agent\n`);
}

async function cmdClaim(args: string[]): Promise<void> {
  const config = await loadConfig();
  const c = client(config);
  const name = positionals(args)[0];

  if (!name) {
    console.error("Usage: messo claim <agent-name>");
    process.exit(1);
  }

  const mailbox = await c.claim({ agent_name: name });
  console.log(`\n  ✓ Claimed: ${mailbox.address}`);
  console.log(`  ID: ${mailbox.id}\n`);
}

async function cmdList(): Promise<void> {
  const config = await loadConfig();
  const c = client(config);
  const mailboxes = await c.listMailboxes();

  if (mailboxes.length === 0) {
    console.log("\n  No mailboxes. Run `messo claim <name>`.\n");
    return;
  }

  console.log("\n  Mailboxes:\n");
  for (const mb of mailboxes) {
    console.log(`  ${mb.address}`);
    console.log(`    agent: ${mb.agent_name}  id: ${mb.id}`);
    console.log("");
  }
}

async function cmdInbox(args: string[]): Promise<void> {
  const config = await loadConfig();
  const c = client(config);
  const unread = flagBool(args, "unread");
  const mailboxes = await c.listMailboxes();

  if (mailboxes.length === 0) {
    console.log("\n  No mailboxes.\n");
    return;
  }

  for (const mb of mailboxes) {
    const result = await c.inbox(mb.id, { unread, limit: 10 });
    if (result.emails.length === 0) continue;

    console.log(`\n  ── ${mb.address} ──\n`);
    for (const e of result.emails) {
      const marker = e.is_read ? " " : "●";
      const from = e.from_name || e.from;
      console.log(`  ${marker} ${e.subject}`);
      console.log(`    ${from} · ${relTime(e.received_at)}`);
      if (e.preview) {
        const preview = e.preview.slice(0, 80).replace(/\n/g, " ");
        console.log(`    ${preview}${e.preview.length > 80 ? "…" : ""}`);
      }
      console.log(`    id: ${e.id}`);
      console.log("");
    }
  }
}

async function cmdRead(args: string[]): Promise<void> {
  const config = await loadConfig();
  const c = client(config);
  const id = positionals(args)[0];

  if (!id) {
    console.error("Usage: messo read <email-id>");
    process.exit(1);
  }

  const email = await c.getEmail(id);
  console.log(`\n  From: ${email.from_name || email.from}`);
  console.log(`  To: ${email.to}`);
  console.log(`  Subject: ${email.subject}`);
  console.log(`  Date: ${relTime(email.received_at)}\n`);
  console.log("  " + "-".repeat(60) + "\n");

  const text = email.text || "(no text body)";
  for (const line of text.split("\n")) {
    console.log(`  ${line}`);
  }
  console.log("");
}

async function cmdSearch(args: string[]): Promise<void> {
  const config = await loadConfig();
  const c = client(config);
  const query = positionals(args).join(" ");

  if (!query) {
    console.error("Usage: messo search <query>");
    process.exit(1);
  }

  const result = await c.search(query);
  if (result.results.length === 0) {
    console.log(`\n  No results for "${query}".\n`);
    return;
  }

  console.log(`\n  Results for "${query}":\n`);
  for (const e of result.results) {
    console.log(`  ${e.subject}`);
    console.log(`    ${e.from} · ${relTime(e.received_at)}`);
    console.log(`    id: ${e.id}\n`);
  }
}

async function cmdSend(args: string[]): Promise<void> {
  const config = await loadConfig();
  const c = client(config);
  const to = flag(args, "to");
  const subject = flag(args, "subject");
  const body = flag(args, "body");

  if (!to || !subject || !body) {
    console.error("Usage: messo send --to <addr> --subject <text> --body <text>");
    process.exit(1);
  }

  const mailboxes = await c.listMailboxes();
  if (mailboxes.length === 0) {
    console.error("No mailboxes. Run `messo claim <name>` first.");
    process.exit(1);
  }

  // Use first mailbox by default
  const mb = mailboxes[0];
  const result = await c.send(mb.id, { to, subject, body });
  console.log(`\n  ✓ Sent from ${mb.address} to ${to}`);
  console.log(`  ID: ${result.id}\n`);
}

function cmdHelp(): void {
  console.log(`
  messo — email infrastructure for AI agents

  Usage:
    messo init [--domain <domain>]     Create .messo.json config
    messo setup                        Deploy backend to Cloudflare
    messo claim <agent-name>           Claim a mailbox for an agent
    messo list                         List all mailboxes
    messo inbox [--unread]             Check inbox across all mailboxes
    messo read <email-id>              Read a specific email
    messo search <query>               Search emails
    messo send --to <addr>             Send an email
           --subject <text> --body <text>

  Options:
    --config <path>   Use a specific config file (default: ./.messo.json)
`);
}

// ─── Entry ─────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);

const commands: Record<string, (args: string[]) => Promise<void> | void> = {
  init: cmdInit,
  setup: cmdSetup,
  claim: cmdClaim,
  list: cmdList,
  inbox: cmdInbox,
  read: cmdRead,
  search: cmdSearch,
  send: cmdSend,
  help: cmdHelp,
  "--help": cmdHelp,
  "-h": cmdHelp,
};

const fn = commands[cmd];
if (!fn) {
  cmdHelp();
  process.exit(1);
}

try {
  const result = fn(rest);
  if (result instanceof Promise) {
    result.catch((err: Error) => {
      console.error(`\n  Error: ${err.message}\n`);
      process.exit(1);
    });
  }
} catch (err) {
  console.error(`\n  Error: ${(err as Error).message}\n`);
  process.exit(1);
}
