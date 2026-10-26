# Plan 9: OPML Import/Export

## Objective
Allow users to import feeds from OPML files and export current feeds to OPML format for migration between RSS readers.

## Requirements
- Export current feeds to OPML 2.0 format
- Import feeds from OPML file (validate, deduplicate, add)
- API endpoints for import/export
- UI: Export button in Feed Manager, Import file picker in Feed Manager
- Keyboard shortcut: `o` for OPML export, `Shift+O` for import

## Backend

### API Endpoints
- `GET /api/feeds/opml` - Export feeds as OPML (Content-Type: application/xml)
- `POST /api/feeds/opml` - Import feeds from OPML (multipart/form-data)

### Service
`services/opml.service.js` - parse/generate OPML

### OPML Format
```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>RSS News Hub Feeds</title>
    <dateCreated>...</dateCreated>
    <ownerName>RSS News Hub</ownerName>
  </head>
  <body>
    <outline text="AI/ML" title="AI/ML">
      <outline type="rss" text="OpenAI Blog" title="OpenAI Blog" xmlUrl="https://openai.com/blog/rss.xml" htmlUrl="https://openai.com/blog/" />
    </outline>
  </body>
</opml>
```

## Frontend

### Types
```typescript
interface OPMLImportResult {
  added: number;
  skipped: number;
  errors: string[];
}
```

### Hooks
`useOPML.ts` - export, import

### Components
- Add import/export buttons to `FeedManagerModal`

### UI Integration
- FeedManagerModal: "Export OPML" and "Import OPML" buttons
- Import: file input + progress/result modal
- Export: triggers download

## Acceptance Criteria
- Export produces valid OPML 2.0 with categories as groups
- Import parses OPML, extracts feeds, handles duplicates gracefully
- Import shows summary (added, skipped, errors)
- Files download/ upload work in browser
- All tests pass