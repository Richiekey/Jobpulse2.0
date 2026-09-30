# Jobpulse Billing State Machine

## Subscription States
The `subscriptions` table tracks the authoritative state of a user's billing lifecycle.

### State: `active`
- **Condition:** Subscription created and successfully paid. `current_period_end` is in the future.
- **Entitlement:** PRO
- **Transitions:**
  - -> `non_renewing` (User cancels before period end)
  - -> `attention` (Renewal payment fails)
  - -> `cancelled` / `completed` (Subscription reaches end of period without renewal)

### State: `non_renewing`
- **Condition:** User initiated cancellation, but the paid period has not yet expired.
- **Entitlement:** PRO
- **Transitions:**
  - -> `active` (User resumes/renews subscription before expiry)
  - -> `cancelled` / `completed` (Timer hits `current_period_end`)

### State: `attention` (Past Due)
- **Condition:** Paystack attempts to charge the card on file for renewal and fails (`invoice.payment_failed`).
- **Entitlement:** PRO (with grace period) or FREE depending on strictness. Initially, we map to FREE to prevent abuse, or show a strict paywall block.
- **Transitions:**
  - -> `active` (User updates card and payment succeeds)
  - -> `cancelled` (Paystack gives up retrying)

### State: `cancelled` / `completed`
- **Condition:** The subscription is fully terminated, either due to non-payment or the `non_renewing` period expiring.
- **Entitlement:** FREE
- **Transitions:**
  - -> `active` (User purchases a new subscription)

## Upgrade / Downgrade Rules
- Upgrading from Free to Pro Monthly or Pro Annual creates a new active subscription.
- Changing from Pro Monthly to Pro Annual (or vice-versa) uses Paystack's built-in plan change behavior. The server records the state via webhooks. No local prorations are calculated.
