# Messo

面向 AI Agent 的开源邮件基础设施。

给你的 agent 一个专属邮箱——发送、接收、搜索、**解析**邮件。完全自托管在 Cloudflare 上，零厂商锁定。

## 为什么选 Messo？

AI agent 需要邮件能力：OTP 验证、账号注册、通知接收、报告发送。现有方案要么是闭源 SaaS，要么只是简陋的 CLI。

Messo 是**开发者优先**的替代方案：

| | mails.dev | **Messo** |
|---|---|---|
| SDK | 仅 CLI | **TypeScript SDK + CLI** |
| 邮件解析 | 原始文本 | **结构化 JSON + 意图识别** |
| 多邮箱 | 单一收件箱 | **多 agent 邮箱** |
| 部署 | 手动配 wrangler | **一条命令：`messo setup`** |
| AI 集成 | 无 | **预置工具定义** |
| 托管 | 他们的服务器或自己折腾 | **自托管在你自己的 CF 账号** |

## 快速开始

```bash
# 1. 创建配置
npx messo init --domain yourdomain.com

# 2. 部署后端到你的 Cloudflare 账号
npx messo setup

# 3. 为你的 agent 认领一个邮箱
npx messo claim my-agent
# → my-agent@yourdomain.com

# 4. 查看收件箱
npx messo inbox

# 5. 搜索验证码
npx messo search "verification code"
```

## SDK 用法

```typescript
import { messo, parseEmail } from "messo";

const m = messo({
  apiUrl: "https://messo.your-subdomain.workers.dev",
  apiKey: "your-api-key",
});

// 认领邮箱
const mailbox = await m.claim({ agent_name: "support-bot" });

// 查看收件箱
const { emails } = await m.inbox(mailbox.id);

// 读取并解析邮件
const email = await m.getEmail(emails[0].id);
const parsed = parseEmail(email);

console.log(parsed.intent);     // → "password_reset"
console.log(parsed.links);      // → ["https://example.com/reset?token=abc"]
console.log(parsed.actionItems); // → ["Click here to reset your password"]

// 发送邮件
await m.send(mailbox.id, {
  to: "user@example.com",
  subject: "报告已就绪",
  body: "您的周报已可下载。",
});
```

## AI 工具集成

Messo 内置预置工具定义，兼容 Vercel AI SDK、LangChain 等任何接受 `{ name, description, parameters, execute }` 的框架：

```typescript
import { messo } from "messo";

const m = messo({ apiUrl: "...", apiKey: "..." });
const tools = m.tools();

// tools.check_inbox   — "查看 agent 的收件箱"
// tools.read_email    — "读取邮件完整内容"
// tools.search_inbox  — "搜索邮件（查找验证码、验证链接）"
// tools.send_email    — "以 agent 邮箱身份发送邮件"
```

## 邮件解析

`parseEmail()` 函数从原始邮件中提取结构化数据——纯启发式规则，不需要 LLM：

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

识别意图：`password_reset`、`email_verification`、`welcome`、`notification`、`receipt`、`meeting_invite`、`newsletter`、`security_alert`、`reply`、`other`。

## 架构

```
                    ┌─────────────┐
  入站邮件 ───────→ │  CF Worker  │ ──→ D1 (SQLite)
  (Email Worker)    │  (messo)    │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  REST API   │ ←── SDK / CLI
                    └─────────────┘
```

- **后端**：Cloudflare Worker（Email Workers 收件 + REST API 管理一切）
- **存储**：Cloudflare D1（边缘 SQLite）
- **SDK**：TypeScript，零依赖，Node 18+ 和浏览器通用
- **CLI**：单一可执行文件，零依赖

## 自托管

所有东西运行在**你自己的** Cloudflare 账号上。没有第三方能看到你的邮件。

**前提条件：**
- Cloudflare 账号（免费版即可）
- 一个已配置在 Cloudflare 上的域名
- Node.js 18+

```bash
git clone https://github.com/respectevery01/messo.git
cd messo
npm install && npm run build
npm link  # 全局注册 `messo` 命令

messo init --domain yourdomain.com
messo setup
```

`messo setup` 完成后，在 Cloudflare 控制台启用 Email Routing：
1. Dashboard → 你的域名 → Email → Email Routing
2. 启用（自动添加 MX 记录）
3. Catch-All 规则 → Send to Worker → `messo`

## 开源协议

MIT © [Jask](https://github.com/respectevery01)

---

[English](./README.md)
