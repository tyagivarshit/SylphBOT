# Phase 5D - Commerce, Payments, Contracts OS

Canonical authorities added:

- `ProposalLedger`
- `ContractLedger`
- `PaymentIntentLedger`
- `InvoiceLedger`
- `SubscriptionLedger`
- `PaymentAttemptLedger`
- `RefundLedger`
- `ChargebackLedger`
- `SignatureLedger`
- `CommercePolicy`
- `PricingCatalog`
- `DiscountApprovalLedger`
- `RevenueRecognitionLedger`

Lifecycle and policy enums added:

- `ProposalStatus`
- `ContractStatus`
- `SignatureStatus`
- `PaymentIntentStatus`
- `PaymentAttemptStatus`
- `InvoiceLedgerStatus`
- `SubscriptionLedgerStatus`
- `RefundStatus`
- `ChargebackStatus`
- `CommerceProvider`
- `CommerceActor`
- `DiscountApprovalStatus`
- `RevenueRecognitionStage`
- `PricingModel`

This migration establishes a deterministic commerce authority layer with
outbox-coupled events and replay-safe idempotency keys.

Phase 5D.1 hard cutover closure:

- Legacy `Subscription` and `Invoice` mirrors were fully removed.
- `SubscriptionLedger` and `InvoiceLedger` are the only billing truth.
- Commerce reconciliation runs only through canonical commerce webhooks/services.
