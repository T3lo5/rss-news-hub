# Decision: Implicit Interest Learning Deferred

**Date:** 2025-10-28  
**Status:** Deferred (not rejected — revisit when infrastructure allows)  
**Related:** ADR-002 (Database Layer), ADR-001 (Plugin System)

---

## Context

The project already has:
- Explicit interest profile (`user_profiles` table): keywords, topics, preferred sources, excluded keywords
- AI-based relevance scoring (0–100) via `relevance.service.js` → `scoreNewItems()`
- Per-user read state (`news_reads`) and bookmarks (`bookmarks`)

The proposal was to **learn implicitly** from user behavior (clicks, dwell time, shares, bookmarks) and auto-adjust the profile.

---

## Constraints Identified

| Constraint | Detail |
|---|---|
| **Target deployment** | Oracle Cloud Free Tier **x86** (1/8 OCPU ≈ 0.125 vCPU, 1 GB RAM) |
| **Current RAM usage** | ~200–400 MB (Node + SQLite + OS) |
| **Current CPU pattern** | Bursts during RSS fetch + AI scoring |
| **Learning cost** | Periodic batch job (SQL aggregation + heuristic rules) = extra CPU spike + ~10–20 MB RAM |

On x86 Free Tier, **any additional scheduled CPU burst risks:**
- Throttling (CPU steal time)
- OOM kill if combined with fetch/scoring
- Increased latency for Telegram/webhook responses

---

## Alternatives Considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Server-side batch job** (scheduler) | Full automation, rich signals | Needs extra CPU/RAM headroom | ❌ Not viable on x86 |
| **Inline in `fetchAndScoreFeeds()`** | Reuses existing CPU window | Couples learning to fetch schedule; still adds latency | ⚠️ Marginal |
| **Disable AI scoring, keep learning** | Saves CPU from LLM calls | Loses main relevance signal | ❌ Defeats purpose |
| **Client-side only** (hook reads `readAt`/`bookmarks`, suggests in UI) | Zero server cost, works today | Requires user action to accept suggestions | ✅ **Viable now** |
| **Defer until ARM/paid VPS** | Full server-side learning later | Delays feature | ✅ **Chosen** |

---

## Decision

**Defer server-side implicit learning.**  
Revisit when:
- Migration to ARM Free Tier (4 OCPU, 24 GB RAM) **or**
- Paid VPS with ≥ 2 vCPU / 4 GB RAM

**Do now (optional, low effort):**
- Client-side suggestion helper: `useInterestSuggestions` hook that scans local `readAt` + `bookmarks` and proposes keywords/sources in `InterestProfileModal` — user clicks "Apply".

---

## Rationale Summary

> The x86 Free Tier has **no headroom** for periodic batch jobs. Adding a learning scheduler would compete with the core fetch/scoring loop, risking instability for marginal gain. The explicit profile + manual curation already covers 80% of the value. Client-side suggestions give the remaining 20% at zero infrastructure cost.

---

## Revisit Triggers

- [ ] VM upgraded to ARM shape (check `lscpu | grep Architecture`)
- [ ] Migration to paid instance (≥ 2 vCPU, 4 GB RAM)
- [ ] User explicitly requests and accepts ops risk

---

## Files Not Created (Intentional)

- `services/learning.service.js`
- `src/db/repositories/interaction.repository.ts`
- Migration `src/db/migrations/NNNN_interactions.sql`
- Route `POST /api/interactions`
- Frontend hook `useInteractionTracker.ts`

These will be created when/if the decision is reversed.