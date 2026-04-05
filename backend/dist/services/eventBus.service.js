"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitAutomationStarted = exports.emitMessageReceived = exports.emitLeadCreated = exports.eventBus = void 0;
const events_1 = __importDefault(require("events"));
class SylphEventBus extends events_1.default {
}
exports.eventBus = new SylphEventBus();
/* EVENTS */
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
