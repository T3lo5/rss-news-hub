# Plan: Dockerfile + CI + Theme/Keyboard Shortcuts

## Objective
Add production-ready Dockerfile with multi-stage build, GitHub Actions CI pipeline, and frontend polish (theme toggle + keyboard shortcuts).

---

## Phase 1: Dockerfile

### 1.1 Multi-stage Dockerfile
- **Stage 1 (builder)**: Install deps, build frontend (Vite), compile if needed
- **Stage 2 (runtime)**: Node.js slim, copy built assets, run server
- Non-root user
- Health check endpoint

### 1.2 .dockerignore
- Exclude node_modules, .git, test/, docs/, data/, *.log

### 1.3 docker-compose.yml (optional)
- For local dev with hot reload
- Separate from production Dockerfile

---

## Phase 2: GitHub Actions CI

### 2.1 Workflow: `.github/workflows/ci.yml`
- **On**: push to main, PR to main
- **Jobs**:
  - `lint-test`: Node.js 20, install, `npm test`
  - `build-frontend`: Build Vite, verify output
  - `build-docker`: Build Docker image, test startup
  - `docker-push` (on main): Push to GHCR

### 2.2 Cache
- npm cache for deps
- Vite build cache

---

## Phase 3: Theme Toggle (Frontend)

### 3.1 CSS Variables (already exist in :root)
- Add light theme variant
- Toggle via `data-theme` attribute on `<html>`

### 3.2 Theme Context + Hook
- `ThemeProvider` wraps App
- `useTheme()` hook returns `{ theme, toggleTheme }`
- Persist in localStorage

### 3.3 Header Button
- Sun/moon icon toggle
- ARIA accessible

### 3.4 Tests
```
test/theme.test.js
- theme context provides correct values
- toggle switches theme
- persists to localStorage
```

---

## Phase 4: Keyboard Shortcuts

### 4.1 Shortcut Map
| Key | Action |
|-----|--------|
| `/` | Focus search |
| `j` / `k` | Next/prev news card |
| `Enter` | Open selected |
| `g` | Generate AI content (if modal open) |
| `t` | Send to Telegram (if modal open) |
| `c` | Copy generated content |
| `s` | Open stats modal |
| `r` | Refresh (trigger fetch) |
| `Escape` | Close modals |
| `?` | Show help overlay |

### 4.2 Implementation
- `useKeyboardShortcuts` hook
- Global listener on `<body>`
- Respect input/textarea focus (don't trigger)
- Help modal (`?` key)

### 4.3 Tests
```
test/shortcuts.test.js
- shortcuts register correctly
- disabled when typing in input
- help modal opens
```

---

## File Structure
```
.dockerignore
Dockerfile
docker-compose.yml
.github/
  workflows/
    ci.yml
frontend/
  src/
    contexts/
      ThemeContext.tsx
    hooks/
      useTheme.ts
      useKeyboardShortcuts.ts
    components/
      ThemeToggle.tsx
      ShortcutsHelp.tsx
    styles/
      themes.css (or extend global.css)
test/
  theme.test.js
  shortcuts.test.js
docs/
  plan.md (updated)
```

---

## Acceptance Criteria
- [ ] `docker build` succeeds, `docker run` serves app on port 3000
- [ ] GitHub Actions runs tests on every PR
- [ ] Theme toggle works, persists across reloads
- [ ] Keyboard shortcuts work globally (except in inputs)
- [ ] Help overlay shows all shortcuts
- [ ] All tests pass (TDD)