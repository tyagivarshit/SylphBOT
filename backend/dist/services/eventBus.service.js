"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitAutomationStarted = exports.emitMessageReceived = exports.emitLeadCreated = exports.eventBus = exports.subscribeRevenueBrainEvent = exports.revenueBrainEventBus = exports.registerRevenueBrainSubscriber = exports.publishRevenueBrainEvent = void 0;
const events_1 = __importDefault(require("events"));
const core_1 = require("../runtime/core");
var eventBus_service_1 = require("./revenueBrain/eventBus.service");
Object.defineProperty(exports, "publishRevenueBrainEvent", { enumerable: true, get: function () { return eventBus_service_1.publishRevenueBrainEvent; } });
Object.defineProperty(exports, "registerRevenueBrainSubscriber", { enumerable: true, get: function () { return eventBus_service_1.registerRevenueBrainSubscriber; } });
Object.defineProperty(exports, "revenueBrainEventBus", { enumerable: true, get: function () { return eventBus_service_1.revenueBrainEventBus; } });
Object.defineProperty(exports, "subscribeRevenueBrainEvent", { enumerable: true, get: function () { return eventBus_service_1.subscribeRevenueBrainEvent; } });
const globalForLegacyEventBus = globalThis;
exports.eventBus = globalForLegacyEventBus.__automexiaLegacyEventBus || new events_1.default();
if (!globalForLegacyEventBus.__automexiaLegacyEventBus) {
    globalForLegacyEventBus.__automexiaLegacyEventBus = exports.eventBus;
}
let adapterSubscribed = false;
const getRuntimeEventBus = () => {
    if (core_1.container && core_1.container.has("IEventBus")) {
        const runtimeBus = core_1.container.resolve("IEventBus");
        try {
            const cr = core_1.container.resolve("IContractRegistry");
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
                runtimeBus.subscribe("lead.created", (envelope) => {
                    originalEmit.call(exports.eventBus, "lead.created", envelope.payload);
                });
                runtimeBus.subscribe("message.received", (envelope) => {
                    originalEmit.call(exports.eventBus, "message.received", envelope.payload);
                });
                runtimeBus.subscribe("automation.started", (envelope) => {
                    originalEmit.call(exports.eventBus, "automation.started", envelope.payload);
                });
                adapterSubscribed = true;
                console.log("[Legacy Event Adapter] Subscribed to Runtime EventBus and forwarding to legacy emitter.");
            }
        }
        catch (e) {
            console.error("[Legacy Event Adapter] Subscription failed:", e);
        }
        return runtimeBus;
    }
    return null;
};
// Override emit to prevent direct publishing bypassing runtime
const originalEmit = exports.eventBus.emit;
exports.eventBus.emit = function (event, ...args) {
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
const emitLeadCreated = (leadId) => {
    const runtimeBus = getRuntimeEventBus();
    if (runtimeBus) {
        runtimeBus.publish("lead.created", "1.0.0", { leadId }, { tenantId: "default_tenant" }).catch(() => { });
    }
    else {
        originalEmit.call(exports.eventBus, "lead.created", { leadId });
    }
};
exports.emitLeadCreated = emitLeadCreated;
const emitMessageReceived = (leadId) => {
    const runtimeBus = getRuntimeEventBus();
    if (runtimeBus) {
        runtimeBus.publish("message.received", "1.0.0", { leadId }, { tenantId: "default_tenant" }).catch(() => { });
    }
    else {
        originalEmit.call(exports.eventBus, "message.received", { leadId });
    }
};
exports.emitMessageReceived = emitMessageReceived;
const emitAutomationStarted = (leadId, flowId) => {
    const runtimeBus = getRuntimeEventBus();
    if (runtimeBus) {
        runtimeBus.publish("automation.started", "1.0.0", { leadId, flowId }, { tenantId: "default_tenant" }).catch(() => { });
    }
    else {
        originalEmit.call(exports.eventBus, "automation.started", { leadId, flowId });
    }
};
exports.emitAutomationStarted = emitAutomationStarted;
