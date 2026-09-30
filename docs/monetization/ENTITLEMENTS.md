# Jobpulse Entitlements Matrix

The entitlement layer acts as a strict server-side boundary, mapping a user's subscription state to explicit boolean capabilities.

## Plans & Capabilities

| Capability | Free | Pro Monthly | Pro Annual |
|------------|------|-------------|------------|
| `can_browse_jobs` | Yes | Yes | Yes |
| `can_use_advanced_filters` | No | Yes | Yes |
| `max_saved_jobs` | 10 | Unlimited | Unlimited |
| `max_active_alerts` | 2 | Unlimited | Unlimited |
| `can_track_applications` | Limited (10) | Unlimited | Unlimited |
| `can_use_resume_tools` | No | Yes | Yes |
| `can_view_application_analytics` | No | Yes | Yes |

## Enforcement Flow
1. **API Middleware / Route Handler:** Intercepts the request.
2. **`getUserEntitlements(userId)`:** Queries the database for the user's active subscription. If no active subscription exists, or it's expired, it returns the FREE entitlement set.
3. **Capability Check:** Checks if the requested action is permitted (e.g. `entitlements.can_use_advanced_filters === true`).
4. **Denial:** If false, returns a HTTP `403 Forbidden` with a standardized payload indicating a paywall requirement.

## UI Paywall
When the frontend encounters a paywall limit (e.g., trying to save the 11th job on Free), it opens a reusable `<UpgradeModal />`. This modal clearly lists the benefits of Pro and provides the checkout initialization flows for both Monthly and Annual intervals.
