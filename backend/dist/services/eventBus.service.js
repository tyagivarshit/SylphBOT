"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitAutomationStarted = exports.emitMessageReceived = exports.emitLeadCreated = exports.eventBus = exports.subscribeRevenueBrainEvent = exports.revenueBrainEventBus = exports.registerRevenueBrainSubscriber = exports.publishRevenueBrainEvent = void 0;
const events_1 = __importDefault(require("events"));
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
const emitLeadCreated = (leadId) => {
    exports.eventBus.emit("lead.created", { leadId });
};
exports.emitLeadCreated = emitLeadCreated;
const emitMessageReceived = (leadId) => {
    exports.eventBus.emit("message.received", { leadId });
};
exports.emitMessageReceived = emitMessageReceived;
const emitAutomationStarted = (leadId, flowId) => {
    exports.eventBus.emit("automation.started", { leadId, flowId });
};
exports.emitAutomationStarted = emitAutomationStarted;
