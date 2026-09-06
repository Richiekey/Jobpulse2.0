# JobPulse 2.0 — Future Batch UX/UI Contract (Batches V–Y)
**Document ID:** `DOCS-UX-CONTRACT-BATCH-V-Y`  
**Governance Scope:** Binding contract for all subsequent feature batches (V through Y)  
**Authority:** Certified under Batch U Governance  

---

## 1. Purpose & Authority

This contract establishes mandatory, binding architectural rules for all frontend user interface and experience work across upcoming batches:
- **Batch V:** Worker Execution & Verification System
- **Batch W:** Admin Intelligence & Operations
- **Batch X:** Scale, Ingestion & Fault-Tolerance
- **Batch Y:** Launch Readiness & End-to-End Certification

Any pull request or batch implementation that introduces a new user-facing route, modal, table, or interactive flow without adhering to this contract fails governance Gate 6 and cannot be certified.

---

## 2. Inviolable Principles

1. **Backend Authoritative State Only:** The UI must derive all status, counts, and permissions from authoritative server responses. Never invent fake client-side states or fabricate terminal success prior to server receipt confirmation.
2. **No Second Design System:** All UI must strictly reuse canonical tokens from `apps/web/app/globals.css` and primitives from `apps/web/components/ui/`. No raw inline hex colors, ad-hoc font families, or unvetted external CSS libraries are permitted.
3. **Preserve Lifecycle Truthfulness:** The frontend must never collapse distinct async states (`QUEUED ≠ RUNNING ≠ SUCCEEDED ≠ FAILED`). In-flight work must indicate activity without claiming completion.
4. **Append-Only Pagination (UX-01 Standard):** Any paginated list or infinite scroll surface must append newly fetched items, prevent duplicate cards via unique IDs, and preserve previously loaded items upon network error.
5. **Authoritative Roster Integrity (UX-02 Standard):** Any discovery or pending roster must actively exclude entities that have transitioned to completed/applied states once verified by authoritative backend state.
6. **Accessible by Default:** Every interactive surface must support visible keyboard focus, semantic HTML tags, ARIA roles, and screen reader announcements for asynchronous mutations.

---

## 3. Mandatory Specification Template

Every future user-facing feature specification MUST include the following 16-point contract block before coding begins:

```markdown
### Feature Specification: [Feature Name]

1. **Persona:** [Job Seeker | Worker | Admin | Anonymous Visitor]
2. **Route:** [`/jobs`, `/worker/assignments/[id]`, `/admin/sync`, etc.]
3. **Permission:** [Public | Authenticated Seeker | Worker Role | Admin Org Member]
4. **Backend Authority:** [Specific REST endpoint, RPC function, or PostgREST resource]
5. **Reused Components:** [List of `@/components/ui` primitives used: e.g. Button, Card, StatusBadge, DataTable, Modal]
6. **Initial State:** [Initial render before hydration or query dispatch]
7. **Loading State:** [Specific Skeleton variant or LoadingState used]
8. **Success State:** [Complete interactive presentation with canonical typography and badges]
9. **Empty State:** [EmptyState title, explanatory description, and primary recovery action]
10. **Error State:** [ErrorState title, error message, and retry button]
11. **Unauthorized State:** [Sign-in prompt or redirect preservation with returnUrl]
12. **Forbidden State:** [Clear permission denial banner without stack trace]
13. **Retry State:** [Visual indicator showing retry in-progress without clearing existing data]
14. **Terminal State:** [Final success or permanent failure state presentation]
15. **Responsive Behavior:**
    - Mobile (375px): [Stacking order, drawer behavior, horizontal scroll handling]
    - Tablet (768px): [Column layouts, collapsible panes]
    - Desktop (1280px+): [Full multi-pane layout, fixed sidebars]
16. **Accessibility Requirements:** [ARIA live regions, focus trap, ESC key behavior, tab order, screen reader labels]
```

---

## 4. Reusable UI Primitives Reference

All new interfaces must compose the canonical `@/components/ui` library:

| Category | Component | Permitted Usage | Prohibited Alternative |
| :--- | :--- | :--- | :--- |
| **Primitives** | `Button` | All interactive buttons and triggers | `<button style={{ background: 'blue' }}>` |
| | `Input` | Text, email, search, number inputs | Unstyled native `<input>` |
| | `Select` | Dropdown selections | Unstyled native `<select>` |
| | `Badge` | Static metadata pills (ATS, location, salary) | Unstyled spans with inline colors |
| | `StatusBadge` | Dynamic lifecycle status indicators | Hardcoded color text or emojis |
| | `Card` | Surface containers with hover/interactive options | Ad-hoc `<div>` containers with custom shadows |
| | `Modal` | Dialog windows with focus lock & ESC dismissal | Custom popups without ARIA attributes |
| | `ConfirmationDialog` | Destructive or high-impact actions | Native browser `window.confirm()` |
| | `Tabs` | Segmented navigation controls | Ad-hoc list items |
| | `Tooltip` | Contextual explanatory popovers | Browser default `title` attribute |
| **Feedback** | `EmptyState` | Zero-record displays with call-to-action | Blank screens or plain text "None" |
| | `LoadingState` | Full or sectional loading spinners | Ad-hoc spinners without `aria-busy` |
| | `Skeleton` | Content shape placeholders (`card`, `text`, `table`) | Blank flashes before render |
| | `ErrorState` | Actionable error banners with retry CTA | Raw stack traces or silent failures |
| | `Alert` | Contextual system messages (info, warning, danger) | Custom alert boxes |
| **Layout/Data** | `PageHeader` | Top-level section titles and action bars | Inconsistent `<h1>` + button wrappers |
| | `StatCard` | KPI and metric cards with trend indicators | Inconsistent metric boxes |
| | `DataTable` | Tabular data with sortable columns | Unstyled tables without mobile wrappers |
| | `Timeline` | Step-by-step status and audit event logs | Custom vertical line hacks |

---

## 5. Verification Checklist for Future Batches

Before PR submission in Batches V through Y, the author must certify:

- [ ] All 16 points of the Feature Specification Template are documented.
- [ ] No raw CSS colors were written outside `globals.css`.
- [ ] All status displays use `StatusBadge` or map to canonical semantic types.
- [ ] List views implement append-only pagination where pagination exists.
- [ ] Viewports tested at 375px, 768px, and 1280px+.
- [ ] Full keyboard navigation verified without mouse.
- [ ] Automated regression tests added to component or integration suites.
