# JobPulse 2.0 — Canonical Design System Specification
**Document ID:** `DOCS-UX-DESIGN-SYSTEM-2026-09`  
**Governance Scope:** Batch U Phase 2 Deliverable  
**Implementation Surface:** `apps/web/app/globals.css`  

---

## 1. Design Philosophy

JobPulse 2.0 employs a focused, high-contrast, editorial dark theme built entirely on **Vanilla CSS Custom Properties**. It avoids heavy, bloated third-party CSS-in-JS frameworks or conflicting utility engines.

Key Design Tenets:
1. **Operational Truthfulness**: UI visual states must faithfully project authoritative backend domain models.
2. **Color-Independent Meaning**: Colors are always paired with labels, status text, or distinct icons. Assistive technologies and colorblind users never rely on hue alone.
3. **Strict 4px Spacing Grid**: All paddings, margins, gaps, and component dimensions adhere to multiples of 4px.
4. **Physical Surface Depth**: Dark surfaces use restrained contrast steps and physical alpha shadows rather than distracting bright neon glows.

---

## 2. Typography System

JobPulse relies on three coordinated type families:
- **Body & Data**: `Inter` — Crisp, legible at small sizes, optimal for dense tabular data and descriptions.
- **Headings & Display**: `Plus Jakarta Sans` — Modern, geometric, authoritative heading typography.
- **Identifiers & Tokens**: `JetBrains Mono` — Monospaced font for database IDs, hashes, timestamps, and API telemetry.

### Typography Scale

| Token | CSS Variable | Value | Line Height | Typical Usage |
| :--- | :--- | :--- | :--- | :--- |
| `xs` | `--font-size-xs` | `0.75rem` (12px) | `1.2` | Badges, micro-labels, metadata tags |
| `sm` | `--font-size-sm` | `0.8125rem` (13px) | `1.35` | Form helper text, secondary button labels, breadcrumbs |
| `base` | `--font-size-base` | `0.875rem` (14px) | `1.5` | Standard body text, table cells, form inputs |
| `md` | `--font-size-md` | `1rem` (16px) | `1.5` | Section headers, card titles, prominent body |
| `lg` | `--font-size-lg` | `1.125rem` (18px) | `1.35` | Sub-page headers, modal titles |
| `xl` | `--font-size-xl` | `1.25rem` (20px) | `1.2` | Stat card metrics, primary surface titles |
| `2xl` | `--font-size-2xl` | `1.5rem` (24px) | `1.2` | Page titles, primary KPI numbers |
| `3xl` | `--font-size-3xl` | `1.875rem` (30px) | `1.2` | Public discovery hero titles |

---

## 3. Spacing Scale (4px Base Grid)

All layout containers, flex gaps, and component margins must utilize `--space-*` tokens.

| Token | Variable | Value | Usage |
| :--- | :--- | :--- | :--- |
| `0` | `--space-0` | `0px` | Reset |
| `1` | `--space-1` | `4px` | Micro gaps between icon and text, tight badge padding |
| `2` | `--space-2` | `8px` | Gap between chips, card header padding vertical |
| `3` | `--space-3` | `12px` | Standard button padding horizontal, compact card gap |
| `4` | `--space-4` | `16px` | Standard card internal padding, form group gap |
| `5` | `--space-5` | `20px` | Page section spacing, modal header padding |
| `6` | `--space-6` | `24px` | Section margins, grid gaps |
| `8` | `--space-8` | `32px` | Major section separators |
| `10` | `--space-10` | `40px` | Hero container vertical padding |
| `12` | `--space-12` | `48px` | Page container top/bottom padding |
| `16` | `--space-16` | `64px` | Full page empty state vertical spacing |

---

## 4. Surfaces, Borders & Elevation

| Token | Variable | Color / Value | Usage |
| :--- | :--- | :--- | :--- |
| App Background | `--bg-app` | `#090d16` | Root document canvas background |
| Surface | `--bg-surface` | `#0f1523` | Default card and panel background |
| Elevated Surface | `--bg-surface-elevated` | `#151c2e` | Modals, dropdown menus, table headers |
| Hover Surface | `--bg-surface-hover` | `#1b243b` | Interactive hover states on cards/buttons |
| Subtle Surface | `--bg-surface-subtle` | `#111827` | Filter drawer, inactive tabs, code blocks |
| Subtle Border | `--border-subtle` | `#1e293b` | Card dividers, subtle list borders |
| Default Border | `--border-default` | `#26354a` | Standard container outlines, input borders |
| Strong Border | `--border-strong` | `#334561` | Active tabs, hovered card borders |
| Focus Border | `--border-focus` | `#3b82f6` | Keyboard focus ring (`:focus-visible`) |

---

## 5. Canonical Semantic Status System

Every domain lifecycle state maps to one of five semantic tiers:

| Semantic Tier | Background Token | Border Token | Text Token | Domain States Mapped |
| :--- | :--- | :--- | :--- | :--- |
| **SUCCESS** | `--status-success-bg` | `--status-success-border` | `--status-success-text` | `active`, `verified`, `succeeded`, `completed`, `synced` |
| **WARNING** | `--status-warning-bg` | `--status-warning-border` | `--status-warning-text` | `aging`, `queued`, `pending`, `in_progress`, `retrying` |
| **DANGER** | `--status-danger-bg` | `--status-danger-border` | `--status-danger-text` | `stale`, `expired`, `failed`, `rejected`, `dead_letter` |
| **INFO** | `--status-info-bg` | `--status-info-border` | `--status-info-text` | `dispatched`, `running`, `processing`, `assigned` |
| **NEUTRAL** | `--status-neutral-bg` | `--status-neutral-border` | `--status-neutral-text` | `archived`, `skipped`, `cancelled`, `draft`, `unreviewed` |

---

## 6. Accessibility & Keyboard Interaction Standards

1. **Visible Focus Rings**:
   All interactive elements (`<button>`, `<a>`, `<input>`, `<select>`, `[tabindex]`) display a 2px high-contrast blue focus ring with 2px offset on keyboard navigation:
   ```css
   :focus-visible {
     outline: 2px solid var(--border-focus);
     outline-offset: 2px;
   }
   ```
2. **Accessible Dialogs (`Modal.tsx`)**:
   - `role="dialog"` and `aria-modal="true"`.
   - `aria-labelledby` linked to dialog heading.
   - Global `Escape` key handler dismissing the modal.
   - Focus trapped inside the active dialog container.
3. **Color Independence**:
   - Every `StatusBadge` contains both a semantic color pill and explicit human-readable text.
   - Crucial alerts feature a leading Lucide icon (`CheckCircle2`, `AlertTriangle`, `XCircle`, `RefreshCw`).
4. **Assistive Text (`.sr-only`)**:
   - Visual-only indicators (e.g. status dots or spinners) provide screen-reader announcements via `<span className="sr-only">`.

---

## 7. Responsive Viewport Targets

| Breakpoint | Target Device | Layout Strategy |
| :--- | :--- | :--- |
| **`< 768px`** (Mobile) | Small screens (375px+) | Single-column stacked layouts, mobile bottom/slide-out drawer for filters, horizontally scrollable data tables (`.table-responsive-container`), modal max-width 100%. |
| **`768px – 1024px`** (Tablet) | Tablets, split-screen | Two-column grid, collapsed inspector sidebar into floating sheet or modal, responsive stat cards (2x2 grid). |
| **`≥ 1024px`** (Desktop) | Large screens (1280px+) | Persistent 3-column public discovery view (Filters + Feed + Deep Inspector Pane), full-width admin dashboards, data-dense operational tables. |
