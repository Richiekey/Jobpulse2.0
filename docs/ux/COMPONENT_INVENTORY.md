# JobPulse 2.0 — UI Component Inventory & Specification
**Document ID:** `DOCS-UX-COMPONENT-INVENTORY-2026-09`  
**Governance Scope:** Batch U Phase 3 Deliverable  
**Directory:** `apps/web/components/ui/`  

---

## 1. Overview

The `apps/web/components/ui/` module is the single authoritative UI component library for JobPulse 2.0. It is dependency-free (relying only on React 19, Lucide React icons, and native HTML/CSS custom properties) and guarantees:
1. **Accessibility Compliance**: Focus rings, ARIA roles, dialog modal traps, and screen-reader announcements.
2. **Operational Truthfulness**: 1:1 mapping with backend domain models via `StatusBadge` and `resolveStatusSemantic`.
3. **Responsive Resilience**: Flexible padding scales and container wrappers.

---

## 2. Core Primitives

### 2.1 `Button`
- **File:** `apps/web/components/ui/Button.tsx`
- **Props:**
  - `variant`: `'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'` (default: `'secondary'`)
  - `size`: `'sm' | 'md' | 'lg'` (default: `'md'`)
  - `isLoading`: `boolean` (renders spinner, disables button, sets `aria-busy="true"`)
  - `leftIcon`, `rightIcon`: `React.ReactNode`
  - standard `React.ButtonHTMLAttributes<HTMLButtonElement>`
- **Accessibility:** `aria-busy`, `:focus-visible` blue ring, disabled cursor when loading.

### 2.2 `Input`
- **File:** `apps/web/components/ui/Input.tsx`
- **Props:**
  - `label`: `string`
  - `helperText`: `string`
  - `error`: `string` (sets `aria-invalid="true"`, highlights border in red)
  - `leftIcon`, `rightIcon`: `React.ReactNode`
  - standard `React.InputHTMLAttributes<HTMLInputElement>`
- **Accessibility:** Linked `id`, `aria-describedby` pointing to error/helper text IDs, accessible label association.

### 2.3 `Select`
- **File:** `apps/web/components/ui/Select.tsx`
- **Props:**
  - `label`: `string`
  - `options`: `{ value: string; label: string }[]`
  - `error`: `string`
  - `helperText`: `string`
  - standard `React.SelectHTMLAttributes<HTMLSelectElement>`
- **Accessibility:** Linked `id`, `aria-describedby`, error alert state.

### 2.4 `Badge`
- **File:** `apps/web/components/ui/Badge.tsx`
- **Props:**
  - `variant`: `'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'`
  - `size`: `'sm' | 'md'`
  - `icon`: `React.ReactNode`
- **Usage:** Categorical tags, ATS platform indicators, salary chips.

### 2.5 `StatusBadge`
- **File:** `apps/web/components/ui/StatusBadge.tsx`
- **Props:**
  - `status`: `string` (canonical domain status string)
  - `type`: optional semantic override (`'success' | 'warning' | 'danger' | 'info' | 'neutral'`)
  - `label`: optional label override
  - `showDot`: `boolean`
  - `showIcon`: `boolean`
  - `size`: `'sm' | 'md'`
- **Domain Mapping Table:**
  - `active`, `verified`, `completed`, `succeeded`, `synced` → `success`
  - `aging`, `pending`, `queued`, `in_progress`, `retrying` → `warning`
  - `stale`, `expired`, `failed`, `rejected`, `dead_letter`, `cancelled` → `danger`
  - `dispatched`, `running`, `processing`, `assigned` → `info`
  - `archived`, `skipped`, `draft` → `neutral`
- **Accessibility:** Includes visually-hidden screen reader status `<span className="sr-only">Status: {label}</span>`.

### 2.6 `Card` (Family)
- **File:** `apps/web/components/ui/Card.tsx`
- **Exports:** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- **Props:**
  - `variant`: `'default' | 'elevated' | 'interactive'`
  - `padding`: `'none' | 'sm' | 'md' | 'lg'`

### 2.7 `Modal`
- **File:** `apps/web/components/ui/Modal.tsx`
- **Props:**
  - `isOpen`: `boolean`
  - `onClose`: `() => void`
  - `title`: `React.ReactNode`
  - `description`: `string`
  - `size`: `'sm' | 'md' | 'lg' | 'xl'`
  - `showCloseButton`: `boolean`
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`, global `Escape` key listener, background scroll lock.

### 2.8 `ConfirmationDialog`
- **File:** `apps/web/components/ui/ConfirmationDialog.tsx`
- **Props:**
  - `isOpen`: `boolean`
  - `title`: `string`
  - `message`: `string`
  - `confirmLabel`: `string`
  - `cancelLabel`: `string`
  - `variant`: `'danger' | 'primary'`
  - `isConfirming`: `boolean`
  - `onConfirm`: `() => void`
  - `onCancel`: `() => void`

### 2.9 `Tabs`
- **File:** `apps/web/components/ui/Tabs.tsx`
- **Props:**
  - `tabs`: `{ id: string; label: string; count?: number; icon?: React.ReactNode }[]`
  - `activeTab`: `string`
  - `onChange`: `(id: string) => void`
- **Accessibility:** `role="tablist"`, `role="tab"`, `aria-selected`.

### 2.10 `Tooltip`
- **File:** `apps/web/components/ui/Tooltip.tsx`
- **Props:**
  - `content`: `string`
  - `children`: `React.ReactElement`
  - `position`: `'top' | 'bottom' | 'left' | 'right'`
- **Accessibility:** `role="tooltip"`, keyboard focus activation.

---

## 3. State & Feedback Components

### 3.1 `EmptyState`
- **File:** `apps/web/components/ui/EmptyState.tsx`
- **Props:**
  - `icon`: `React.ReactNode`
  - `title`: `string`
  - `description`: `string`
  - `actionLabel`: `string`
  - `onAction`: `() => void`
  - `actionSlot`: `React.ReactNode`

### 3.2 `LoadingState`
- **File:** `apps/web/components/ui/LoadingState.tsx`
- **Props:**
  - `message`: `string`
  - `size`: `'sm' | 'md' | 'lg'`
  - `fullHeight`: `boolean`
- **Accessibility:** `role="status"`, `aria-live="polite"`.

### 3.3 `Skeleton`
- **File:** `apps/web/components/ui/Skeleton.tsx`
- **Props:**
  - `variant`: `'text' | 'rectangular' | 'circular' | 'card' | 'table-row'`
  - `width`: `string | number`
  - `height`: `string | number`
  - `count`: `number`
- **Animation:** Pulse-shimmer animation using `@keyframes pulse-shimmer`.

### 3.4 `ErrorState`
- **File:** `apps/web/components/ui/ErrorState.tsx`
- **Props:**
  - `title`: `string`
  - `message`: `string`
  - `errorCode`: `string | number`
  - `onRetry`: `() => void`
  - `isRetrying`: `boolean`
- **Accessibility:** `role="alert"`.

### 3.5 `Alert`
- **File:** `apps/web/components/ui/Alert.tsx`
- **Props:**
  - `variant`: `'success' | 'warning' | 'danger' | 'info'`
  - `title`: `string`
  - `onDismiss`: `() => void`
  - `action`: `React.ReactNode`
- **Accessibility:** `role="alert"`.

---

## 4. Layout & Dense Data Components

### 4.1 `PageHeader`
- **File:** `apps/web/components/ui/PageHeader.tsx`
- **Props:**
  - `title`: `string`
  - `description`: `string`
  - `breadcrumbs`: `{ label: string; href?: string }[]`
  - `backHref`: `string`
  - `actionSlot`: `React.ReactNode`

### 4.2 `StatCard`
- **File:** `apps/web/components/ui/StatCard.tsx`
- **Props:**
  - `label`: `string`
  - `value`: `string | number`
  - `subtext`: `string`
  - `trend`: `{ value: number | string; isPositive?: boolean; label?: string }`
  - `icon`: `React.ReactNode`
  - `isLoading`: `boolean`

### 4.3 `DataTable`
- **File:** `apps/web/components/ui/DataTable.tsx`
- **Props:**
  - `columns`: `{ key: string; header: string; render?: (item: T, index: number) => React.ReactNode; width?: string; align?: 'left' | 'center' | 'right' }[]`
  - `data`: `T[]`
  - `rowKey`: `(item: T, index: number) => string`
  - `isLoading`: `boolean`
  - `emptyMessage`: `string`
  - `onRowClick`: `(item: T) => void`
- **Responsiveness:** Embedded `.table-responsive-container` wrapper preventing horizontal layout blowout.

### 4.4 `Timeline`
- **File:** `apps/web/components/ui/Timeline.tsx`
- **Props:**
  - `items`: `{ id: string; title: string; timestamp: string; description?: React.ReactNode; status?: string; icon?: React.ReactNode }[]`
- **Usage:** Audit trails, sync history, worker lifecycle tracking.
