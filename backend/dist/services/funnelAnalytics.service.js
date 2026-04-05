"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackStepConversion = exports.trackStepView = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const trackStepView = async (flowId, stepKey) => {
    try {
        await prisma_1.default.$runCommandRaw({
            insert: "FunnelAnalytics",
            documents: [
                {
                    flowId,
                    stepKey,
                    type: "STEP_VIEW",
                    createdAt: new Date(),
                },
            ],
        });
    }
    catch { }
};
exports.trackStepView = trackStepView;
const trackStepConversion = async (flowId, stepKey) => {
    try {
        await prisma_1.default.$runCommandRaw({
            insert: "FunnelAnalytics",
            documents: [
                {
                    flowId,
                    stepKey,
                    type: "STEP_CONVERSION",
                    createdAt: new Date(),
                },
            ],
        });
    }
    catch { }
};
exports.trackStepConversion = trackStepConversion;
