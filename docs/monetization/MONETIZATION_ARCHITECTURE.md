# Jobpulse Monetization Architecture

## 1. Existing Auth & Database Model
Currently, Jobpulse uses **Supabase Auth** (`auth.users`) to handle identity. 
When a user signs up, a trigger creates a corresponding record in `public.profiles`.

The existing `profiles` table structure is basic:
- `id` (references `auth.users`)
- `email`
- `full_name`
- `avatar_url`
- `role` (user or admin)

There are no existing billing or subscription tables in the current production schema. Environment variables follow the `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` conventions, with integration settings gated safely. RLS is cleanly set up with policies relying on `auth.uid() = id`.

## 2. Monetization Integration Strategy
We will not modify the `auth.users` or duplicate the `profiles` table. Instead, we will extend the schema relationally by adding dedicated monetization tables that reference `auth.users(id)`. 

### New Database Entities
- **`billing_plans`**: To store the canonical representations of the Free, Pro Monthly, and Pro Annual tiers.
- **`subscriptions`**: Maps a user (`user_id`) to a `billing_plan`, holding Paystack reference IDs and lifecycle dates.
- **`payments`**: Records individual invoice/transaction successes from Paystack.
- **`billing_webhook_events`**: Stores raw webhook events for idempotency and debugging.

### Entitlement Layer
A centralized entitlement resolver (`getUserEntitlements(userId)`) will be created in the `domain` layer or the server API utilities. It will query the active `subscriptions` and map the associated `billing_plans` code to explicit capabilities (e.g., `can_use_advanced_filters`, `unlimited_saved_jobs`). All Next.js API routes (`/api/jobs`, `/api/applications`, etc.) and Server Actions will funnel through this resolver.

### Paystack Flow
1. **Checkout Init**: `POST /api/billing/checkout` will create a Paystack transaction/subscription session on the server and return an authorization URL.
2. **Webhook**: `POST /api/webhooks/paystack` will process `subscription.create`, `charge.success`, `invoice.payment_failed`, etc., verifying signatures and updating the `subscriptions` and `payments` tables idempotently.

### Security Boundaries
- RLS on billing tables will prevent users from writing or tampering with their subscription state. Read-only access to their own subscription might be permitted for UI rendering.
- Webhook endpoints will strictly validate Paystack's `x-paystack-signature` using a secret environment variable (`PAYSTACK_SECRET_KEY`) that is never exposed to the browser.
