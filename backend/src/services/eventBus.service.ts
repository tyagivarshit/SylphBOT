import EventEmitter from "events";

class SylphEventBus extends EventEmitter {}

export const eventBus = new SylphEventBus();

/* EVENTS */

export const emitLeadCreated = (leadId: string) => {
  eventBus.emit("lead.created", { leadId });
};

export const emitMessageReceived = (leadId: string) => {
  eventBus.emit("message.received", { leadId });
};

export const emitAutomationStarted = (leadId: string, flowId: string) => {
  eventBus.emit("automation.started", { leadId, flowId });
};