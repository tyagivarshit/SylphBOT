"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAutoLearning = void 0;
const knowledgeIngestion_service_1 = require("./knowledgeIngestion.service");
const learningFilter_service_1 = require("./learningFilter.service");
const processAutoLearning = async ({ businessId, clientId, message, aiReply, }) => {
    try {
        if (!message || !aiReply) {
            return;
        }
        if (!(0, learningFilter_service_1.shouldLearn)(message, aiReply)) {
            return;
        }
        await (0, knowledgeIngestion_service_1.ingestKnowledge)({
            businessId,
            clientId,
            input: message,
            output: aiReply,
        });
    }
    catch (err) {
        console.error("Auto learning error:", err);
    }
};
exports.processAutoLearning = processAutoLearning;
