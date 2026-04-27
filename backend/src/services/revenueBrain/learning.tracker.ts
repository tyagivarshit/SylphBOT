import { processAutoLearning } from "../aiAutoLearning.service";
import { isRevenueBrainProductionLearningEligible } from "./deliveryPolicy.service";
import {
  registerRevenueBrainSubscriber,
  subscribeRevenueBrainEvent,
} from "./eventBus.service";

export const registerRevenueBrainLearningTracker = () => {
  registerRevenueBrainSubscriber("revenue_brain.learning", () => {
    subscribeRevenueBrainEvent(
      "revenue_brain.delivery_confirmed",
      async (event) => {
        const snapshot = event.planSnapshot;

        if (
          !snapshot ||
          snapshot.preview ||
          event.route === "NO_REPLY" ||
          event.route === "ESCALATE"
        ) {
          return;
        }

        if (
          !isRevenueBrainProductionLearningEligible({
            mode: event.delivery.mode,
            preview: event.delivery.preview,
            simulation: event.delivery.simulation,
            sandbox: event.delivery.sandbox,
            production: event.delivery.production,
          })
        ) {
          return;
        }

        await processAutoLearning({
          businessId: event.businessId,
          clientId: snapshot.clientId || null,
          message: snapshot.inputMessage,
          aiReply: event.reply.message,
        });
      },
      {
        handlerId: "learning.delivery_confirmed",
      }
    );

    subscribeRevenueBrainEvent(
      "revenue_brain.delivery_failed",
      async (event) => {
        if (
          !event.planSnapshot ||
          !event.failure.terminal ||
          !isRevenueBrainProductionLearningEligible({
            mode: event.delivery.mode,
            preview: event.delivery.preview,
            simulation: event.delivery.simulation,
            sandbox: event.delivery.sandbox,
            production: event.delivery.production,
          })
        ) {
          return;
        }

        const { runSalesOptimizer } = await import("../salesAgent/optimizer.service");

        await runSalesOptimizer({
          businessId: event.businessId,
          clientId: event.planSnapshot.clientId || null,
        });
      },
      {
        handlerId: "learning.delivery_failed",
      }
    );
  });
};
