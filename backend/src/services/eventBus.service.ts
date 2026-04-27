import EventEmitter from "events";
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

export const emitLeadCreated = (leadId: string) => {
  eventBus.emit("lead.created", { leadId });
};

export const emitMessageReceived = (leadId: string) => {
  eventBus.emit("message.received", { leadId });
};

export const emitAutomationStarted = (leadId: string, flowId: string) => {
  eventBus.emit("automation.started", { leadId, flowId });
};
