"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTrialExpiryCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../config/prisma"));
const startTrialExpiryCron = () => {
    node_cron_1.default.schedule("0 2 * * *", async () => {
        console.log("⏳ Running trial expiry check...");
        try {
            const now = new Date();
            const expiredSubscriptions = await prisma_1.default.subscription.findMany({
                where: {
                    isTrial: true,
                    status: "ACTIVE",
                    currentPeriodEnd: {
                        not: null,
                        lt: now,
                    },
                },
            });
            if (expiredSubscriptions.length === 0) {
                console.log("No expired trials found.");
                return;
            }
            console.log(`Found ${expiredSubscriptions.length} expired trials`);
            await prisma_1.default.subscription.updateMany({
                where: {
                    id: {
                        in: expiredSubscriptions.map((s) => s.id),
                    },
                },
                data: {
                    status: "INACTIVE",
                    isTrial: false,
                },
            });
            console.log(`Deactivated ${expiredSubscriptions.length} expired trials`);
        }
        catch (error) {
            console.error("Trial Cron Error:", error);
        }
    });
};
exports.startTrialExpiryCron = startTrialExpiryCron;
