# AUTOMEXIA PHASE 5E SELF AUDIT

Date: 2026-04-29

## Canonical Authorities

| Authority | Reachable | Bootstrapped | Invoked | Authoritative Write | Read Later | Replay Safe | Audit Safe | Orphan |
|---|---|---|---|---|---|---|---|---|
| FeatureSnapshotLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| ForecastLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| PredictionLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| OptimizationDecisionLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| ExperimentLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| RecommendationLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| AnomalyLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| SimulationLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| ModelRegistryLedger | YES | YES | YES | YES | YES | YES | YES | NO |
| IntelligencePolicy | YES | YES | YES | YES | YES | YES | YES | NO |
| ManualIntelligenceOverride | YES | YES | YES | YES | YES | YES | YES | NO |

## Engine Coverage

- Forecast Engine: revenue, lead inflow, booking demand, staffing, renewal, churn, support load, slot demand across daily/weekly/monthly/quarterly horizons.
- Prediction Engine: close probability, churn risk, upsell, cross-sell, no-show, refund risk, chargeback risk, payment default risk, escalation probability, fraud risk, VIP potential, LTV score.
- Feature Store: deterministic point-in-time snapshots only.
- Optimization Engine: pricing, discounting, followup timing, slot allocation, rep assignment, staffing, reminder cadence, dunning cadence, renewal timing, offer timing, queue prioritization.
- Experiment Engine: deterministic assignment seed + multivariate support + causal attribution payload.
- Recommendation Engine: action, expected uplift, confidence, risk, rollback plan, reason, adoption/outcome tracking.
- Anomaly Engine: booking/conversion/refund/chargeback/queue/worker/calendar/payment/churn/staff/spam/provider anomaly classes with dedupe and durable alerting.
- Simulation Engine: pricing/headcount/deposit/reminder/discount/capacity/calendar/routing scenarios.
- Drift Monitoring: feature, prediction, outcome drift with auto rollback gate + manual override gate.
- Closed Loop: observe -> predict -> recommend -> auto apply/manual -> measure -> rollback.

## Wiring

Consumes:

- CRM (`Lead`, `LeadIntelligenceProfile`)
- RevenueTouch authority inputs
- Reception (`InboundInteraction`, in-memory reception metrics)
- Human queue (`HumanWorkQueue`, queue health)
- Booking (`AppointmentLedger`, `SlotReservationLedger`, projection feed)
- Commerce (`SubscriptionLedger`, `PaymentAttemptLedger`, `RefundLedger`, `ChargebackLedger`, revenue recognition projection feed)
- EventOutbox signal health

Produces:

- `RecommendationLedger` and `OptimizationDecisionLedger`
- durable outbox intelligence events
- owner feed notifications (`Notification`)
- anomaly alerts (`AnomalyLedger` + outbox)

## Legacy Shadow Check

- No hidden ML side channel introduced.
- No parallel prediction/optimization shadow table introduced.
- Canonical write/read path is ledger-first.
- Deterministic replay keys used for snapshots, predictions, forecasts, decisions, anomalies, simulations.

