"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveConversationLearning = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const core_1 = require("../runtime/core");
const PRIORITY_REINFORCEMENT = {
    HIGH: 0.24,
    MEDIUM: 0.16,
    LOW: 0.08,
};
const getMemoryEngine = () => core_1.container.has("IMemoryEngine") ? core_1.container.resolve("IMemoryEngine") : null;
const getMetricsEngine = () => core_1.container.has("IMetricsEngine") ? core_1.container.resolve("IMetricsEngine") : null;
const saveConversationLearning = async ({ businessId, clientId, input, output, embedding, priority, }) => {
    const startedAt = Date.now();
    try {
        const finalPriority = String(priority || "LOW").toUpperCase();
        const content = `User: ${input}\nAI: ${output}`;
        const reinforcementSeed = PRIORITY_REINFORCEMENT[finalPriority] || PRIORITY_REINFORCEMENT.LOW;
        if (!input || !output || content.length < 20) {
            return null;
        }
        const memoryEngine = getMemoryEngine();
        const existing = memoryEngine
            ? await memoryEngine.findFirstKnowledge(businessId, {
                clientId: clientId || null,
                content,
                sourceType: "AUTO_LEARN",
            })
            : await prisma_1.default.knowledgeBase.findFirst({
                where: {
                    businessId,
                    clientId: clientId || null,
                    content,
                    sourceType: "AUTO_LEARN",
                },
            });
        let result;
        if (existing) {
            result = memoryEngine
                ? await memoryEngine.updateKnowledge(businessId, existing.id, {
                    isActive: true,
                    priority: finalPriority,
                    embedding: existing.embedding || embedding,
                    reinforcementScore: {
                        increment: reinforcementSeed / 2,
                    },
                    lastReinforcedAt: new Date(),
                })
                : await prisma_1.default.knowledgeBase.update({
                    where: {
                        id: existing.id,
                    },
                    data: {
                        isActive: true,
                        priority: finalPriority,
                        embedding: existing.embedding || embedding,
                        reinforcementScore: {
                            increment: reinforcementSeed / 2,
                        },
                        lastReinforcedAt: new Date(),
                    },
                });
        }
        else {
            result = memoryEngine
                ? await memoryEngine.createKnowledge(businessId, {
                    clientId: clientId || null,
                    title: String(input).slice(0, 80),
                    content,
                    embedding,
                    sourceType: "AUTO_LEARN",
                    priority: finalPriority,
                    reinforcementScore: reinforcementSeed,
                    isActive: true,
                })
                : await prisma_1.default.knowledgeBase.create({
                    data: {
                        businessId,
                        clientId: clientId || null,
                        title: String(input).slice(0, 80),
                        content,
                        embedding,
                        sourceType: "AUTO_LEARN",
                        priority: finalPriority,
                        reinforcementScore: reinforcementSeed,
                        isActive: true,
                    },
                });
        }
        const metrics = getMetricsEngine();
        if (metrics) {
            metrics.recordKnowledgeMetric("import_latency", Date.now() - startedAt);
        }
        return result;
    }
    catch (error) {
        console.error("Knowledge Save Error:", error);
        return null;
    }
};
exports.saveConversationLearning = saveConversationLearning;
