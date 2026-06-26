CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  agent_name TEXT NOT NULL,
  webhook_url TEXT DEFAULT '',
  webhook_secret TEXT DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT DEFAULT '',
  to_address TEXT NOT NULL,
  subject TEXT DEFAULT '',
  text_body TEXT DEFAULT '',
  html_body TEXT DEFAULT '',
  raw_size INTEGER DEFAULT 0,
  received_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  is_read INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_unread ON emails(mailbox_id, is_read);
CREATE INDEX IF NOT EXISTS idx_emails_from ON emails(from_address);
