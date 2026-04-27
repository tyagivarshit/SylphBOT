"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCleanupCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const cron_cleanup_1 = require("./cron.cleanup");
const startCleanupCron = () => node_cron_1.default.schedule("0 2 * * *", async () => {
    await (0, cron_cleanup_1.runCleanup)();
});
exports.startCleanupCron = startCleanupCron;
