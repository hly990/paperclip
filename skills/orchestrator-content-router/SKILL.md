---
name: orchestrator-content-router
description: >
  Route content-creation tasks to the Content Squad agent. Use when a task
  involves writing social-media posts, articles, marketing copy, or any
  text-content production for an external platform. This skill splits the
  parent task into one or more content subtasks and delegates them. Do NOT
  call the external content API yourself — that is the Content Squad's job.
---

# Orchestrator — Content Router

This skill helps you (the orchestrator / CEO agent) identify content-creation
requests and delegate them to the **content-squad** agent via Paperclip subtasks.

## When to Use

Activate when the assigned task matches **any** of these signals:

- Title or description mentions social media, blog post, article, LinkedIn,
  content strategy, copywriting, or similar content-production terms.
- Task has a label `squad=content`.
- A human or upstream manager explicitly asks for content output.

If the task is purely internal (code, infra, analysis) do **not** use this skill.

## Workflow

### Step 1 — Parse the Request

Read the task title and description. Extract:

| Field | Source | Required |
|-------|--------|----------|
| `prompt` | The content brief / what to write | Yes |
| `platform` | Target platform (`linkedin`, `twitter`, `general`, etc.) | No — default `general` |
| `format` | Output format hint (`social_post`, `article`, `thread`, etc.) | No |

If the task description contains a fenced JSON block labeled
`content-request`, parse it directly:

````markdown
```content-request
{
  "prompt": "Write 3 LinkedIn posts about AI safety",
  "platform": "linkedin",
  "format": "social_post"
}
```
````

Otherwise, infer `prompt` from the task description and `platform` from
context clues.

### Step 2 — Create Content Subtask(s)

For each content deliverable, create a subtask assigned to the content-squad
agent. Use the Paperclip REST API:

```
POST /api/companies/{companyId}/issues
Headers:
  Authorization: Bearer $PAPERCLIP_API_KEY
  X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
  Content-Type: application/json

{
  "title": "[content-squad] {short summary of prompt}",
  "description": "... (see template below)",
  "parentId": "{current task id}",
  "assigneeAgentId": "{content-squad agent id}",
  "priority": "{inherit from parent or medium}",
  "goalId": "{inherit from parent if set}",
  "projectId": "{inherit from parent if set}"
}
```

**Description template** — always include the structured JSON block so the
content-squad agent can parse it deterministically:

````markdown
## Content Request

```content-squad-input
{
  "prompt": "<the content brief>",
  "platform": "<linkedin | twitter | general | ...>",
  "format": "<social_post | article | thread | ...>"
}
```

### Context
<any additional context from the parent task>
````

See `references/subtask-templates.md` for a full example.

### Step 3 — Discover the Content Squad Agent

You need the content-squad agent's `id` to set `assigneeAgentId`. Find it by:

```
GET /api/companies/{companyId}/agents
```

Look for an agent whose name or role indicates content-squad membership
(e.g., name contains `content` or role is `content-squad`). If multiple
candidates exist, pick the one that reports to you or has the most relevant
role.

### Step 4 — Update Parent Task

After creating subtask(s), comment on the **parent task** to record the
delegation:

```
POST /api/issues/{parentIssueId}/comments
Headers:
  Authorization: Bearer $PAPERCLIP_API_KEY
  X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID

{
  "body": "## Delegated to Content Squad\n\n- [{subtaskIdentifier}](/{prefix}/issues/{subtaskIdentifier}): {brief}\n\nContent-squad agent will handle the external workflow."
}
```

Then update the parent task status as appropriate:

- If all work is delegated: set `in_progress` (you're waiting on subtasks).
- If partial: continue with non-content work yourself.

## What NOT to Do

- **Do NOT** call `BS_SOCIAL_AGENT_BASE_URL` yourself — only content-squad
  agent has that responsibility.
- **Do NOT** hardcode agent IDs — always discover via the agents list API.
- **Do NOT** include API keys in subtask descriptions.
