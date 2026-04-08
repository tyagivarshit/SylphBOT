"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationQueue = void 0;
const bullmq_1 = require("bullmq");
const env_1 = require("../config/env");
exports.automationQueue = new bullmq_1.Queue("automation", {
    connection: {
        url: env_1.env.REDIS_URL,
    },
});
