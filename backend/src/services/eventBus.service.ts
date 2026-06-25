import EventEmitter from "events";
import { container } from "../runtime/core";
import { EventBus } from "../runtime/communication/eventBus";

export {
  publishRevenueBrainEvent,
  registerRevenueBrainSubscriber,
  revenueBrainEventBus,
  subscribeRevenueBrainEvent,
} from "./revenueBrain/eventBus.service";

const globalForLegacyEventBus = globalThis as typeof globalThis & {
  __automexiaLegacyEventBus?: EventEmitter;
};

export const eventBus =
  globalForLegacyEventBus.__automexiaLegacyEventBus || new EventEmitter();

if (!globalForLegacyEventBus.__automexiaLegacyEventBus) {
  globalForLegacyEventBus.__automexiaLegacyEventBus = eventBus;
}

let adapterSubscribed = false;
const getRuntimeEventBus = (): EventBus | null => {
  if (container && container.has("IEventBus")) {
    const runtimeBus = container.resolve<EventBus>("IEventBus");
    try {
      const cr = container.resolve<any>("IContractRegistry");
      if (cr) {
        if (!cr.getContract("lead.created")) {
          cr.registerContract({ name: "lead.created", version: "1.0.0", schema: {} });
        }
        if (!cr.getContract("message.received")) {
          cr.registerContract({ name: "message.received", version: "1.0.0", schema: {} });
        }
        if (!cr.getContract("automation.started")) {
          cr.registerContract({ name: "automation.started", version: "1.0.0", schema: {} });
        }
      }

      // Initialize legacy compatibility adapter
      if (!adapterSubscribed) {
        runtimeBus.subscribe("lead.created", (envelope: any) => {
          originalEmit.call(eventBus, "lead.created", envelope.payload);
        });
        runtimeBus.subscribe("message.received", (envelope: any) => {
          originalEmit.call(eventBus, "message.received", envelope.payload);
        });
        runtimeBus.subscribe("automation.started", (envelope: any) => {
          originalEmit.call(eventBus, "automation.started", envelope.payload);
        });
        adapterSubscribed = true;
        console.log("[Legacy Event Adapter] Subscribed to Runtime EventBus and forwarding to legacy emitter.");
      }
    } catch (e) {
      console.error("[Legacy Event Adapter] Subscription failed:", e);
    }
    return runtimeBus;
  }
  return null;
};

// Override emit to prevent direct publishing bypassing runtime
const originalEmit = eventBus.emit;
eventBus.emit = function (event: string | symbol, ...args: any[]): boolean {
  const stack = new Error().stack || "";
  const isAuthorized = stack.includes("eventBus.js") || 
                      stack.includes("eventBus.ts") || 
                      stack.includes("bootstrap") ||
                      stack.includes("test");
  if (!isAuthorized) {
    const { RuntimeGuard } = require("../runtime/kernel/runtimeGuard");
    RuntimeGuard.enforceEventRouting(String(event));
  }
  return originalEmit.apply(this, [event, ...args]);
};

export const emitLeadCreated = (leadId: string) => {
  const runtimeBus = getRuntimeEventBus();
  if (runtimeBus) {
    runtimeBus.publish("lead.created", "1.0.0", { leadId }, { tenantId: "default_tenant" }).catch(() => {});
  } else {
    originalEmit.call(eventBus, "lead.created", { leadId });
  }
};

export const emitMessageReceived = (leadId: string) => {
  const runtimeBus = getRuntimeEventBus();
  if (runtimeBus) {
    runtimeBus.publish("message.received", "1.0.0", { leadId }, { tenantId: "default_tenant" }).catch(() => {});
  } else {
    originalEmit.call(eventBus, "message.received", { leadId });
  }
};

export const emitAutomationStarted = (leadId: string, flowId: string) => {
  const runtimeBus = getRuntimeEventBus();
  if (runtimeBus) {
    runtimeBus.publish("automation.started", "1.0.0", { leadId, flowId }, { tenantId: "default_tenant" }).catch(() => {});
  } else {
    originalEmit.call(eventBus, "automation.started", { leadId, flowId });
  }
};
