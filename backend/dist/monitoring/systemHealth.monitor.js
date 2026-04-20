"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemHealthSnapshot = void 0;
const queueHealth_service_1 = require("../services/queueHealth.service");
const systemHealth_service_1 = require("../services/systemHealth.service");
const getSystemHealthSnapshot = async () => {
    const [system, queues] = await Promise.all([
        (0, systemHealth_service_1.getSystemHealth)(),
        (0, queueHealth_service_1.getQueueHealth)(),
    ]);
    return {
        ...system,
        queues,
    };
};
exports.getSystemHealthSnapshot = getSystemHealthSnapshot;
