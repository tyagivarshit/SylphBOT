"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAutoLearning = void 0;
const learningQueue_service_1 = require("./learningQueue.service");
const processAutoLearning = async ({ businessId, message, aiReply, }) => {
    try {
        if (!message || !aiReply)
            return;
        await (0, learningQueue_service_1.enqueueLearning)({
            businessId,
            input: message,
            output: aiReply,
        });
    }
    catch (err) {
        console.error("Auto learning error:", err);
    }
};
exports.processAutoLearning = processAutoLearning;
