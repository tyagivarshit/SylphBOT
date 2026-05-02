import cron from "node-cron";
import { commerceProjectionService } from "../services/commerceProjection.service";
import { reconcilePendingEntitlementSync } from "../services/billingSettlement.service";

export const startCommerceReconcileCron = () =>
  cron.schedule("*/5 * * * *", async () => {
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
