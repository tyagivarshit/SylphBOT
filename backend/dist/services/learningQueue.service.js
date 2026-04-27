"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shutdownLearningQueue = exports.initLearningQueue = exports.enqueueLearning = void 0;
const learningFilter_service_1 = require("./learningFilter.service");
const knowledgeIngestion_service_1 = require("./knowledgeIngestion.service");
const queue = [];
let processing = false;
const globalForLearningQueue = globalThis;
const enqueueLearning = async (data) => {
    queue.push(data);
    (0, exports.initLearningQueue)();
};
exports.enqueueLearning = enqueueLearning;
const processQueue = async () => {
    if (processing)
        return;
    processing = true;
    while (queue.length > 0) {
        const item = queue.shift();
        try {
            if (!(0, learningFilter_service_1.shouldLearn)(item.input, item.output))
                continue;
            await (0, knowledgeIngestion_service_1.ingestKnowledge)(item);
        }
        catch (err) {
            console.error("Queue processing error:", err);
        }
    }
    processing = false;
};
const initLearningQueue = () => {
    if (!globalForLearningQueue.__sylphLearningQueueInterval) {
        globalForLearningQueue.__sylphLearningQueueInterval = setInterval(processQueue, 3000);
    }
    return globalForLearningQueue.__sylphLearningQueueInterval;
};
exports.initLearningQueue = initLearningQueue;
const shutdownLearningQueue = () => {
    if (globalForLearningQueue.__sylphLearningQueueInterval) {
        clearInterval(globalForLearningQueue.__sylphLearningQueueInterval);
        globalForLearningQueue.__sylphLearningQueueInterval = undefined;
    }
};
exports.shutdownLearningQueue = shutdownLearningQueue;
