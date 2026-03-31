# 总控 + 内容军团 — 本系统与 Paperclip 集成契约（对齐文档）

> **契约版本**: `v1`  
> **日期**: 2026-03-31  
> **效力**: HTTP 字段、环境变量命名、联调验收**以本文为准**。若与 [12](./12-orchestrator-content-squad-b-social-agent.md)、[13](./13-orchestrator-content-squad-paperclip.md) 其它叙述冲突，**以本文为准**；实施清单仍以 12 / 13 分工为准。  
> **背景**: [10](./10-squad-automation-b-social-agent-rest-webhook.md)、[11](./11-squad-automation-paperclip-agent-skill.md)

---

## 1. 范围

| 方向 | 协议 | 说明 |
|------|------|------|
| Paperclip Agent → b_social_agent | HTTPS + JSON | 内容工作流**启动**与**进度轮询**（本文件主体）。 |
| Paperclip Agent → Paperclip | HTTPS + JSON | 任务状态 / 评论 / 审批等；见 [Paperclip API Overview](https://docs.paperclip.ing/api/overview)。 |
| b_social_agent → Paperclip（可选 P1） | HTTPS | Worker / 服务回写任务；见 [07](./07-paperclip-chat-workflow-integration.md) §5。 |

---

## 2. 身份与租户

| 概念 | 侧 | 约定 |
|------|----|------|
| `orgId` | b_social_agent | 组织主键；API Key **按 org 签发**，服务端解析后绑定 workflow 租户。 |
| `companyId` | Paperclip | Paperclip 公司实体 ID。 |
| 映射 | 运维 | **1:1 或显式映射表**；不在 Skill 中硬编码对端租户。 |
| API Key | 双方 | Paperclip Agent 环境变量 `BS_SOCIAL_AGENT_API_KEY` 的值必须等于本系统为该 org 签发的 token（见 §4）。 |

---

## 3. Paperclip Agent 环境变量（命名契约）

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `BS_SOCIAL_AGENT_BASE_URL` | 是 | 本系统根 URL，无尾斜杠，如 `https://app.example.com`。 |
| `BS_SOCIAL_AGENT_API_KEY` | 是 | 请求本系统时的 Bearer token；用 Paperclip Secrets 注入。 |
| `PAPERCLIP_API_URL` 等 | 是 | Paperclip 控制面注入；见 [How Agents Work](https://docs.paperclip.ing/guides/agent-developer/how-agents-work.md)。 |

**禁止**：将 `BS_SOCIAL_AGENT_API_KEY` 写入 Skill Markdown 正文或提交到公开 Git。

---

## 4. b_social_agent：内容工作流启动

### 4.1 路径（二选一，上线前在下方「修订记录」中钉死）

| 选项 | 方法 | 路径 | 说明 |
|------|------|------|------|
| **推荐（新路由）** | `POST` | `/api/squad/content/start` | 专用于机器调用；实现见 [12](./12-orchestrator-content-squad-b-social-agent.md) P0。 |
| **备选** | `POST` | `/api/v4/start` | 须在加固 Bearer/org 后作为契约路径使用。 |

**本文档 `/content/start` 为例**；若选用 `v4/start`，全文路径替换即可。

### 4.2 请求

| 位置 | 名称 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| Header | `Authorization` | 是 | string | `Bearer <BS_SOCIAL_AGENT_API_KEY>` |
| Header | `Content-Type` | 是 | string | `application/json` |
| Body | `prompt` | 是 | string | 内容诉求 / 脚本方向；trim 后非空。 |
| Body | `platform` | 否 | string | 如 `linkedin`、`general`；缺省由服务端定（与现有 V4 对齐）。 |
| Body | `format` | 否 | string | 与 V4 一致。 |
| Body | `paperclipTaskId` | 否 | string | 当前 Paperclip 任务 ID，建议写入 `workflow.input` 便于对账。 |
| Body | `idempotencyKey` | 否 | string | 建议格式 `paperclip:{taskId}:start` 或团队统一前缀；重复请求行为见 §6。 |
| Body | `userId` | 否 | string | 外部用户 ID。 |
| Body | `params` | 否 | object | 扩展键值；与 V4 对齐。 |

### 4.3 成功响应

- **HTTP**: `202 Accepted`
- **Body**（与现有 V4 成功体对齐，字段名以实际实现为准）:

```json
{
  "success": true,
  "data": {
    "workflowId": "<uuid>",
    "status": "QUEUED",
    "pollUrl": "/api/v4/<workflowId>/progress",
    "qstashMessageId": null
  }
}
```

- `pollUrl`：**相对路径**；完整 URL = `BS_SOCIAL_AGENT_BASE_URL` + `pollUrl`。

### 4.4 错误响应（约定稳定 `code`）

| HTTP | `code`（示例） | 含义 |
|------|----------------|------|
| `400` | `INVALID_JSON` / `MISSING_PROMPT` / `VALIDATION_ERROR` | 请求体非法或缺必填字段。 |
| `401` | `UNAUTHORIZED` | 缺失或无效 Bearer / 与 org 不匹配。 |
| `409` | `IDEMPOTENCY_CONFLICT` | 相同 `idempotencyKey` 与已存在资源冲突（若实现）。 |
| `500` | `START_FAILED` | 服务端失败。 |

错误体建议形态：`{ "success": false, "error": { "code": "...", "message": "..." } }`（与现有路由保持一致）。

---

## 5. b_social_agent：进度轮询

### 5.1 路径

- `GET /api/v4/{workflowId}/progress`（`workflowId` 来自 §4.3）。

### 5.2 鉴权（契约要求）

- **必须与 §4 一致**：同一把 org-scoped key；`Authorization: Bearer <BS_SOCIAL_AGENT_API_KEY>`。  
- 本系统实施时须**禁止**仅凭 UUID 跨租户读取（见 [12](./12-orchestrator-content-squad-b-social-agent.md)）。

### 5.3 响应

- 以 `src/app/api/v4/[id]/progress/route.ts` 实现为准；Paperclip 侧轮询至 workflow 状态为终态（如 `SUCCEEDED` / `FAILED` / `CANCELED`）或超时。

---

## 6. 幂等与重试

- Paperclip 心跳/网络重试可能重复 `POST`：若传 `idempotencyKey`，服务端应对同一 key 返回**同一** `workflowId`（推荐）或稳定 `409`。  
- Paperclip 侧对 **409 Conflict**（任务被其它 agent 占用）勿盲重试；见 [API Overview 错误表](https://docs.paperclip.ing/api/overview)。

---

## 7. Paperclip REST（Agent 回写任务）

| 项 | 约定 |
|----|------|
| Base | `PAPERCLIP_API_URL` + 官方路径前缀（如 `/api`）。 |
| 认证 | `Authorization: Bearer` + 注入的 agent key / JWT；见 [Authentication](https://docs.paperclip.ing/api/authentication)。 |
| 变更类请求 | 在 heartbeat 执行面内 mutating 时，按需携带 `X-Paperclip-Run-Id`（见 [API Overview](https://docs.paperclip.ing/api/overview)）。 |
| 对账 | 任务评论或描述中包含本系统 `workflowId`。 |

---

## 8. 联调验收（最小）

| # | 步骤 |
|---|------|
| 1 | 使用有效 `BS_SOCIAL_AGENT_API_KEY` 调用 §4 `POST`，得 `202` 与 `workflowId`。 |
| 2 | 使用同一 Bearer `GET` §5 `progress`，与创建时的 org 一致。 |
| 3 | 故意错误 Bearer，`POST` / `GET` 均 `401`。 |
| 4 | Paperclip 任务上可见 `workflowId` 回写（评论或状态）。 |

---

## 9. 修订记录

| 版本 | 日期 | 变更摘要 |
|------|------|----------|
| v1 | 2026-03-31 | 初版：启动 + 轮询 + 环境变量 + 身份映射 + Paperclip 回写要点。 |
| | | **钉选路径**：□ `/api/squad/content/start`　□ 加固后的 `/api/v4/start`（勾选并更新 §4.1） |
