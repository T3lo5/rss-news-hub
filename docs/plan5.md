# Plan: Card Selection Navigation (j/k/Enter)

## Objective
Implement keyboard navigation for news cards using `j` (next), `k` (previous), and `Enter` (open/share) keys. Currently these shortcuts are registered but have placeholder handlers.

## Value
**Low effort, high UX impact** - Makes existing keyboard shortcuts functional, enables full keyboard-driven workflow.

---

## Phase 1: Selection State Management

### 1.1 Add selection state to App.tsx
- Add `selectedIndex` state (number, -1 = none selected)
- Add `selectedNews` derived from `filteredNews[selectedIndex]`
- Reset selection when filters/search change
- Clamp index when news array shrinks

### 1.2 Update NewsGrid component
- Accept `selectedIndex` prop
- Add `data-selected` attribute to selected card
- Add `onKeyDown` handler for Enter/Space on focused card (accessibility)
- Visual highlight for selected card (CSS)

### 1.3 Keyboard handlers in App.tsx
```typescript
const handleNext = () => {
  if (filteredNews.length === 0) return;
  setSelectedIndex(prev => Math.min(prev + 1, filteredNews.length - 1));
};

const handlePrev = () => {
  if (filteredNews.length === 0) return;
  setSelectedIndex(prev => Math.max(prev - 1, 0));
};

const handleOpen = () => {
  if (selectedIndex >= 0 && selectedIndex < filteredNews.length) {
    handleOpenShare(filteredNews[selectedIndex]);
  }
};
```

### 1.4 Update shortcuts array
- Replace placeholder handlers with real implementations
- `j` → handleNext
- `k` → handlePrev
- `Enter` → handleOpen

---

## Phase 2: Visual Feedback

### 2.1 CSS for selected card
```css
.news-card[data-selected="true"] {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  background: var(--surface-hover);
}
```

### 2.2 Scroll into view
- When selection changes, call `element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`
- Use ref on each card or querySelector

---

## Phase 3: Edge Cases

### 3.1 Filter/Search changes
- Reset `selectedIndex = -1` when `filteredNews` reference changes
- Or clamp to valid range

### 3.2 Empty state
- Disable j/k/Enter when no news
- Show hint in empty state

### 3.3 Modal interactions
- Disable navigation when ShareModal/AddModal/StatsModal/FeedManagerModal open
- Already handled by `disabledInInputs` but need explicit modal check

---

## Acceptance Criteria
- [ ] `j` selects next card (wraps or clamps at end)
- [ ] `k` selects previous card (clamps at 0)
- [ ] `Enter` opens ShareModal for selected card
- [ ] Selected card visually highlighted
- [ ] Selection resets on filter/search change
- [ ] Scroll into view works
- [ ] Navigation disabled when modals open
- [ ] All 111 existing tests still pass

---

## File Changes
```
frontend/src/components/App.tsx       # Selection state + handlers
frontend/src/components/NewsGrid.tsx  # Selected prop + visual
frontend/src/styles/global.css        # Selected card styles
test/navigation.test.js               # New: keyboard navigation tests
```

---

## Test Plan (TDD)
```javascript
test/navigation.test.js:
- j increments selectedIndex
- k decrements selectedIndex
- Enter calls handleOpenShare with correct item
- Selection resets on filter change
- Selection clamps at boundaries
- Navigation disabled when modal open
- Selected card has data-selected attribute
```