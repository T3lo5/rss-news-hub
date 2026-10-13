# Plan: Content Templates

## Problem
AI prompts are hardcoded in `services/ai.service.js`. Users can't customize prompt structure without code changes.

## Solution
User-defined prompt templates stored in config file, selectable per-request.

## Spec

### Template Config (`data/templates.json`)
```json
{
  "templates": [
    {
      "id": "linkedin-technical",
      "name": "LinkedIn Technical Post",
      "type": "linkedin",
      "systemPrompt": "Write a technical LinkedIn post... {{language}}",
      "variables": ["language"]
    },
    {
      "id": "blog-tutorial",
      "name": "Blog Tutorial",
      "type": "blog",
      "systemPrompt": "Write a tutorial blog post... {{language}}",
      "variables": ["language", "codeExample"]
    }
  ],
  "defaultTemplateIds": {
    "thread": "thread-default",
    "summary": "summary-default",
    "linkedin": "linkedin-technical",
    "blog": "blog-tutorial",
    "newsletter": "newsletter-default"
  }
}
```

### Template Engine
- Simple variable substitution: `{{variable}}` → value
- Built-in variables: `language`, `title`, `source`, `link`, `content`, `description`, `pubDate`
- Custom variables from request body

### API Changes
- `POST /api/ai/generate` accepts optional `templateId`
- If `templateId` provided: use template's systemPrompt + merge variables
- If not: use default template for type (from config)
- Built-in prompts remain as fallback defaults

### Management Endpoints
- `GET /api/templates` - list all templates
- `POST /api/templates` - create template
- `PUT /api/templates/:id` - update template
- `DELETE /api/templates/:id` - delete template
- `POST /api/templates/:id/test` - test template with sample data

### Frontend
- Template selector in ShareModal (dropdown next to type)
- "Manage Templates" modal for CRUD
- Preview template variables

### Tests
- Template CRUD persists to JSON
- Variable substitution works
- Default template used when none specified
- Invalid templateId returns 400
- Custom variables override built-ins
- Template type matches content type