# Content Service API Contract

> Source of truth: `res/14-orchestrator-content-squad-integration-contract.md` (contract v1)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BS_SOCIAL_AGENT_BASE_URL` | Yes | Root URL, no trailing slash. Example: `https://app.example.com` |
| `BS_SOCIAL_AGENT_API_KEY` | Yes | Bearer token, org-scoped. Injected via Paperclip Secrets. |

---

## Start Content Workflow

```
POST {BS_SOCIAL_AGENT_BASE_URL}/api/squad/content/start
```

### Request

```bash
curl -X POST "$BS_SOCIAL_AGENT_BASE_URL/api/squad/content/start" \
  -H "Authorization: Bearer $BS_SOCIAL_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write 3 LinkedIn posts about AI safety",
    "platform": "linkedin",
    "format": "social_post",
    "paperclipTaskId": "'"$PAPERCLIP_TASK_ID"'",
    "idempotencyKey": "paperclip:'"$PAPERCLIP_TASK_ID"':start"
  }'
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `prompt` | Yes | string | Content brief (trimmed, non-empty) |
| `platform` | No | string | Target platform: `linkedin`, `twitter`, `general`, etc. |
| `format` | No | string | Output format hint |
| `paperclipTaskId` | No | string | Current Paperclip task ID for traceability |
| `idempotencyKey` | No | string | Recommended: `paperclip:{taskId}:start` |
| `userId` | No | string | External user ID |
| `params` | No | object | Extension key-value pairs |

### Success Response (HTTP 202)

```json
{
  "success": true,
  "data": {
    "workflowId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "QUEUED",
    "pollUrl": "/api/v4/550e8400-e29b-41d4-a716-446655440000/progress",
    "qstashMessageId": null
  }
}
```

### Error Responses

| HTTP | Code | Meaning | Retry? |
|------|------|---------|--------|
| 400 | `INVALID_JSON` / `MISSING_PROMPT` / `VALIDATION_ERROR` | Bad request body | No |
| 401 | `UNAUTHORIZED` | Invalid or missing Bearer token | No |
| 409 | `IDEMPOTENCY_CONFLICT` | Duplicate idempotency key | No (extract existing workflowId) |
| 500 | `START_FAILED` | Server error | Yes (next heartbeat) |

Error body format:
```json
{
  "success": false,
  "error": {
    "code": "MISSING_PROMPT",
    "message": "prompt is required and must be a non-empty string"
  }
}
```

---

## Poll Workflow Progress

```
GET {BS_SOCIAL_AGENT_BASE_URL}/api/v4/{workflowId}/progress
```

### Request

```bash
curl -s "$BS_SOCIAL_AGENT_BASE_URL/api/v4/$WORKFLOW_ID/progress" \
  -H "Authorization: Bearer $BS_SOCIAL_AGENT_API_KEY"
```

Authentication is **required** — same Bearer token as the start request.
The service enforces org-scoped access (no cross-tenant reads).

### Response

Response body follows the existing v4 progress format. Key fields:

- `status`: `QUEUED` | `RUNNING` | `PENDING` | `SUCCEEDED` | `FAILED` | `CANCELED`
- Terminal states: `SUCCEEDED`, `FAILED`, `CANCELED`

### Poll Strategy

- Interval: 5 seconds
- Max polls: 60 (5 minutes total)
- On timeout: treat as failure, record workflowId for manual follow-up

---

## Paperclip REST (Agent Writing Back)

| Item | Value |
|------|-------|
| Base URL | `$PAPERCLIP_API_URL` (auto-injected) |
| Auth | `Authorization: Bearer $PAPERCLIP_API_KEY` (auto-injected) |
| Run tracking | Include `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID` on all mutating requests |
| Traceability | Always include `workflowId` in task comments |

### Comment on Task

```bash
curl -X POST "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "## Content Workflow Started\n\n- **workflowId**: `'"$WORKFLOW_ID"'`\n- **status**: QUEUED"
  }'
```

### Update Task Status

```bash
curl -X PATCH "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{ "status": "done" }'
```
