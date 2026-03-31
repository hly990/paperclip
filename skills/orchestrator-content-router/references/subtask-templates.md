# Content Subtask Templates

## Standard Content Subtask

**Title**: `[content-squad] Write LinkedIn posts about AI safety`

**Description**:

````markdown
## Content Request

```content-squad-input
{
  "prompt": "Write 3 engaging LinkedIn posts about recent AI safety developments. Focus on practical implications for businesses. Tone: professional yet accessible.",
  "platform": "linkedin",
  "format": "social_post"
}
```

### Context

Parent task: Create Q1 social media content calendar.
Target audience: Tech executives and engineering managers.
Brand voice: Thought leadership, data-driven, forward-looking.
````

## Multi-Platform Content Subtask

**Title**: `[content-squad] Create product launch announcement`

**Description**:

````markdown
## Content Request

```content-squad-input
{
  "prompt": "Draft a product launch announcement for our new API v2. Highlight: 3x faster response times, new streaming endpoint, backward compatibility. Include a call to action for developer sign-up.",
  "platform": "general",
  "format": "article"
}
```

### Context

Launch date: 2026-04-15.
Product page: https://example.com/api-v2
Key differentiators: speed, streaming, compatibility.
````

## Minimal Content Subtask

**Title**: `[content-squad] Draft team update post`

**Description**:

````markdown
## Content Request

```content-squad-input
{
  "prompt": "Write a brief team update about our Q1 achievements for internal stakeholders."
}
```
````

Notes:
- `platform` and `format` are optional; b_social_agent will use defaults.
- The `content-squad-input` code fence label is required for reliable parsing.
