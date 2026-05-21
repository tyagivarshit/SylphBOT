import cron from "node-cron";
import { commerceProjectionService } from "../services/commerceProjection.service";
import { reconcilePendingEntitlementSync } from "../services/billingSettlement.service";

const STARTUP_TIME = Date.now();
const STARTUP_GRACE_PERIOD_MS = 90_000;

export const startCommerceReconcileCron = () =>
  cron.schedule("*/5 * * * *", async () => {
    if (Date.now() - STARTUP_TIME < STARTUP_GRACE_PERIOD_MS) {
      console.info("Skipping commerce reconcile execution during startup grace period (90s).");
      return;
    }
    try {
      const result = await commerceProjectionService.replayPendingProviderWebhooks({
        provider: "STRIPE",
        businessId: null,
        limit: 200,
        includeClaimedOlderThanMinutes: 5,
      });
      if (result.scanned > 0) {
        console.info("Commerce reconcile replay", result);
      }
      const entitlement = await reconcilePendingEntitlementSync({
        limit: 200,
      });
      if (entitlement.pending > 0) {
        console.info("Commerce entitlement reconcile replay", entitlement);
      }
    } catch (error) {
      console.error("Commerce reconcile replay failed", error);
    }
  });
