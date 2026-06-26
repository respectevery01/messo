import { describe, test, expect } from "node:test";
import assert from "node:assert";
import { parseEmail } from "../src/parse.js";
import type { Email } from "../src/types.js";

// ─── Test Helpers ──────────────────────────────────────

function mockEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: "test-1",
    mailbox_id: "mb-1",
    from: "noreply@example.com",
    from_name: "Example",
    to: "agent@yourdomain.com",
    subject: "Test subject",
    text: "Hello world",
    html: "",
    raw_size: 100,
    received_at: Date.now(),
    is_read: false,
    ...overrides,
  };
}

// ─── Intent Detection Tests ────────────────────────────

describe("parseEmail — intent detection", () => {
  test("password_reset", () => {
    const e = mockEmail({
      subject: "Reset your password",
      text: "Click the link below to reset your password.",
    });
    assert.strictEqual(parseEmail(e).intent, "password_reset");
  });

  test("email_verification", () => {
    const e = mockEmail({
      subject: "Verify your email address",
      text: "Please confirm your email to activate your account.",
    });
    assert.strictEqual(parseEmail(e).intent, "email_verification");
  });

  test("security_alert", () => {
    const e = mockEmail({
      subject: "Security alert: new login",
      text: "We detected a new device login from Chrome.",
    });
    assert.strictEqual(parseEmail(e).intent, "security_alert");
  });

  test("meeting_invite", () => {
    const e = mockEmail({
      subject: "Calendar invitation: Sprint planning",
      text: "You are invited to a Zoom meeting.",
    });
    assert.strictEqual(parseEmail(e).intent, "meeting_invite");
  });

  test("receipt", () => {
    const e = mockEmail({
      subject: "Receipt for your order #12345",
      text: "Payment received. Your order is confirmed.",
    });
    assert.strictEqual(parseEmail(e).intent, "receipt");
  });

  test("welcome", () => {
    const e = mockEmail({
      subject: "Welcome to Platform!",
      text: "We're glad to have you. Here's how to get started.",
    });
    assert.strictEqual(parseEmail(e).intent, "welcome");
  });

  test("newsletter", () => {
    const e = mockEmail({
      subject: "This week in Tech — Issue #42",
      text: "Unsubscribe at any time. Here's your monthly digest.",
    });
    assert.strictEqual(parseEmail(e).intent, "newsletter");
  });

  test("notification", () => {
    const e = mockEmail({
      subject: "You have a new mention",
      text: "Someone mentioned you in a comment.",
    });
    assert.strictEqual(parseEmail(e).intent, "notification");
  });

  test("reply (Re: prefix)", () => {
    const e = mockEmail({
      subject: "Re: Project update",
      text: "Thanks for the update.",
    });
    assert.strictEqual(parseEmail(e).intent, "reply");
  });

  test("other (no match)", () => {
    const e = mockEmail({
      subject: "Random subject",
      text: "Just saying hello.",
    });
    assert.strictEqual(parseEmail(e).intent, "other");
  });
});

// ─── Link Extraction Tests ─────────────────────────────

describe("parseEmail — link extraction", () => {
  test("extracts links from HTML", () => {
    const e = mockEmail({
      html: '<a href="https://example.com/reset?token=abc">Reset</a>',
      text: "",
    });
    const parsed = parseEmail(e);
    assert.ok(parsed.links.includes("https://example.com/reset?token=abc"));
  });

  test("extracts links from text", () => {
    const e = mockEmail({
      text: "Visit https://example.com/verify?code=123 to verify.",
      html: "",
    });
    const parsed = parseEmail(e);
    assert.ok(parsed.links.some((l) => l.includes("example.com/verify")));
  });

  test("deduplicates links", () => {
    const e = mockEmail({
      text: "Visit https://example.com/page now. https://example.com/page again.",
      html: '<a href="https://example.com/page">link</a>',
    });
    const parsed = parseEmail(e);
    assert.strictEqual(parsed.links.length, 1);
  });

  test("returns empty array when no links", () => {
    const e = mockEmail({ text: "No links here.", html: "" });
    assert.deepStrictEqual(parseEmail(e).links, []);
  });
});

// ─── Action Items Tests ────────────────────────────────

describe("parseEmail — action items", () => {
  test("detects click/verify actions", () => {
    const e = mockEmail({
      text: "Please click the link below to verify your email.\nThank you.",
    });
    const parsed = parseEmail(e);
    assert.ok(parsed.actionItems.length >= 1);
    assert.ok(parsed.actionItems[0].includes("click"));
  });

  test("detects reply actions", () => {
    const e = mockEmail({
      text: "Please reply to this email within 24 hours.",
    });
    const parsed = parseEmail(e);
    assert.ok(parsed.actionItems.length >= 1);
  });

  test("limits to 5 action items", () => {
    const e = mockEmail({
      text: [
        "Please click here to verify.",
        "Please click here to download.",
        "Please confirm your account.",
        "Please update your settings.",
        "Please complete your profile.",
        "Please sign up for updates.",
      ].join("\n"),
    });
    assert.ok(parseEmail(e).actionItems.length <= 5);
  });

  test("returns empty when no actions", () => {
    const e = mockEmail({ text: "Hello there. How are you?" });
    assert.deepStrictEqual(parseEmail(e).actionItems, []);
  });
});

// ─── Metadata Tests ────────────────────────────────────

describe("parseEmail — metadata", () => {
  test("preserves sender info", () => {
    const e = mockEmail({
      from: "noreply@github.com",
      from_name: "GitHub",
    });
    const parsed = parseEmail(e);
    assert.strictEqual(parsed.from.address, "noreply@github.com");
    assert.strictEqual(parsed.from.name, "GitHub");
  });

  test("from_name is undefined when empty", () => {
    const e = mockEmail({ from_name: "" });
    assert.strictEqual(parseEmail(e).from.name, undefined);
  });

  test("preview is first 200 chars", () => {
    const longText = "x".repeat(300);
    const e = mockEmail({ text: longText });
    assert.strictEqual(parseEmail(e).preview.length, 200);
  });
});
