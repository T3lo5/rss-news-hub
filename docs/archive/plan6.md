# Plan: Newsletter Generator

## Objective
Add a "Newsletter" mode to the ShareModal that allows users to:
1. Multi-select news cards (checkbox + Shift+click range)
2. Generate a combined newsletter from selected items
3. Export as HTML (styled email) or Markdown
4. Copy to clipboard or send via Telegram

## Value
**High impact** - Turns the hub into a content distribution tool. Users can curate and share weekly digests.

---

## Phase 1: Multi-Selection State (App.tsx) ✅

### 1.1 Add selection state ✅
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
```

### 1.2 Selection handlers ✅
- `handleSelect(id, shiftKey)` - toggle or range-select
- `handleSelectAll()` / `handleClearSelection()`
- `selectedCount` derived from `selectedIds.size`

### 1.3 Keyboard shortcuts ✅
- `a` - Select all visible / Clear selection
- `Escape` - Clear selection (also closes modals)

---

## Phase 2: NewsGrid Updates ✅

### 2.1 Add checkbox to each card ✅
- Checkbox in top-right of card
- Checked when `selectedIds.has(item.id)`
- `onChange` calls `handleSelect`
- Visual style for selected card (blue border/background)

### 2.2 Pass selection props ✅
```typescript
<NewsGrid
  news={filteredNews}
  selectedIds={selectedIds}
  onSelect={handleSelect}
  selectedIndex={selectedIndex}
/>
```

---

## Phase 3: Newsletter Generation (ai.service.js) ✅

### 3.1 Add newsletter prompt type ✅
```javascript
if (type === 'newsletter') {
  return `Create a tech newsletter in ${lang} from the following articles. 
  Structure: Header, 3-5 sections (each: title + 2-3 sentence summary + link), Footer.
  Tone: professional, concise, developer-focused. Max 2000 chars. Return ONLY the newsletter text.`;
}
```

### 3.2 Backend endpoint ✅
- `POST /api/ai/generate` accepts `news` as array when `type === 'newsletter'`
- Joins multiple news items into single prompt

---

## Phase 4: ShareModal Newsletter Mode ✅

### 4.1 Add "Newsletter" to contentType options ✅
- Radio: Thread / Summary / LinkedIn / **Newsletter**

### 4.2 When newsletter mode ✅
- Show selected count badge
- "Generate Newsletter" button (enabled when selection > 0)
- Preview generated newsletter
- Export buttons: **Copy Markdown**, **Copy HTML**, **Send to Telegram**

### 4.3 HTML Export ✅
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>/* inline styles for email compatibility */</style>
</head>
<body>
  <div class="newsletter">...</div>
</body>
</html>
```

---

## Phase 5: Toolbar Updates ✅

### 5.1 Show selection count ✅
- "3 selecionados" badge
- "Selecionar todos" / "Limpar" buttons

---

## Acceptance Criteria ✅
- [x] Checkbox on each news card
- [x] Click toggles selection
- [x] Shift+click selects range
- [x] "Select All" / "Clear" in toolbar
- [x] Newsletter type in ShareModal
- [x] Generates combined newsletter from selection
- [x] Copy Markdown button
- [x] Copy HTML button (styled for email)
- [x] Send to Telegram works
- [x] Selection persists across filter/sort
- [x] All 121 tests pass

---

## File Changes ✅
```
frontend/src/components/App.tsx           # Selection state + handlers + copy HTML/Markdown
frontend/src/components/NewsGrid.tsx      # Checkbox + selected styling
frontend/src/components/ShareModal.tsx    # Newsletter mode + exports
frontend/src/components/Toolbar.tsx       # Selection count + clear
frontend/src/styles/global.css            # Selected card styles + selection bar
services/ai.service.js                    # Newsletter prompt
```

---

## Test Plan
```javascript
test/newsletter.test.js:
- Selection: click toggles, shift+click range, select all, clear
- Newsletter prompt builds correct multi-item prompt
- HTML export produces valid email HTML
- Markdown export produces clean markdown
- Telegram send works with newsletter content
```