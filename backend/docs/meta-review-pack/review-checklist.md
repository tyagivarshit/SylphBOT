# Meta App Review Checklist

1. Instagram OAuth uses signed `state` and callback redirect validation.
2. Instagram long-lived token exchange completes and required permissions are granted.
3. Instagram page to professional account binding is visible in canonical audit logs.
4. Instagram webhook challenge verification succeeds and webhook status is `ACTIVE`.
5. Instagram profile fetch and permission audit are visible in connect projection.
6. WhatsApp OAuth and WABA/number selection path is completed.
7. WhatsApp number registration, callback verification, and health test are logged.
8. WhatsApp display name review status, quality rating, and messaging tier are tracked.
9. Replay/out-of-order webhook protection is enabled for Instagram and WhatsApp.
10. Token lifecycle sweep and refresh traces are visible in canonical audit logs.
11. Connect Doctor reports clear guided fixes for non-auto-recoverable issues.
12. Cold boot reconcile path repairs webhook/health drift deterministically.
