# Paystack Integration Strategy

## 1. Plan Management
Plans are created directly in the Paystack Dashboard:
- Jobpulse Pro Monthly (₦7,500 / month)
- Jobpulse Pro Annual (₦75,000 / year)

The resulting `plan_code` (e.g. `PLN_xyz123`) is recorded in the `billing_plans` table alongside the standard identifier (`pro_monthly`, `pro_annual`). The UI never hardcodes the price or `plan_code`, but pulls it from the backend via the `billing_plans` table.

## 2. Server-Side Initialization
When a user clicks "Upgrade to Pro":
1. The client sends `POST /api/billing/checkout` with `plan_id` (`pro_monthly` or `pro_annual`).
2. The server authenticates the user, fetches the corresponding `plan_code` and `amount` from `billing_plans`.
3. The server calls the Paystack Initialize Transaction API (`POST https://api.paystack.co/transaction/initialize`).
4. Essential metadata is attached to the request: `{"user_id": "uuid", "plan_id": "pro_monthly"}`.
5. The server returns the `authorization_url` to the client.

## 3. Webhook Handling
A webhook endpoint `POST /api/webhooks/paystack` listens for lifecycle events.
- **Idempotency:** Every event includes an ID or fingerprint. The server records this in `billing_webhook_events`. If it exists, processing is skipped.
- **Security:** Validates the `x-paystack-signature` HMAC SHA512 header using `PAYSTACK_SECRET_KEY`.

### Handled Events
- `charge.success`: Maps to a successful payment. If it's a first-time charge for a subscription, it ensures the subscription is active.
- `subscription.create`: Creates a new row in `subscriptions`.
- `subscription.disable` / `subscription.not_renew`: Sets subscription to `non_renewing` or `cancelled`.
- `invoice.payment_failed`: Sets subscription to `attention`.
- `invoice.update`: Updates renewal dates.
