# 军团自动化 — Paperclip（Agent / Skill）侧方案

> **日期**: 2026-03-31  
> **配对文档**: [10-squad-automation-b-social-agent-rest-webhook.md](./10-squad-automation-b-social-agent-rest-webhook.md)（本系统侧）  
> **结论**: 军团自动化可通过 **Paperclip 控制面 + Agent heartbeat + Skill 文档化调用 b_social_agent 的 REST** 达成；**不依赖** Paperclip 官方文档中单独定义的「Skill 直连外部 MCP」能力。  
> **Paperclip REST 参考**: [API Overview](https://docs.paperclip.ing/api/overview)

---

## 1. Paperclip 侧承担什么

| 职责 | 说明 |
|------|------|
| **任务与组织** | 公司、任务（issues）、分配、审批、心跳、成本等（Paperclip REST）。 |
| **拉起 Agent** | Adapter（如 `claude_local`、`http`）在每次 heartbeat 中运行具体运行时。 |
| **Skill** | 可复用的 **Markdown 说明**（YAML frontmatter + 正文），供 agent 按需加载后**按步骤执行**，而非 Paperclip 替你发起 HTTP。 |

---

## 2. Skill 与本系统 REST 如何配合

1. Agent 在上下文中看到 Skill 的 `name` / `description`（路由用）。
2. 与当前任务相关时，加载完整 `SKILL.md`。
3. 正文中写清：**何时**调用 b_social_agent、**URL**、**方法**、**Header（含鉴权占位）**、**JSON 示例**、**错误时如何处理**。
4. **实际 HTTP 请求**由 Adapter 所启动的运行时执行（例如按文档使用终端 `curl`、脚本或运行时自带的 HTTP 能力）。

要点（与 [Writing a Skill](https://docs.paperclip.ing/guides/agent-developer/writing-a-skill.md) 一致）：

- `description` 写成 **决策逻辑**（何时用 / 何时不用）。
- **Secrets**：通过 Paperclip / Adapter 的 **环境变量或 Secrets** 注入 API Key；Skill 只写变量名或「从 env 读取」，不把密钥写进 Git 可读的正文。

---

## 3. Paperclip REST（agent → 控制面）

Heartbeat 内 agent 使用注入变量（见 [How Agents Work](https://docs.paperclip.ing/guides/agent-developer/how-agents-work.md)）：

- `PAPERCLIP_API_URL`、`PAPERCLIP_API_KEY`、`PAPERCLIP_COMPANY_ID`、`PAPERCLIP_AGENT_ID`、`PAPERCLIP_RUN_ID` 等。
- 变更任务状态、评论、审批等仍走 **Paperclip 官方 REST**；与「调用 b_social_agent」是两条线。

---

## 4. Webhook（可选）

若架构上需要 **Paperclip → 本系统异步通知**（任务关闭、审批通过等）：

- 由 Paperclip 侧配置能 POST 到 b_social_agent 的 URL（若产品支持出站 webhook）；或
- 由本系统 **轮询 / 拉取** Paperclip API（实现简单但实时性差）。

具体以所用 Paperclip 版本能力与运维方式为准；契约与验签见配对文档 [10](./10-squad-automation-b-social-agent-rest-webhook.md) §2.2。

---

## 5. HTTP Adapter 与本地 Adapter

- **`claude_local`**：本地 Claude Code；Skill 经 `--add-dir` 注入（见 [Claude Local](https://docs.paperclip.ing/adapters/claude-local.md)）。适合在 Skill 中描述「调用 b_social_agent REST」。
- **`http`**：Paperclip POST 到你们自建服务，服务内再调本系统 REST 或一次完成业务（见 [HTTP Adapter](https://docs.paperclip.ing/adapters/http.md)）。

选型取决于 agent 跑在何处、是否要统一入口。

---

## 6. 实施清单（Paperclip）

1. 为每类「军团能力」拆 **独立 Skill**（与 [10](./10-squad-automation-b-social-agent-rest-webhook.md) 中的 REST 契约一一对应）。
2. 在 Skill 的 `references/` 中放 **可复制** 的 `curl` 示例（占位符替换为 env）。
3. Agent 配置中注入：**本系统 Base URL**、**API Key**（或 Paperclip Secret 引用）。
4. 在 Adapter `env` 中暴露上述变量，与 Skill 中的名称一致。
5. 用一次真实 heartbeat 做 E2E：认领任务 → 调本系统 REST → 更新 Paperclip 任务状态。

---

## 7. 与双向 MCP 的关系

- **不必需**：Skill + REST 即可闭环。
- 若后续为 Claude Code 配置 MCP 指向 b_social_agent，属于 **运行时增强**，与 Paperclip 控制面文档中的 Skill 模型无关；两套可以并存。
