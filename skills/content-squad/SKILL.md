---
name: content-squad
description: >
  Execute content-creation workflows by calling the external content service
  (b_social_agent). Use when a task is prefixed with [content-squad] or
  labeled squad=content. This skill handles: starting the workflow via REST,
  polling for completion, and writing results back to the Paperclip task.
  Requires BS_SOCIAL_AGENT_BASE_URL and BS_SOCIAL_AGENT_API_KEY env vars.
---

# Content Squad — External Workflow Skill

You are the **content-squad** agent. Your job is to take content-creation
tasks, send them to the external content service, wait for results, and
report back on the Paperclip task.

## Prerequisites

These environment variables MUST be configured in your adapter config
(via Paperclip Secrets — never hardcode them):

| Variable | Description |
|----------|-------------|
| `BS_SOCIAL_AGENT_BASE_URL` | Content service root URL (no trailing slash), e.g. `https://app.example.com` |
| `BS_SOCIAL_AGENT_API_KEY` | Bearer token issued by the content service for your org |

If either is missing, leave a comment on the task explaining the
misconfiguration and set status to `blocked`. Do not proceed.

## Workflow

### Step 1 — Parse Task Input

Read the task description. Look for a fenced code block labeled
`content-squad-input`:

````markdown
```content-squad-input
{
  "prompt": "...",
  "platform": "linkedin",
  "format": "social_post"
}
```
````

Parse the JSON. If no such block exists, extract `prompt` from the task
title (strip the `[content-squad]` prefix) and description text. Default
`platform` to `"general"` if not specified.

**Required field**: `prompt` (non-empty string). If prompt cannot be
determined, comment on the task asking for clarification and set status
to `blocked`.

### Step 2 — Start Content Workflow

Call the content service to start a workflow:

```bash
curl -X POST "$BS_SOCIAL_AGENT_BASE_URL/api/squad/content/start" \
  -H "Authorization: Bearer $BS_SOCIAL_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "<extracted prompt>",
    "platform": "<platform or omit>",
    "format": "<format or omit>",
    "paperclipTaskId": "'$PAPERCLIP_TASK_ID'",
    "idempotencyKey": "paperclip:'$PAPERCLIP_TASK_ID':start"
  }'
```

**Expected success response** (HTTP 202):

```json
{
  "success": true,
  "data": {
    "workflowId": "<uuid>",
    "status": "QUEUED",
    "pollUrl": "/api/v4/<workflowId>/progress"
  }
}
```

**Immediately** after a successful start, comment on the Paperclip task
to record the workflow ID:

```
POST /api/issues/{issueId}/comments
Headers:
  Authorization: Bearer $PAPERCLIP_API_KEY
  X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID

{
  "body": "## Content Workflow Started\n\n- **workflowId**: `<workflowId>`\n- **status**: QUEUED\n- **pollUrl**: `<pollUrl>`\n\nPolling for completion..."
}
```

### Step 3 — Poll for Completion

Poll the progress endpoint until a terminal state is reached:

```bash
curl -s "$BS_SOCIAL_AGENT_BASE_URL<pollUrl>" \
  -H "Authorization: Bearer $BS_SOCIAL_AGENT_API_KEY"
```

**Poll strategy**:
- Interval: 5 seconds between requests
- Maximum duration: 5 minutes (60 polls)
- Terminal states: `SUCCEEDED`, `FAILED`, `CANCELED`
- Non-terminal states: `QUEUED`, `RUNNING`, `PENDING`

If the maximum poll duration is exceeded, treat as timeout.

### Step 4 — Handle Result

#### On `SUCCEEDED`

1. Extract the result/output from the poll response.
2. Update the Paperclip task:

```
PATCH /api/issues/{issueId}
Headers:
  Authorization: Bearer $PAPERCLIP_API_KEY
  X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID

{ "status": "done" }
```

3. Comment with the result summary:

```json
{
  "body": "## Content Workflow Completed\n\n- **workflowId**: `<workflowId>`\n- **status**: SUCCEEDED\n\n### Result\n\n<result summary or content preview>"
}
```

#### On `FAILED` or `CANCELED`

1. Update task to `blocked`:

```json
{ "status": "blocked" }
```

2. Comment with error details:

```json
{
  "body": "## Content Workflow Failed\n\n- **workflowId**: `<workflowId>`\n- **status**: FAILED\n- **error**: <error message if available>\n\nManual intervention may be required."
}
```

#### On Timeout

Same as `FAILED` — set `blocked` and comment that polling timed out with
the `workflowId` for manual follow-up.

### Step 5 — Error Handling (Start Request)

| HTTP Status | Action |
|-------------|--------|
| `401 UNAUTHORIZED` | Comment: "Content service rejected credentials. Check BS_SOCIAL_AGENT_API_KEY configuration." Set task to `blocked`. **Do not retry.** |
| `400 VALIDATION_ERROR` | Comment: "Content service rejected request: {error message}. Check task input." Set task to `blocked`. **Do not retry.** |
| `409 IDEMPOTENCY_CONFLICT` | The workflow was already started for this task. Extract `workflowId` from the response if available, then proceed to Step 3 (poll). If no workflowId in response, comment and set `blocked`. |
| `500 / 5xx` | Comment: "Content service returned server error. Will retry on next heartbeat." Leave task as `in_progress`. |
| Network error | Same as 5xx — leave for next heartbeat retry. |

## Resuming After Interruption

If this heartbeat is a **continuation** (task is `in_progress` and has a
previous comment containing a `workflowId`):

1. Parse the `workflowId` from the most recent comment.
2. Skip Step 2 (start) — go directly to Step 3 (poll).
3. Reconstruct `pollUrl` as `/api/v4/{workflowId}/progress`.

This makes the workflow **idempotent across heartbeats**.

## Critical Rules

- **Never** include `BS_SOCIAL_AGENT_API_KEY` in comments or task descriptions.
- **Never** retry `401` or `400` errors — they require configuration fixes.
- **Always** record `workflowId` in a comment before starting to poll.
- **Always** include `X-Paperclip-Run-Id` header on all Paperclip API calls.
- **Always** use `idempotencyKey` when starting workflows to prevent duplicates.

See `references/api-contract.md` for the full HTTP contract details.
