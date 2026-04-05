"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startUsageResetCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../config/prisma"));
/*
Runs on the first day of every month at 00:00
*/
const startUsageResetCron = () => {
    node_cron_1.default.schedule("0 0 1 * *", async () => {
        try {
            console.log("🔄 Running monthly usage reset...");
            await prisma_1.default.usage.deleteMany({});
            console.log("✅ Usage reset completed");
        }
        catch (error) {
            console.error("❌ Usage reset failed:", error);
        }
    });
};
exports.startUsageResetCron = startUsageResetCron;
