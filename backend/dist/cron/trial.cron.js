"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTrialExpiryCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../config/prisma"));
const startTrialExpiryCron = () => {
    return node_cron_1.default.schedule("0 2 * * *", async () => {
        console.log("Running trial expiry check...");
        try {
            const now = new Date();
            const expiredSubscriptions = await prisma_1.default.subscriptionLedger.findMany({
                where: {
                    status: "TRIALING",
                    trialEndsAt: {
                        not: null,
                        lt: now,
                    },
                },
            });
            if (!expiredSubscriptions.length) {
                console.log("No expired trials found.");
                return;
            }
            await prisma_1.default.subscriptionLedger.updateMany({
                where: {
                    id: {
                        in: expiredSubscriptions.map((row) => row.id),
                    },
                },
                data: {
                    status: "EXPIRED",
                    trialEndsAt: now,
                    renewAt: null,
                },
            });
            console.log(`Expired ${expiredSubscriptions.length} trial subscriptions`);
        }
        catch (error) {
            console.error("Trial Cron Error:", error);
        }
    });
};
exports.startTrialExpiryCron = startTrialExpiryCron;
