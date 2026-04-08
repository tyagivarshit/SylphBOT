"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.funnelQueue = void 0;
const bullmq_1 = require("bullmq");
exports.funnelQueue = new bullmq_1.Queue("funnelQueue", {
    connection: { url: process.env.REDIS_URL },
    prefix: "sylph",
});
