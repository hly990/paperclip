# 总控 + 内容军团 — Paperclip 实施手册

> **日期**: 2026-03-31  
> **配对文档**: [12-orchestrator-content-squad-b-social-agent.md](./12-orchestrator-content-squad-b-social-agent.md)（本系统：API、鉴权、工作流）  
> **通用基础**: [11-squad-automation-paperclip-agent-skill.md](./11-squad-automation-paperclip-agent-skill.md)（Skill 与 REST 如何配合）  
> **Paperclip API**: [API Overview](https://docs.paperclip.ing/api/overview)

本文只描述 **Paperclip 侧**可独立实施的事项（Company、Agent、Adapter、Skill、任务习惯）；**不修改** b_social_agent 源码。HTTP 契约以 **12** 定稿为准。

---

## 1. 目标与边界

**目标**：在 Paperclip 内用 **总控 + 内容** 两角色协作：**总控**负责拆单与分派，**内容**负责调用本系统「内容入口」、轮询工作流、把结果写回 Paperclip 任务。

**推荐拓扑**：**两个 Agent**（`orchestrator`、`content-squad`），各挂一组 Skill；也可用单 Agent + 多个 Skill + 严格按任务类型分支，运维复杂度更高。

---

## 2. 任务模型

| 层级 | 建议 | 说明 |
|------|------|------|
| 父任务 | 人类或总控创建 | 标题：用户诉求一句话摘要；描述可含原始需求、链接 |
| 子任务 / 标签 | `squad=content` 或独立子 issue | 内容军团认领范围内仅处理此类；描述中含 **12** 所需 `prompt`、`platform` |
| 关联 ID | 评论或描述 | 本系统返回的 `workflowId` 写入 Paperclip 评论，便于对账与人工介入 |

**租户映射**：Paperclip `companyId` 与本系统 `orgId` 在运维层 **1:1 或映射表**维护；API Key **按 org 发放**，与 **12** 一致。Skill **不要**写死对端 org。

---

## 3. Agent 与 Adapter

| Agent | 角色 | Adapter 建议 | 说明 |
|-------|------|--------------|------|
| 总控 | 识别任务类型、拆子任务、分配 | `claude_local` 或 `http` | 高层编排；少暴露业务密钥给无关运行目录 |
| 内容军团 | 调本系统 REST、轮询、回写 | `claude_local` 或 `http` | 需能发 HTTPS；超时覆盖长轮询 |

**环境变量（与 Skill 对齐命名）**

| 变量 | 用途 |
|------|------|
| `BS_SOCIAL_AGENT_BASE_URL` | 本系统根 URL，如 `https://app.example.com` |
| `BS_SOCIAL_AGENT_API_KEY` | **12** 签发的 Bearer token（用 Paperclip Secrets 注入，勿写入 Skill 正文） |
| `PAPERCLIP_API_URL` 等 | Paperclip 注入，见 [How Agents Work](https://docs.paperclip.ing/guides/agent-developer/how-agents-work.md) |

---

## 4. Skill 拆分（Markdown 仓库内维护）

### 4.1 总控 Skill（示例职责）

- **description**：写成决策逻辑——何时处理父任务、何时创建子任务、何时指派给「内容」Agent 或贴标签。
- **正文**：
  - 从任务描述提取 `prompt`、`platform`。
  - 子任务标题/描述模板（含 JSON 块或结构化小节便于内容 Agent 解析）。
  - **不**粘贴 `BS_SOCIAL_AGENT_API_KEY`；写「从环境变量读取」。
  - 引用 **12** 中已定稿的 URL 路径（见 §5）。

### 4.2 内容军团 Skill（示例职责）

- **description**：当任务为内容类（子任务、`squad=content`、或标题前缀约定）时加载。
- **正文**：
  1. `POST` **12** 内容入口，Body 见契约表（`prompt`、`platform`、`paperclipTaskId` 填当前 Paperclip task id）。
  2. 解析响应中的 `workflowId`、`pollUrl`。
  3. 轮询 `GET` 进度URL（**完整 URL** = `BS_SOCIAL_AGENT_BASE_URL` + `pollUrl`），直到终态或超时。
  4. 使用 Paperclip REST 更新任务：评论附上 `workflowId` 与结果摘要；必要时关闭或移交状态。
  5. 错误：按 **12** 返回的 `code` 在任务上留评论，避免盲重试 **409 Conflict** 类 Paperclip 响应（见 [API Overview 错误表](https://docs.paperclip.ing/api/overview)）。

### 4.3 Skill 注入

按 [Writing a Skill](https://docs.paperclip.ing/guides/agent-developer/writing-a-skill.md) 与 [Claude Local](https://docs.paperclip.ing/adapters/claude-local.md)：`--add-dir` 或团队既定方式；`references/` 下放可复制 `curl` 模板（占位符 `$BS_SOCIAL_AGENT_BASE_URL`）。

---

## 5. 与 12 的契约对照表

以下路径以 **12** 实施为准；若选定「加固 `v4/start`」而非新路由，将下表路径替换为 `POST /api/v4/start` 并在 Skill 中同步。

| 项 | 约定 |
|------|------|
| 内容入口（推荐新路由） | `POST {BASE}/api/squad/content/start`（**待 12 实现后填最终路径**） |
| 鉴权 | `Authorization: Bearer <BS_SOCIAL_AGENT_API_KEY>` |
| Body 必填 | `prompt`（string） |
| Body 常用可选 | `platform`（如 `linkedin`）、`format`、`paperclipTaskId`、`idempotencyKey`、`userId`、`params` |
| 成功响应 | `202` + `data.workflowId`、`data.pollUrl`（相对路径） |
| 进度轮询 | `GET {BASE}{pollUrl}`，需与 12 一致的鉴权策略（若 12 要求 progress 也带 Bearer，则必须带上） |
| 错误 | `401` 凭证无效；`400` 校验失败；**具体 `code` 以 12 实现为准** |

**Paperclip 互调**

- 调用 Paperclip REST：`Authorization: Bearer` 使用 heartbeat 注入的 agent key / JWT（见官方 [Authentication](https://docs.paperclip.ing/api/authentication.md) 若已分拆文档）。
- 在 heartbeat 内向 Paperclip **写入**资源时：按需带 `X-Paperclip-Run-Id`（见 [API Overview](https://docs.paperclip.ing/api/overview)）。

---

## 6. E2E 演练步骤

1. **12** 已部署 P0：内容入口 + Bearer + 轮询鉴权策略明确。
2. Paperclip 上创建 Company，配置两个 Agent 与上述环境变量。
3. Board 创建父任务（真实一句话需求）。
4. 触发总控 Agent heartbeat：应产生内容类子任务或等价标记。
5. 内容 Agent heartbeat：`POST` 成功 → 轮询至 `SUCCEEDED`/`FAILED`（以本系统 workflow 状态为准）。
6. Paperclip 任务上出现含 `workflowId` 的评论或状态更新。
7. 失败场景：故意错误 Bearer，确认 **401** 且任务留言可追溯。

---

## 7. 本系统侧依赖

| 依赖 | 说明 |
|------|------|
| **12 P0** | 鉴权内容入口可用；`pollUrl` 可轮询。 |
| **可选 12 P0 Late** | 发帖在 UI/站内助手验证；Paperclip 路径可不经过 Late。 |
| **12 P1** | worker 回写 Paperclip 时，agent 侧可减少手工 PATCH（非 MVP 必需）。 |

---

## 8. 最小 MVP

总控拆单 + 内容 Agent **仅** `POST` + **轮询** + **评论写 workflowId** + **关闭任务**；不要求本系统 worker 自动回调 Paperclip。
