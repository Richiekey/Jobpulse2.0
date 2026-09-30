# Jobpulse2.0 — Web Application Inspection (Pass 9)

## 1. Stack & Architecture
* **Framework**: Next.js (App Router).
* **Styling**: `globals.css` (No Tailwind, uses vanilla CSS variables and custom utility classes).
* **Testing**: Vitest.
* **Deployment**: Configured for Firebase App Hosting (`apphosting.yaml`) and Vercel (`vercel.json`).

## 2. Core Routes
* `/`: The main split-pane UI. The `page.tsx` is very large (48KB) suggesting a highly interactive, monolithic dashboard/feed component architecture.
* `/admin`: Admin dashboard for metrics and telemetry.
* `/companies`: Company-specific job pages.
* `/worker`: Internal dashboard/views for worker execution metrics.
* `/auth`, `/login`: Supabase Auth endpoints.

## 3. Findings
* The frontend heavily relies on client-side state for the split-pane UI.
* Monetization (which is the next big feature) will likely interface deeply with the massive `page.tsx` feed and possibly the `/companies` routes.
* Data fetching likely utilizes Supabase SSR clients (server components where possible).

## 4. Conclusion
The frontend is built for high-density information display. The 48KB root page file indicates it handles significant logic (filtering, pagination, selection state).
