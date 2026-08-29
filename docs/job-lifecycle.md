# JobPulse 2.0 — Job Lifecycle & Stale Detection

## 1. Lifecycle State Machine

A job progresses through well-defined lifecycle states:

```
                  ┌────────────┐
                  │   ACTIVE   │◄───────────────┐
                  └─────┬──────┘                │
                        │                       │
      (1 missed scrape) │                       │ (Job reappears in scrape)
                        ▼                       │
                  ┌────────────┐                │
                  │  SUSPECT   │────────────────┘
                  └─────┬──────┘
                        │
     (3 missed scrapes) │
                        ▼
                  ┌────────────┐
                  │   STALE    │
                  └─────┬──────┘
                        │
  (30 days in STALE or  │
   explicit 404/expiry) │
                        ▼
                  ┌────────────┐
                  │  EXPIRED   │
                  └────────────┘
```

---

## 2. Invariant: Source Scrape Safety

> [!CRITICAL]
> **A failed scraper run is NOT evidence that jobs disappeared.**

The state machine strictly enforces this invariant:

- **Condition A (Confirmed Disappearance)**:
  $$\text{Source Scrape Succeeded} \land \text{Job Missing} \implies \text{Increment Missed Count} \to \text{Transition to Suspect/Stale}$$
- **Condition B (Scrape Failure)**:
  $$\text{Source Scrape Failed} \implies \text{No Lifecycle Transitions (Job Remains Active)}$$

This prevents network blips or ATS rate limits from prematurely expiring valid job listings.

---

## 3. User History Decoupling

User applications (`applications` table) and saved bookmarks (`saved_jobs`) are **independent** of job lifecycle transitions.
When a job transitions from `active` to `stale` or `expired`:
- The public job search feed filters out non-active jobs.
- The user's application tracker retains the complete history, company name, notes, and application status permanently.
