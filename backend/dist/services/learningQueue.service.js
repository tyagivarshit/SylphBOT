"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueLearning = void 0;
const learningFilter_service_1 = require("./learningFilter.service");
const knowledgeIngestion_service_1 = require("./knowledgeIngestion.service");
const queue = [];
let processing = false;
const enqueueLearning = async (data) => {
    queue.push(data);
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
/* auto runner */
setInterval(processQueue, 3000);
